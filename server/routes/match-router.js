const crypto = require('node:crypto');
const { Router } = require('express');
const mongoose = require('mongoose');
const Application = require('../models/Application.js');
const EventMember = require('../models/EventMember.js');
const Match = require('../models/Match.js');
const User = require('../models/User.js');
const Submission = require('../models/Submission.js');
const { userMini } = require('../models/User.js');
const { requireAuth, loadEvent, requireEventRole } = require('../middleware/auth.js');
const { serializeEvent, viewerContext } = require('../services/events.js');
const { notify } = require('../services/notify.js');
const { announceMilestone } = require('../services/discord.js');
const { asyncHandler, apiErrorHandler, httpError } = require('../utils/helpers.js');
const { generateMatches, scorePair, skippedAccountsWarning } = require('../../shared/matching.mjs');
const { LIMITS } = require('../../shared/constants.mjs');

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

// MatchAdmin (docs/ARCHITECTURE.md). giver/recipient must be populated.
function matchAdmin(match, submission = null) {
  return {
    id: match._id.toString(),
    giver: userMini(match.giver),
    recipient: userMini(match.recipient),
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
    .populate('recipient', USER_FIELDS);
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

// Who each person mustn't be matched with, and who they already made gifts for:
//   personal  their own block lists, applied both ways (private; organisers can't override them)
//   blocked   personal plus the organisers' "never pair these two" rules
//   previous  recipients from the same organisers' earlier exchanges (avoided when possible)
async function pairRules(event, userIds) {
  const ids = userIds.map(String);
  const inEvent = new Set(ids);
  const personal = new Map(ids.map((id) => [id, new Set()]));
  const users = await User.find({ _id: { $in: ids } }).select('blockedUsers');
  for (const user of users) {
    for (const other of user.blockedUsers || []) {
      const otherId = other.toString();
      if (!inEvent.has(otherId)) continue;
      personal.get(user._id.toString()).add(otherId);
      personal.get(otherId).add(user._id.toString());
    }
  }

  const blocked = new Map([...personal].map(([id, set]) => [id, new Set(set)]));
  for (const { a, b } of event.matchingRules?.avoidPairs || []) {
    const [x, y] = [String(a), String(b)];
    if (inEvent.has(x) && inEvent.has(y)) {
      blocked.get(x).add(y);
      blocked.get(y).add(x);
    }
  }

  const previous = new Map(ids.map((id) => [id, new Set()]));
  if (event.matchingRules?.avoidRepeats !== false) {
    const organisers = await EventMember.find({ event: event._id, roles: 'organizer' }).distinct('user');
    const earlier = (await EventMember.find({ user: { $in: organisers }, roles: 'organizer' }).distinct('event')).filter(
      (id) => !id.equals(event._id)
    );
    if (earlier.length) {
      const rows = await Match.find({ event: { $in: earlier }, published: true, giver: { $in: ids } }).select('giver recipient');
      for (const row of rows) previous.get(row.giver.toString())?.add(row.recipient.toString());
    }
  }
  return { personal, blocked, previous };
}

// The matching algorithm only sees types the event allows, so nobody is matched on
// something they couldn't submit. rules: from pairRules(), or leave out.
function toParticipant(application, allowedTypes, rules = null) {
  const allowed = new Set(allowedTypes);
  const id = (application.user?._id || application.user).toString();
  return {
    id,
    blockedIds: [...(rules?.blocked.get(id) || [])],
    previousRecipients: [...(rules?.previous.get(id) || [])],
    name: application.user ? userMini(application.user).displayName : '',
    canCreate: (application.canCreate || []).filter((t) => allowed.has(t)),
    wantsTypes: (application.wantsTypes || []).filter((t) => allowed.has(t)),
    cannotDraw: [...(application.cannotDraw || [])],
    likes: application.likes || '',
    avoid: application.avoid || '',
    characters: (application.offeredCharacters || [])
      .filter((c) => c && c._id)
      .map((c) => ({ id: c._id.toString(), name: c.name, species: c.species || '', tags: [...(c.tags || [])] })),
  };
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
  const event = req.event;
  if (event.status !== 'matching') {
    throw httpError(409, 'Close sign-ups before generating matches.', 'WRONG_STATUS');
  }

  const accepted = (
    await Application.find({ event: event._id, status: 'accepted' })
      .sort({ createdAt: 1 })
      .populate('user', `${USER_FIELDS} status`)
      .populate('offeredCharacters')
  ).filter((a) => a.user);
  // Deactivating withdraws sign-ups, but older ones can still be here; they can't make a gift
  const skipped = accepted.filter((a) => a.user.status === 'deactivated');
  const applications = accepted.filter((a) => a.user.status !== 'deactivated');

  const needed = Math.max(2, event.minParticipants || 2);
  if (applications.length < needed) {
    throw httpError(
      409,
      `You need at least ${needed} accepted participants to generate matches (there are ${applications.length}).`,
      'NOT_ENOUGH_PARTICIPANTS'
    );
  }

  const rawSeed = req.body?.seed;
  const given = rawSeed === undefined || rawSeed === null || rawSeed === '' ? NaN : Number(rawSeed);
  const seed = Number.isFinite(given) ? Math.floor(given) : crypto.randomInt(1, 2 ** 31 - 1);

  const rules = await pairRules(event, applications.map((a) => a.user._id));
  const result = generateMatches(
    applications.map((a) => toParticipant(a, event.allowedTypes, rules)),
    { seed }
  );

  const appByUser = new Map(applications.map((a) => [a.user._id.toString(), a]));
  await Match.deleteMany({ event: event._id, published: false });
  try {
    await Match.insertMany(
      result.pairs.map((p) => ({
        event: event._id,
        giver: p.giverId,
        recipient: p.recipientId,
        giverApplication: appByUser.get(p.giverId)._id,
        recipientApplication: appByUser.get(p.recipientId)._id,
        score: p.score,
        reasons: p.reasons,
        published: false,
        status: 'assigned',
      }))
    );
  } catch (err) {
    // Two generate requests at once: the other one's matches are already in
    if (err?.code === 11000) {
      throw httpError(409, 'Matches were just generated by someone else. Refresh to see them.', 'MATCHES_CHANGED');
    }
    throw err;
  }

  const warnings = [...result.warnings];
  if (skipped.length) warnings.push(skippedAccountsWarning(skipped.map((a) => userMini(a.user).displayName)));

  const { participants, matched, totalScore, averageScore, cycles, seed: usedSeed } = result.stats;
  res.json({
    matches: await adminMatchList(event._id),
    result: {
      unmatched: result.unmatched.map((id) => userMini(appByUser.get(id)?.user)),
      warnings,
      stats: { participants, matched, totalScore, averageScore, cycles, seed: usedSeed },
    },
  });
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
  const event = req.event;
  if (event.status !== 'matching') {
    throw httpError(409, 'Matches can only be published while the event is in matching.', 'WRONG_STATUS');
  }

  const [matches, acceptedRows] = await Promise.all([
    Match.find({ event: event._id, published: false }).populate('recipient', USER_FIELDS),
    Application.find({ event: event._id, status: 'accepted' }).populate('user', `${USER_FIELDS} status`),
  ]);
  if (!matches.length) throw httpError(409, 'Generate matches before publishing them.', 'NO_MATCHES');
  // Same people generate used: deactivated accounts were left out there
  const accepted = acceptedRows.filter((a) => a.user?.status !== 'deactivated');

  // Everyone accepted right now must give exactly once and receive exactly once
  const gives = new Map();
  const receives = new Map();
  for (const m of matches) {
    gives.set(m.giver.toString(), (gives.get(m.giver.toString()) || 0) + 1);
    const r = (m.recipient?._id || m.recipient).toString();
    receives.set(r, (receives.get(r) || 0) + 1);
  }
  const acceptedIds = new Set(accepted.map((a) => (a.user?._id || a.user).toString()));
  const notPlaced = accepted.filter((a) => {
    const id = (a.user?._id || a.user).toString();
    return gives.get(id) !== 1 || receives.get(id) !== 1;
  });
  const stale = [...gives.keys(), ...receives.keys()].some((id) => !acceptedIds.has(id));

  if (notPlaced.length) {
    const names = notPlaced.slice(0, 3).map((a) => userMini(a.user).displayName);
    const more = notPlaced.length > 3 ? ` and ${notPlaced.length - 3} more` : '';
    throw httpError(
      409,
      `Not every accepted participant has a match (${names.join(', ')}${more}). This happens when someone is accepted ` +
        "after matches were generated, or can't be matched. Generate matches again, or remove anyone who can't be placed.",
      'MATCHES_INCOMPLETE'
    );
  }
  if (stale) {
    throw httpError(
      409,
      'Some matches include people who are no longer accepted participants. Generate matches again.',
      'MATCHES_INCOMPLETE'
    );
  }

  // Claim the publish first so a double click can't publish (and notify) twice
  const claimed = await Match.updateMany({ event: event._id, published: false }, { $set: { published: true } });
  if (claimed.modifiedCount === 0) {
    throw httpError(409, 'These matches were already published.', 'ALREADY_PUBLISHED');
  }
  try {
    event.setStatus('active', req.user._id);
    event.publishedAt = new Date();
    await event.save();
  } catch (err) {
    await Match.updateMany({ event: event._id }, { $set: { published: false } });
    throw err;
  }

  announceMilestone(event, 'matches_out');
  const due = event.submissionDeadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const results = await Promise.allSettled(
    matches.map((m) =>
      notify(m.giver, {
        type: 'match_assigned',
        title: `Your match for ${event.name} is ready`,
        message: `You're making a gift for ${userMini(m.recipient).displayName}. It's due by ${due}.`,
        link: `/events/${event._id}/matches`,
        email: 'matches',
      })
    )
  );
  for (const r of results) {
    if (r.status === 'rejected') console.error('Match notification failed:', r.reason?.message);
  }

  res.json({ event: await serializeEvent(event, req.user), matches: await adminMatchList(event._id) });
}));

// The giver's view of their match: who they're making a gift for and what that person
// asked for. Never says who is making the viewer's own gift.
router.get('/my-match', requireAuth, loadEvent, requireParticipant, loadMyMatch, asyncHandler(async (req, res) => {
  const { event, match } = req;
  const [recipient, submission] = await Promise.all([
    mongoose.model('User').findById(match.recipient).select('displayName username avatarUrl email'),
    Submission.findOne({ match: match._id }),
  ]);
  const recipientApplication =
    (match.recipientApplication && (await Application.findById(match.recipientApplication).populate('offeredCharacters'))) ||
    (await Application.findOne({ event: event._id, user: match.recipient }).populate('offeredCharacters'));

  const mini = userMini(recipient);
  res.json({
    match: {
      id: match._id.toString(),
      status: match.status,
      submissionDeadline: event.submissionDeadline,
      recipient: {
        displayName: mini.displayName,
        username: mini.username,
        avatarUrl: mini.avatarUrl,
        communityUsername: recipientApplication?.communityUsername || '',
        wantsTypes: [...(recipientApplication?.wantsTypes || [])],
        likes: recipientApplication?.likes || '',
        avoid: recipientApplication?.avoid || '',
        // Archived characters stay visible: they were offered for this event
        characters: (recipientApplication?.offeredCharacters || []).filter(Boolean).map((c) => c.toPublic()),
      },
      submission: submission ? submission.toPublic() : null,
    },
  });
}));

router.use(apiErrorHandler);

module.exports = router;
module.exports.loadMatchRows = loadMatchRows;
module.exports.matchAdmin = matchAdmin;
module.exports.requireParticipant = requireParticipant;
module.exports.loadMyMatch = loadMyMatch;
module.exports.USER_FIELDS = USER_FIELDS;
