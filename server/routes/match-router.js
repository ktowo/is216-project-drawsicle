const { Router } = require('express');
const mongoose = require('mongoose');
const Application = require('../models/Application.js');
const Match = require('../models/Match.js');
const Submission = require('../models/Submission.js');
const { userMini } = require('../models/User.js');
const { requireAuth, loadEvent, requireEventRole } = require('../middleware/auth.js');
const { serializeEvent, viewerContext } = require('../services/events.js');
const { notify, notifyMany } = require('../services/notify.js');
const { asyncHandler, apiErrorHandler, httpError } = require('../utils/helpers.js');
const { scorePair, MATCH_MODES } = require('../../shared/matching.mjs');
const { pairRules, toParticipant, generateForEvent, publishForEvent, scanStyles, runAutoMatch } = require('../services/match-making.js');
const { LIMITS, PROGRESS_VALUES } = require('../../shared/constants.mjs');
const { readQuestion, readAnswer, askingProblem, questionJson } = require('../../shared/gift-questions.mjs');
const StyleProfile = require('../models/StyleProfile.js');
const Event = require('../models/Event.js');
const { STYLE_MODES } = require('../../shared/style.mjs');
const { visionStatus } = require('../services/vision.js');
const { waitUntil } = require('@vercel/functions');

// Mounted at /api/events/:eventId. Every route names its own middleware, because the
// application and submission routers share this mount point.
const router = Router({ mergeParams: true });

const USER_FIELDS = 'displayName username avatarUrl email';
const organizerOnly = [requireAuth, loadEvent, requireEventRole('organizer')];

function byDisplayName(a, b) {
  return a.localeCompare(b, 'en', { sensitivity: 'base' });
}

function submissionSummary(submission) {
  if (!submission) return null;
  return {
    id: submission._id.toString(),
    submittedAt: submission.submittedAt,
    late: Boolean(submission.late),
    verified: Boolean(submission.verified),
  };
}

function progressJson(match) {
  const p = match.progress;
  return p?.stage ? { stage: p.stage, note: p.note || '', at: p.at } : null;
}

// MatchAdmin (docs/ARCHITECTURE.md). giver/recipient (and backupGiver) must be populated.
function matchAdmin(match, submission = null) {
  return {
    id: match._id.toString(),
    giver: userMini(match.giver),
    recipient: userMini(match.recipient),
    backupGiver: match.backupGiver ? userMini(match.backupGiver) : null,
    progress: progressJson(match),
    score: match.score,
    reasons: [...(match.reasons || [])],
    status: match.status,
    published: Boolean(match.published),
    submission: submissionSummary(submission),
  };
}

// Matches of one event for organisers, sorted by giver name, each with its submission (or null).
//   rows: [{ match: Match doc, submission: Submission doc | null, admin: MatchAdmin }]
async function loadMatchRows(eventId, filter = {}) {
  const matches = await Match.find({ event: eventId, ...filter })
    .populate('giver', USER_FIELDS)
    .populate('recipient', USER_FIELDS)
    .populate('backupGiver', USER_FIELDS);
  const submissions = matches.length
    ? await Submission.find({ event: eventId, match: { $in: matches.map((m) => m._id) } })
    : [];
  const byMatch = new Map(submissions.map((s) => [s.match.toString(), s]));
  return matches
    .map((match) => {
      const submission = byMatch.get(match._id.toString()) || null;
      return { match, submission, admin: matchAdmin(match, submission) };
    })
    .sort((a, b) => byDisplayName(a.admin.giver.displayName, b.admin.giver.displayName));
}

async function adminMatchList(eventId) {
  const rows = await loadMatchRows(eventId);
  return rows.map((r) => r.admin);
}

// Guards shared with the submission router -------------------------------------------

// Must be an accepted participant. Sets req.viewer.
const requireParticipant = asyncHandler(async (req, res, next) => {
  req.viewer = await viewerContext(req.event, req.user);
  if (!req.viewer.isParticipant) {
    throw httpError(403, 'Only accepted participants can do that in this event.', 'ACCESS_DENIED');
  }
  next();
});

// My published match as a giver. Sets req.match.
const loadMyMatch = asyncHandler(async (req, res, next) => {
  if (!['active', 'completed'].includes(req.event.status)) {
    throw httpError(404, "Matches haven't been published for this event yet.", 'NO_MATCH');
  }
  const match = await Match.findOne({ event: req.event._id, giver: req.user._id, published: true });
  if (!match) throw httpError(404, "You don't have a match in this event.", 'NO_MATCH');
  req.match = match;
  next();
});

// Routes -----------------------------------------------------------------------------

router.post('/matches/generate', ...organizerOnly, asyncHandler(async (req, res) => {
  const mode = req.body?.mode === undefined ? 'best' : req.body.mode;
  const { result } = await generateForEvent(req.event, { seed: req.body?.seed, mode });
  res.json({ matches: await adminMatchList(req.event._id), result });
}));

// Automatic matching: once sign-ups close, the event checks art styles, makes matches and
// publishes them (or leaves them for review) by itself (services/match-making.js)
router.put('/auto-match', ...organizerOnly, asyncHandler(async (req, res) => {
  const event = req.event;
  if (!['draft', 'open', 'matching'].includes(event.status)) {
    throw httpError(409, 'Matches are already published, so there is nothing left to match.', 'WRONG_STATUS');
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const update = {};
  for (const key of ['enabled', 'publish']) {
    if (body[key] === undefined) continue;
    if (typeof body[key] !== 'boolean') throw httpError(400, `${key} must be true or false.`, 'VALIDATION');
    update[`autoMatch.${key}`] = body[key];
  }
  if (body.mode !== undefined) {
    if (!MATCH_MODES.includes(body.mode)) throw httpError(400, `mode must be one of: ${MATCH_MODES.join(', ')}.`, 'VALIDATION');
    update['autoMatch.mode'] = body.mode;
  }
  await Event.updateOne({ _id: event._id }, { $set: update });
  res.json({ event: await serializeEvent(await Event.findById(event._id), req.user) });
}));

// Run automatic matching now, without waiting for the deadline job
router.post('/auto-match/run', ...organizerOnly, asyncHandler(async (req, res) => {
  const event = req.event;
  if (event.status !== 'matching') {
    throw httpError(409, 'Close sign-ups first; automatic matching runs once they are closed.', 'WRONG_STATUS');
  }
  const run = await runAutoMatch(event);
  const fresh = await Event.findById(event._id);
  res.json({ run, event: await serializeEvent(fresh, req.user), matches: await adminMatchList(event._id) });
}));

// The organisers' matching rules: people to keep apart, and whether to avoid repeat pairs
router.put('/matching-rules', ...organizerOnly, asyncHandler(async (req, res) => {
  const event = req.event;
  if (!['draft', 'open', 'matching'].includes(event.status)) {
    throw httpError(409, 'Matches are already published, so the rules no longer apply.', 'WRONG_STATUS');
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const update = {};
  if (body.avoidRepeats !== undefined) {
    if (typeof body.avoidRepeats !== 'boolean') throw httpError(400, 'avoidRepeats must be true or false.', 'VALIDATION');
    update['matchingRules.avoidRepeats'] = body.avoidRepeats;
  }
  if (body.style !== undefined) {
    if (!STYLE_MODES.includes(body.style)) throw httpError(400, `style must be one of: ${STYLE_MODES.join(', ')}.`, 'VALIDATION');
    update['matchingRules.style'] = body.style;
  }
  if (body.avoidPairs !== undefined) {
    if (!Array.isArray(body.avoidPairs)) throw httpError(400, 'avoidPairs must be a list.', 'VALIDATION');
    if (body.avoidPairs.length > LIMITS.avoidPairs) {
      throw httpError(400, `Keep it to ${LIMITS.avoidPairs} pairs.`, 'VALIDATION');
    }
    const signedUp = new Set((await Application.find({ event: event._id }).distinct('user')).map(String));
    const seen = new Set();
    const pairs = [];
    for (const pair of body.avoidPairs) {
      const a = String(pair?.a ?? '');
      const b = String(pair?.b ?? '');
      if (!signedUp.has(a) || !signedUp.has(b)) {
        throw httpError(400, 'Pick two people who signed up for this event.', 'VALIDATION');
      }
      if (a === b) throw httpError(400, 'Pick two different people.', 'VALIDATION');
      const key = [a, b].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ a, b });
    }
    update['matchingRules.avoidPairs'] = pairs;
  }
  await event.constructor.updateOne({ _id: event._id }, { $set: update });
  const fresh = await event.constructor.findById(event._id);
  res.json({ event: await serializeEvent(fresh, req.user) });
}));

router.get('/matches', ...organizerOnly, asyncHandler(async (req, res) => {
  const matches = await adminMatchList(req.event._id);
  res.json({ matches, published: matches.length > 0 && matches.every((m) => m.published) });
}));

// Swap the recipients of two matches (organiser fine-tuning before publishing)
router.post('/matches/swap', ...organizerOnly, asyncHandler(async (req, res) => {
  const event = req.event;
  if (event.publishedAt || (await Match.exists({ event: event._id, published: true }))) {
    throw httpError(409, 'Matches are already published, so they can no longer be changed.', 'ALREADY_PUBLISHED');
  }
  if (event.status !== 'matching') {
    throw httpError(409, 'Matches can only be changed while the event is in matching.', 'WRONG_STATUS');
  }

  const { matchIdA, matchIdB } = req.body || {};
  if (!mongoose.isValidObjectId(matchIdA) || !mongoose.isValidObjectId(matchIdB)) {
    throw httpError(404, 'Match not found.', 'NOT_FOUND');
  }
  if (String(matchIdA) === String(matchIdB)) {
    throw httpError(400, 'Pick two different matches to swap.', 'VALIDATION');
  }

  const [a, b] = await Promise.all([
    Match.findOne({ _id: matchIdA, event: event._id, published: false }),
    Match.findOne({ _id: matchIdB, event: event._id, published: false }),
  ]);
  if (!a || !b) throw httpError(404, 'Match not found.', 'NOT_FOUND');

  if (a.giver.equals(b.recipient) || b.giver.equals(a.recipient)) {
    throw httpError(400, 'That swap would have someone making a gift for themselves.', 'SELF_MATCH');
  }
  // Someone's own block list always wins, without saying whose list it is
  const { personal } = await pairRules(event, [a.giver, a.recipient, b.giver, b.recipient]);
  if (personal.get(a.giver.toString()).has(b.recipient.toString()) || personal.get(b.giver.toString()).has(a.recipient.toString())) {
    throw httpError(409, "One of these people asked not to be matched with the other, so this swap isn't possible.", 'BLOCKED_PAIR');
  }

  const ids = [a.giverApplication, a.recipientApplication, b.giverApplication, b.recipientApplication].filter(Boolean);
  const applications = await Application.find({ _id: { $in: ids } }).populate('offeredCharacters');
  const appById = new Map(applications.map((x) => [x._id.toString(), x]));
  const participantFor = (applicationId, userId) => {
    const application = applicationId && appById.get(applicationId.toString());
    return application
      ? toParticipant(application, event.allowedTypes)
      : { id: userId.toString(), canCreate: [], wantsTypes: [], cannotDraw: [], characters: [] };
  };

  const giverA = participantFor(a.giverApplication, a.giver);
  const giverB = participantFor(b.giverApplication, b.giver);
  const recipientA = participantFor(a.recipientApplication, a.recipient);
  const recipientB = participantFor(b.recipientApplication, b.recipient);

  const rescore = (match, giver, recipient, recipientUser, recipientApplication) => {
    const fit = scorePair(giver, recipient);
    match.recipient = recipientUser;
    match.recipientApplication = recipientApplication;
    match.score = fit.score;
    // An organiser can force a pair the algorithm wouldn't make; say what doesn't fit
    match.reasons = fit.ok ? fit.reasons : fit.blockers.map((text) => `Heads up: ${text.toLowerCase()}`);
  };

  const oldRecipientA = a.recipient;
  const oldRecipientAppA = a.recipientApplication;
  rescore(a, giverA, recipientB, b.recipient, b.recipientApplication);
  rescore(b, giverB, recipientA, oldRecipientA, oldRecipientAppA);
  await Promise.all([a.save(), b.save()]);

  res.json({ matches: await adminMatchList(event._id) });
}));

router.post('/matches/publish', ...organizerOnly, asyncHandler(async (req, res) => {
  await publishForEvent(req.event, req.user._id);
  res.json({ event: await serializeEvent(req.event, req.user), matches: await adminMatchList(req.event._id) });
}));

// The giver's view of their match: who they're making a gift for and what that person
// asked for. Never says who is making the viewer's own gift.
// What the person making a gift sees: who it's for, their wishes and characters, and the gift so far.
// For the original giver of a match that was handed to a backup, handedOver is true.
async function myMatchJson(event, match, { asBackup = false } = {}) {
  const [recipient, submission] = await Promise.all([
    mongoose.model('User').findById(match.recipient).select('displayName username avatarUrl email'),
    Submission.findOne({ match: match._id }),
  ]);
  const recipientApplication =
    (match.recipientApplication && (await Application.findById(match.recipientApplication).populate('offeredCharacters'))) ||
    (await Application.findOne({ event: event._id, user: match.recipient }).populate('offeredCharacters'));

  const mini = userMini(recipient);
  return {
    id: match._id.toString(),
    status: match.status,
    asBackup,
    handedOver: !asBackup && Boolean(match.backupGiver),
    progress: progressJson(match),
    submissionDeadline: event.submissionDeadline,
    recipient: {
      displayName: mini.displayName,
      username: mini.username,
      avatarUrl: mini.avatarUrl,
      communityUsername: recipientApplication?.communityUsername || '',
      wantsTypes: [...(recipientApplication?.wantsTypes || [])],
      likes: recipientApplication?.likes || '',
      adoptWishlist: recipientApplication?.adoptWishlist || '',
      avoid: recipientApplication?.avoid || '',
      // Archived characters stay visible: they were offered for this event
      characters: (recipientApplication?.offeredCharacters || []).filter(Boolean).map((c) => c.toPublic()),
    },
    // The original giver doesn't see the backup's gift
    submission: submission && (asBackup || !match.backupGiver) ? submission.toPublic() : null,
    questions: (match.questions || []).map(questionJson),
  };
}

router.get('/my-match', requireAuth, loadEvent, requireParticipant, loadMyMatch, asyncHandler(async (req, res) => {
  res.json({ match: await myMatchJson(req.event, req.match) });
}));

// ---------- Progress check-ins ----------

const requireActiveEvent = (req, res, next) =>
  req.event.status === 'active' ? next() : next(httpError(409, 'Progress can only be shared while gifts are being made.', 'WRONG_STATUS'));

async function saveProgress(req, res) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const stage = String(body.stage ?? '');
  if (!PROGRESS_VALUES.includes(stage)) throw httpError(400, 'Pick how far along you are.', 'VALIDATION');
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > LIMITS.progressNote) {
    throw httpError(400, `Keep the note under ${LIMITS.progressNote} characters.`, 'VALIDATION');
  }
  req.match.progress = { stage, note, at: new Date() };
  await req.match.save();
  res.json({ progress: progressJson(req.match) });
}

const rejectIfHandedOver = (req, res, next) =>
  req.match.backupGiver
    ? next(httpError(409, 'This gift was handed to a backup artist, so you no longer need to make it.', 'HANDED_OVER'))
    : next();

router.put('/my-match/progress', requireAuth, loadEvent, requireParticipant, loadMyMatch, rejectIfHandedOver, requireActiveEvent, asyncHandler(saveProgress));

// ---------- Asking the recipient ----------
// The person making a gift can ask its recipient a few questions ("warm or cool colours?").
// The recipient answers on the event page and never learns who asked.

const questionsOpen = (req, res, next) =>
  req.event.status === 'active'
    ? next()
    : next(httpError(409, 'Questions can only be asked and answered while gifts are being made.', 'WRONG_STATUS'));

async function askQuestion(req, res) {
  const { text, error } = readQuestion(req.body?.text);
  if (error) throw httpError(400, error, 'VALIDATION');
  const problem = askingProblem(req.match.questions);
  if (problem) throw httpError(409, problem, 'TOO_MANY_QUESTIONS');
  req.match.questions.push({ text, askedBy: req.user._id, askedAt: new Date() });
  await req.match.save();
  const question = req.match.questions[req.match.questions.length - 1];
  await notify(req.match.recipient, {
    type: 'gift_question',
    title: 'Your secret artist has a question',
    message: `About your gift in ${req.event.name}: "${text.length > 200 ? `${text.slice(0, 199)}…` : text}"`,
    link: `/events/${req.event._id}#gift-questions`,
  }).catch((e) => console.error('Question notification failed:', e.message));
  res.status(201).json({ question: questionJson(question), questions: req.match.questions.map(questionJson) });
}

router.post('/my-match/questions', requireAuth, loadEvent, requireParticipant, loadMyMatch, rejectIfHandedOver, questionsOpen, asyncHandler(askQuestion));

// The match whose gift is for the viewer
async function matchForMe(req) {
  if (!['active', 'completed'].includes(req.event.status)) return null;
  return Match.findOne({ event: req.event._id, recipient: req.user._id, published: true });
}

router.get('/questions-for-me', requireAuth, loadEvent, requireParticipant, asyncHandler(async (req, res) => {
  const match = await matchForMe(req);
  res.json({ questions: (match?.questions || []).map(questionJson), canAnswer: req.event.status === 'active' });
}));

router.post('/questions-for-me/:questionId/answer', requireAuth, loadEvent, requireParticipant, questionsOpen, asyncHandler(async (req, res) => {
  const match = await matchForMe(req);
  const question = match && mongoose.isValidObjectId(req.params.questionId) ? match.questions.id(req.params.questionId) : null;
  if (!question) throw httpError(404, "That question isn't for you.", 'NOT_FOUND');
  const { text, error } = readAnswer(req.body?.answer);
  if (error) throw httpError(400, error, 'VALIDATION');
  const first = !question.answer;
  question.answer = text;
  question.answeredAt = new Date();
  await match.save();
  // Whoever is making the gift now hears back (a backup artist, if one took it over)
  const maker = match.backupGiver || match.giver;
  const link = match.backupGiver ? `/events/${req.event._id}/matches?backup=${match._id}` : `/events/${req.event._id}/matches`;
  if (first) {
    await notify(maker, {
      type: 'gift_answer',
      title: `${userMini(req.user).displayName} answered your question`,
      message: `"${question.text.length > 120 ? `${question.text.slice(0, 119)}…` : question.text}"`,
      link,
    }).catch((e) => console.error('Answer notification failed:', e.message));
  }
  res.json({ question: questionJson(question) });
}));

// ---------- Backup artists ----------
// Accepted participants who ticked "I can be a backup" can take over a gift whose giver dropped
// out. The organisers pick them; the backup then sees the recipient and submits the gift.

// A match the viewer is the backup for. Sets req.match.
const loadBackupMatch = asyncHandler(async (req, res, next) => {
  const { matchId } = req.params;
  const missing = () => httpError(404, "You aren't making a backup gift for that match.", 'NO_MATCH');
  if (!mongoose.isValidObjectId(matchId)) throw missing();
  const match = await Match.findOne({ _id: matchId, event: req.event._id, backupGiver: req.user._id, published: true });
  if (!match) throw missing();
  req.match = match;
  next();
});

router.get('/backups/mine', requireAuth, loadEvent, requireParticipant, asyncHandler(async (req, res) => {
  const matches = await Match.find({ event: req.event._id, backupGiver: req.user._id, published: true });
  res.json({ backups: await Promise.all(matches.map((m) => myMatchJson(req.event, m, { asBackup: true }))) });
}));

router.get('/backups/:matchId', requireAuth, loadEvent, requireParticipant, loadBackupMatch, asyncHandler(async (req, res) => {
  res.json({ match: await myMatchJson(req.event, req.match, { asBackup: true }) });
}));

router.put('/backups/:matchId/progress', requireAuth, loadEvent, requireParticipant, loadBackupMatch, requireActiveEvent, asyncHandler(saveProgress));
router.post('/backups/:matchId/questions', requireAuth, loadEvent, requireParticipant, loadBackupMatch, questionsOpen, asyncHandler(askQuestion));

// Volunteers for one match, for the organisers' "Find a backup" list
router.get('/backups/volunteers/:matchId', ...organizerOnly, asyncHandler(async (req, res) => {
  const { matchId } = req.params;
  if (!mongoose.isValidObjectId(matchId)) throw httpError(404, 'Match not found.', 'NOT_FOUND');
  const match = await Match.findOne({ _id: matchId, event: req.event._id });
  if (!match) throw httpError(404, 'Match not found.', 'NOT_FOUND');

  const volunteers = await Application.find({ event: req.event._id, status: 'accepted', canBackup: true }).populate(
    'user',
    `${USER_FIELDS} status`
  );
  const people = volunteers.filter(
    (a) => a.user && a.user.status === 'active' && !a.user._id.equals(match.giver) && !a.user._id.equals(match.recipient)
  );
  const ids = people.map((a) => a.user._id);
  const [ownMatches, backingUp] = await Promise.all([
    Match.find({ event: req.event._id, giver: { $in: ids }, published: true }).select('_id giver'),
    Match.find({ event: req.event._id, backupGiver: { $in: ids } }).select('backupGiver'),
  ]);
  const submitted = new Set(
    (await Submission.find({ match: { $in: ownMatches.map((m) => m._id) } }).select('match')).map((s) => s.match.toString())
  );
  const ownByGiver = new Map(ownMatches.map((m) => [m.giver.toString(), m._id.toString()]));
  res.json({
    volunteers: people.map((a) => {
      const id = a.user._id.toString();
      return {
        user: userMini(a.user),
        submittedOwn: submitted.has(ownByGiver.get(id)),
        backingUp: backingUp.filter((m) => m.backupGiver.toString() === id).length,
      };
    }),
  });
}));

async function loadPublishedMatch(req) {
  const { matchId } = req.params;
  const missing = () => httpError(404, 'Match not found.', 'NOT_FOUND');
  if (!mongoose.isValidObjectId(matchId)) throw missing();
  const match = await Match.findOne({ _id: matchId, event: req.event._id, published: true });
  if (!match) throw missing();
  if (req.event.status !== 'active') {
    throw httpError(409, 'Backups can only be arranged while gifts are being made.', 'WRONG_STATUS');
  }
  if (await Submission.exists({ match: match._id })) {
    throw httpError(409, 'This gift has already been submitted.', 'ALREADY_SUBMITTED');
  }
  return match;
}

router.put('/matches/:matchId/backup', ...organizerOnly, asyncHandler(async (req, res) => {
  const { event } = req;
  const match = await loadPublishedMatch(req);
  const userId = String(req.body?.userId ?? '');
  if (!mongoose.isValidObjectId(userId)) throw httpError(400, 'Pick a volunteer.', 'VALIDATION');
  if (match.giver.equals(userId) || match.recipient.equals(userId)) {
    throw httpError(400, "That person can't make this gift.", 'VALIDATION');
  }
  const volunteer = await Application.findOne({ event: event._id, user: userId, status: 'accepted', canBackup: true });
  if (!volunteer) throw httpError(400, "That person didn't volunteer as a backup in this event.", 'VALIDATION');

  const previousBackup = match.backupGiver;
  match.backupGiver = userId;
  match.backupAssignedAt = new Date();
  match.progress = { stage: '', note: '', at: null };
  await match.save();
  await match.populate('recipient', USER_FIELDS);
  const recipientName = userMini(match.recipient).displayName;

  const tasks = [
    notify(userId, {
      type: 'backup_assigned',
      title: `Thank you! You're making a backup gift in ${event.name}`,
      message: `You're making a gift for ${recipientName}. It's a secret, just like your own. Gifts are due ${event.submissionDeadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.`,
      link: `/events/${event.id}/matches?backup=${match.id}`,
      email: 'matches',
    }),
  ];
  if (!previousBackup) {
    tasks.push(
      notify(match.giver, {
        type: 'event_status',
        title: `Your gift for ${event.name} was handed to a backup artist`,
        message: "The organisers found someone else to make it, so you don't need to any more. If that's a mistake, ask them.",
        link: `/events/${event.id}/matches`,
      })
    );
  } else if (!previousBackup.equals(userId)) {
    tasks.push(
      notify(previousBackup, {
        type: 'event_status',
        title: `You're no longer making a backup gift in ${event.name}`,
        message: 'The organisers asked someone else. Thanks for offering!',
        link: `/events/${event.id}`,
      })
    );
  }
  const results = await Promise.allSettled(tasks);
  for (const r of results) if (r.status === 'rejected') console.error('Backup notification failed:', r.reason?.message);

  res.json({ matches: await adminMatchList(event._id) });
}));

router.delete('/matches/:matchId/backup', ...organizerOnly, asyncHandler(async (req, res) => {
  const match = await loadPublishedMatch(req);
  if (!match.backupGiver) throw httpError(404, 'This gift has no backup artist.', 'NOT_FOUND');
  const backup = match.backupGiver;
  match.backupGiver = null;
  match.backupAssignedAt = null;
  await match.save();
  await Promise.allSettled([
    notifyMany([backup], {
      type: 'event_status',
      title: `You're no longer making a backup gift in ${req.event.name}`,
      message: 'The original artist is making it after all. Thanks for offering!',
      link: `/events/${req.event.id}`,
    }),
    notify(match.giver, {
      type: 'event_status',
      title: `Your gift for ${req.event.name} is yours again`,
      message: 'The organisers handed it back to you.',
      link: `/events/${req.event.id}/matches`,
    }),
  ]);
  res.json({ matches: await adminMatchList(req.event._id) });
}));

// ---------- Art style scan ----------
// Works out a style profile for everyone accepted (services/vision.js), in the background. The
// organisers' page polls GET for progress. Colour analysis always runs; the vision model joins in
// when it's reachable.

const styleScanJson = async (event) => {
  const users = await Application.find({ event: event._id, status: 'accepted' }).distinct('user');
  const withStyle = await StyleProfile.countDocuments({ user: { $in: users }, analysedAt: { $ne: null } });
  return { scan: event.styleScan || null, profiles: { withStyle, total: users.length }, vision: await visionStatus() };
};

router.get('/matches/style-scan', ...organizerOnly, asyncHandler(async (req, res) => {
  res.json(await styleScanJson(req.event));
}));

// Each accepted participant's art style as the scan worked it out (descriptions only, never
// their pictures), for the organisers' Art styles tab. A style preference they gave at sign-up
// is shown too.
router.get('/matches/style-profiles', ...organizerOnly, asyncHandler(async (req, res) => {
  const apps = await Application.find({ event: req.event._id, status: 'accepted' })
    .select('user stylePreference')
    .populate('user', 'displayName username avatarUrl status');
  const people = apps.filter((a) => a.user);
  const profiles = await StyleProfile.find({ user: { $in: people.map((a) => a.user._id) } });
  const byUser = new Map(profiles.map((p) => [p.user.toString(), p.toPublic()]));
  res.json({
    people: people
      .map((a) => ({ user: userMini(a.user), preference: a.stylePreference || 'any', style: byUser.get(a.user._id.toString()) || null }))
      .sort((x, y) => x.user.displayName.localeCompare(y.user.displayName)),
  });
}));

router.post('/matches/style-scan', ...organizerOnly, asyncHandler(async (req, res) => {
  const event = req.event;
  if (!['open', 'matching'].includes(event.status)) {
    throw httpError(409, 'Styles can be scanned while sign-ups are open or during matching.', 'WRONG_STATUS');
  }
  const scan = event.styleScan;
  // A scan that has been "running" for over 10 minutes was cut off; start again
  if (scan?.status === 'running' && Date.now() - new Date(scan.startedAt).getTime() < 10 * 60 * 1000) {
    return res.status(202).json(await styleScanJson(event));
  }
  // Mark it running before answering, so the page shows progress straight away
  const total = await Application.countDocuments({ event: event._id, status: 'accepted' });
  await Event.updateOne(
    { _id: event._id },
    { $set: { styleScan: { status: 'running', total, done: 0, failed: 0, withVision: false, startedAt: new Date(), finishedAt: null } } }
  );
  const work = scanStyles(event, { force: req.body?.force === true }).catch((err) => console.error('Style scan stopped:', err.message));
  waitUntil(work); // on Vercel, keep going after the response

  res.status(202).json(await styleScanJson(await Event.findById(event._id)));
}));

router.use(apiErrorHandler);

module.exports = router;
module.exports.loadMatchRows = loadMatchRows;
module.exports.matchAdmin = matchAdmin;
module.exports.requireParticipant = requireParticipant;
module.exports.loadMyMatch = loadMyMatch;
module.exports.loadBackupMatch = loadBackupMatch;
module.exports.rejectIfHandedOver = rejectIfHandedOver;
module.exports.USER_FIELDS = USER_FIELDS;
