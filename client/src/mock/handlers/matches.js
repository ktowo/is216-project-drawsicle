// /events/:eventId/matches and /my-match (server/routes/match-router.js)
import { generateMatches, scorePair, skippedAccountsWarning } from '@shared/matching.mjs';
import { LIMITS, PROGRESS_VALUES } from '@shared/constants.mjs';
import { newId } from '../db.js';
import {
  characterPublic,
  findUser,
  matchAdmin,
  miniOf,
  notify,
  serializeEvent,
  setStatus,
  submissionForMatch,
  submissionPublic,
  userMini,
} from '../model.js';
import { byName, formatDay, httpError, invalid } from '../util.js';
import { myMatch, participantEvent, roleEvent } from './common.js';
import { STYLE_MODES } from '@shared/style.mjs';
import { readQuestion, readAnswer, askingProblem, questionJson } from '@shared/gift-questions.mjs';

// Matches of one event for organisers, sorted by giver name like the server does
export function adminMatches(state, eventId, { publishedOnly = false } = {}) {
  return state.matches
    .filter((m) => m.event === eventId && (!publishedOnly || m.published))
    .map((m) => ({ match: m, admin: matchAdmin(state, m) }))
    .sort((a, b) => byName(a.admin.giver.displayName, b.admin.giver.displayName));
}

const adminList = (state, eventId) => adminMatches(state, eventId).map((row) => row.admin);

// Who mustn't be matched with whom (block lists both ways, plus the organisers' rules) and
// earlier pairs from the same organisers' exchanges. Same as pairRules() on the server.
function pairRules(state, event, userIds) {
  const ids = new Set(userIds);
  const personal = new Map(userIds.map((id) => [id, new Set()]));
  for (const id of userIds) {
    for (const other of findUser(state, id)?.blockedUsers || []) {
      if (!ids.has(other)) continue;
      personal.get(id).add(other);
      personal.get(other).add(id);
    }
  }
  const blocked = new Map([...personal].map(([id, set]) => [id, new Set(set)]));
  for (const { a, b } of event.matchingRules?.avoidPairs || []) {
    if (ids.has(a) && ids.has(b)) {
      blocked.get(a).add(b);
      blocked.get(b).add(a);
    }
  }
  const previous = new Map(userIds.map((id) => [id, new Set()]));
  if (event.matchingRules?.avoidRepeats !== false) {
    const organisers = new Set(
      state.members.filter((m) => m.event === event.id && m.roles.includes('organizer')).map((m) => m.user)
    );
    const earlier = new Set(
      state.members
        .filter((m) => organisers.has(m.user) && m.roles.includes('organizer') && m.event !== event.id)
        .map((m) => m.event)
    );
    for (const m of state.matches) {
      if (m.published && earlier.has(m.event)) previous.get(m.giver)?.add(m.recipient);
    }
  }
  return { personal, blocked, previous };
}

// What the matching algorithm sees. Only types the event allows count, so nobody is
// matched on something they couldn't submit.
function toParticipant(state, application, allowedTypes, rules = null) {
  const allowed = new Set(allowedTypes);
  return {
    id: application.user,
    blockedIds: [...(rules?.blocked.get(application.user) || [])],
    previousRecipients: [...(rules?.previous.get(application.user) || [])],
    name: miniOf(state, application.user).displayName,
    canCreate: application.canCreate.filter((t) => allowed.has(t)),
    wantsTypes: application.wantsTypes.filter((t) => allowed.has(t)),
    cannotDraw: [...(application.cannotDraw || [])],
    likes: application.likes || '',
    avoid: application.avoid || '',
    characters: application.offeredCharacters
      .map((id) => state.characters.find((c) => c.id === id))
      .filter(Boolean)
      .map((c) => ({ id: c.id, name: c.name, species: c.species || '', tags: [...(c.tags || [])] })),
  };
}

function randomSeed() {
  if (globalThis.crypto?.getRandomValues) {
    return (globalThis.crypto.getRandomValues(new Uint32Array(1))[0] % (2 ** 31 - 2)) + 1;
  }
  return Math.floor(Math.random() * (2 ** 31 - 2)) + 1;
}

const organizerOnly = (ctx) => roleEvent(ctx, 'organizer');

// A match the viewer is the backup for
export function backupMatch(ctx, event, user) {
  const match = ctx.state.matches.find(
    (m) => m.id === ctx.params.matchId && m.event === event.id && m.backupGiver === user.id && m.published
  );
  if (!match) throw httpError(404, "You aren't making a backup gift for that match.", 'NO_MATCH');
  return match;
}

export function register(router) {
  // Scanning art styles needs the real server (it looks at the pictures there)
  router.get('/events/:eventId/matches/style-scan', (ctx) => {
    const { event } = organizerOnly(ctx);
    const total = ctx.state.applications.filter((a) => a.event === event.id && a.status === 'accepted').length;
    return { scan: null, profiles: { withStyle: 0, total }, vision: { configured: false, reachable: false }, demo: true };
  });
  router.post('/events/:eventId/matches/style-scan', (ctx) => {
    organizerOnly(ctx);
    throw httpError(501, 'Scanning art styles needs the real server, so it is not part of the demo.', 'NOT_IN_DEMO');
  });

  router.post('/events/:eventId/matches/generate', (ctx) => {
    const { event } = organizerOnly(ctx);
    const { state } = ctx;
    if (event.status !== 'matching') throw httpError(409, 'Close sign-ups before generating matches.', 'WRONG_STATUS');

    const accepted = state.applications
      .filter((a) => a.event === event.id && a.status === 'accepted' && findUser(state, a.user))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    // Deactivating withdraws sign-ups, but older ones can still be here; they can't make a gift
    const skipped = accepted.filter((a) => findUser(state, a.user).status === 'deactivated');
    const applications = accepted.filter((a) => findUser(state, a.user).status !== 'deactivated');
    const needed = Math.max(2, event.minParticipants || 2);
    if (applications.length < needed) {
      throw httpError(
        409,
        `You need at least ${needed} accepted participants to generate matches (there are ${applications.length}).`,
        'NOT_ENOUGH_PARTICIPANTS'
      );
    }

    const rawSeed = ctx.body.seed;
    const given = rawSeed === undefined || rawSeed === null || rawSeed === '' ? NaN : Number(rawSeed);
    const seed = Number.isFinite(given) ? Math.floor(given) : randomSeed();

    const rules = pairRules(state, event, applications.map((a) => a.user));
    const result = generateMatches(
      applications.map((a) => toParticipant(state, a, event.allowedTypes, rules)),
      { seed }
    );

    const appByUser = new Map(applications.map((a) => [a.user, a]));
    const at = ctx.now.toISOString();
    state.matches = state.matches.filter((m) => !(m.event === event.id && !m.published));
    for (const p of result.pairs) {
      state.matches.push({
        id: newId(),
        event: event.id,
        giver: p.giverId,
        recipient: p.recipientId,
        giverApplication: appByUser.get(p.giverId).id,
        recipientApplication: appByUser.get(p.recipientId).id,
        score: p.score,
        reasons: [...p.reasons],
        published: false,
        status: 'assigned',
        createdAt: at,
        updatedAt: at,
      });
    }

    const warnings = [...result.warnings];
    if (skipped.length) warnings.push(skippedAccountsWarning(skipped.map((a) => miniOf(state, a.user).displayName)));

    const { participants, matched, totalScore, averageScore, cycles, seed: usedSeed } = result.stats;
    return {
      matches: adminList(state, event.id),
      result: {
        unmatched: result.unmatched.map((id) => miniOf(state, id)),
        warnings,
        stats: { participants, matched, totalScore, averageScore, cycles, seed: usedSeed },
      },
    };
  });

  router.put('/events/:eventId/matching-rules', (ctx) => {
    const { user, event } = organizerOnly(ctx);
    const { state } = ctx;
    if (!['draft', 'open', 'matching'].includes(event.status)) {
      throw httpError(409, 'Matches are already published, so the rules no longer apply.', 'WRONG_STATUS');
    }
    const body = ctx.body || {};
    const rules = {
      avoidPairs: [...(event.matchingRules?.avoidPairs || [])],
      avoidRepeats: event.matchingRules?.avoidRepeats !== false,
      style: event.matchingRules?.style || 'off',
    };
    if (body.style !== undefined) {
      if (!STYLE_MODES.includes(body.style)) throw invalid(`style must be one of: ${STYLE_MODES.join(', ')}.`);
      rules.style = body.style;
    }
    if (body.avoidRepeats !== undefined) {
      if (typeof body.avoidRepeats !== 'boolean') throw invalid('avoidRepeats must be true or false.');
      rules.avoidRepeats = body.avoidRepeats;
    }
    if (body.avoidPairs !== undefined) {
      if (!Array.isArray(body.avoidPairs)) throw invalid('avoidPairs must be a list.');
      if (body.avoidPairs.length > LIMITS.avoidPairs) throw invalid(`Keep it to ${LIMITS.avoidPairs} pairs.`);
      const signedUp = new Set(state.applications.filter((x) => x.event === event.id).map((x) => x.user));
      const seen = new Set();
      rules.avoidPairs = [];
      for (const pair of body.avoidPairs) {
        const a = String(pair?.a ?? '');
        const b = String(pair?.b ?? '');
        if (!signedUp.has(a) || !signedUp.has(b)) throw invalid('Pick two people who signed up for this event.');
        if (a === b) throw invalid('Pick two different people.');
        const key = [a, b].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        rules.avoidPairs.push({ a, b });
      }
    }
    event.matchingRules = rules;
    event.updatedAt = ctx.now.toISOString();
    return { event: serializeEvent(state, event, user) };
  });

  router.get('/events/:eventId/matches', (ctx) => {
    const { event } = organizerOnly(ctx);
    const matches = adminList(ctx.state, event.id);
    return { matches, published: matches.length > 0 && matches.every((m) => m.published) };
  });

  // Swap the recipients of two matches (organiser fine-tuning before publishing)
  router.post('/events/:eventId/matches/swap', (ctx) => {
    const { event } = organizerOnly(ctx);
    const { state } = ctx;
    if (event.publishedAt || state.matches.some((m) => m.event === event.id && m.published)) {
      throw httpError(409, 'Matches are already published, so they can no longer be changed.', 'ALREADY_PUBLISHED');
    }
    if (event.status !== 'matching') {
      throw httpError(409, 'Matches can only be changed while the event is in matching.', 'WRONG_STATUS');
    }

    const { matchIdA, matchIdB } = ctx.body;
    if (typeof matchIdA !== 'string' || typeof matchIdB !== 'string') throw httpError(404, 'Match not found.', 'NOT_FOUND');
    if (matchIdA === matchIdB) throw invalid('Pick two different matches to swap.');
    const find = (id) => state.matches.find((m) => m.id === id && m.event === event.id && !m.published);
    const a = find(matchIdA);
    const b = find(matchIdB);
    if (!a || !b) throw httpError(404, 'Match not found.', 'NOT_FOUND');

    if (a.giver === b.recipient || b.giver === a.recipient) {
      throw httpError(400, 'That swap would have someone making a gift for themselves.', 'SELF_MATCH');
    }
    const { personal } = pairRules(state, event, [...new Set([a.giver, a.recipient, b.giver, b.recipient])]);
    if (personal.get(a.giver).has(b.recipient) || personal.get(b.giver).has(a.recipient)) {
      throw httpError(409, "One of these people asked not to be matched with the other, so this swap isn't possible.", 'BLOCKED_PAIR');
    }

    const participantFor = (applicationId, userId) => {
      const application = state.applications.find((x) => x.id === applicationId);
      return application
        ? toParticipant(state, application, event.allowedTypes)
        : { id: userId, canCreate: [], wantsTypes: [], cannotDraw: [], characters: [] };
    };
    const giverA = participantFor(a.giverApplication, a.giver);
    const giverB = participantFor(b.giverApplication, b.giver);
    const recipientA = participantFor(a.recipientApplication, a.recipient);
    const recipientB = participantFor(b.recipientApplication, b.recipient);

    const at = ctx.now.toISOString();
    const rescore = (match, giver, recipient, recipientUser, recipientApplication) => {
      const fit = scorePair(giver, recipient);
      match.recipient = recipientUser;
      match.recipientApplication = recipientApplication;
      match.score = fit.score;
      // An organiser can force a pair the algorithm wouldn't make; say what doesn't fit
      match.reasons = fit.ok ? fit.reasons : fit.blockers.map((text) => `Heads up: ${text.toLowerCase()}`);
      match.updatedAt = at;
    };
    const oldRecipientA = a.recipient;
    const oldRecipientAppA = a.recipientApplication;
    rescore(a, giverA, recipientB, b.recipient, b.recipientApplication);
    rescore(b, giverB, recipientA, oldRecipientA, oldRecipientAppA);

    return { matches: adminList(state, event.id) };
  });

  router.post('/events/:eventId/matches/publish', (ctx) => {
    const { user, event } = organizerOnly(ctx);
    const { state } = ctx;
    if (event.status !== 'matching') {
      throw httpError(409, 'Matches can only be published while the event is in matching.', 'WRONG_STATUS');
    }

    const matches = state.matches.filter((m) => m.event === event.id && !m.published);
    if (!matches.length) throw httpError(409, 'Generate matches before publishing them.', 'NO_MATCHES');
    // Same people generate used: deactivated accounts were left out there
    const accepted = state.applications.filter(
      (a) => a.event === event.id && a.status === 'accepted' && findUser(state, a.user)?.status !== 'deactivated'
    );

    // Everyone accepted right now must give exactly once and receive exactly once
    const gives = new Map();
    const receives = new Map();
    for (const m of matches) {
      gives.set(m.giver, (gives.get(m.giver) || 0) + 1);
      receives.set(m.recipient, (receives.get(m.recipient) || 0) + 1);
    }
    const acceptedIds = new Set(accepted.map((a) => a.user));
    const notPlaced = accepted.filter((a) => gives.get(a.user) !== 1 || receives.get(a.user) !== 1);
    const stale = [...gives.keys(), ...receives.keys()].some((id) => !acceptedIds.has(id));

    if (notPlaced.length) {
      const names = notPlaced.slice(0, 3).map((a) => miniOf(state, a.user).displayName);
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

    const at = ctx.now.toISOString();
    for (const m of matches) {
      m.published = true;
      m.updatedAt = at;
    }
    setStatus(event, 'active', user.id);
    event.publishedAt = at;

    const due = formatDay(event.submissionDeadline);
    for (const m of matches) {
      notify(state, m.giver, {
        type: 'match_assigned',
        title: `Your match for ${event.name} is ready`,
        message: `You're making a gift for ${miniOf(state, m.recipient).displayName}. It's due by ${due}.`,
        link: `/events/${event.id}/matches`,
      });
    }

    return { event: serializeEvent(state, event, user), matches: adminList(state, event.id) };
  });

  // The giver's view of their match: who they're making a gift for and what that person
  // asked for. Never says who is making the viewer's own gift.
  // What the person making a gift sees (their own match, or one they took over as a backup)
  function myMatchJson(state, event, match, { asBackup = false } = {}) {
    const recipientApplication =
      state.applications.find((a) => a.id === match.recipientApplication) ||
      state.applications.find((a) => a.event === event.id && a.user === match.recipient) ||
      null;
    const mini = userMini(findUser(state, match.recipient));
    const submission = submissionForMatch(state, match.id);

    return {
      id: match.id,
      status: match.status,
      asBackup,
      handedOver: !asBackup && Boolean(match.backupGiver),
      progress: match.progress?.stage ? { stage: match.progress.stage, note: match.progress.note || '', at: match.progress.at } : null,
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
        characters: (recipientApplication?.offeredCharacters || [])
          .map((id) => state.characters.find((c) => c.id === id))
          .filter(Boolean)
          .map((c) => characterPublic(c)),
      },
      submission: submission && (asBackup || !match.backupGiver) ? submissionPublic(submission) : null,
      questions: (match.questions || []).map(questionJson),
    };
  }

  router.get('/events/:eventId/my-match', (ctx) => {
    const { user, event } = participantEvent(ctx);
    return { match: myMatchJson(ctx.state, event, myMatch(ctx, event, user)) };
  });

  // ---------- Progress check-ins ----------

  function saveProgress(ctx, event, match) {
    if (event.status !== 'active') throw httpError(409, 'Progress can only be shared while gifts are being made.', 'WRONG_STATUS');
    const stage = String(ctx.body.stage ?? '');
    if (!PROGRESS_VALUES.includes(stage)) throw invalid('Pick how far along you are.');
    const note = typeof ctx.body.note === 'string' ? ctx.body.note.trim() : '';
    if (note.length > LIMITS.progressNote) throw invalid(`Keep the note under ${LIMITS.progressNote} characters.`);
    match.progress = { stage, note, at: ctx.now.toISOString() };
    return { progress: { ...match.progress } };
  }

  router.put('/events/:eventId/my-match/progress', (ctx) => {
    const { user, event } = participantEvent(ctx);
    const match = myMatch(ctx, event, user);
    if (match.backupGiver) {
      throw httpError(409, 'This gift was handed to a backup artist, so you no longer need to make it.', 'HANDED_OVER');
    }
    return saveProgress(ctx, event, match);
  });

  // ---------- Asking the recipient (anonymously) ----------

  const questionsOpen = (event) => {
    if (event.status !== 'active') {
      throw httpError(409, 'Questions can only be asked and answered while gifts are being made.', 'WRONG_STATUS');
    }
  };
  const clip = (text, n) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

  function askQuestion(ctx, event, match, user) {
    questionsOpen(event);
    const { text, error } = readQuestion(ctx.body?.text);
    if (error) throw invalid(error);
    match.questions ||= [];
    const problem = askingProblem(match.questions);
    if (problem) throw httpError(409, problem, 'TOO_MANY_QUESTIONS');
    const question = { id: newId(), text, askedBy: user.id, askedAt: ctx.now.toISOString(), answer: '', answeredAt: null };
    match.questions.push(question);
    notify(ctx.state, match.recipient, {
      type: 'gift_question',
      title: 'Your secret artist has a question',
      message: `About your gift in ${event.name}: "${clip(text, 200)}"`,
      link: `/events/${event.id}#gift-questions`,
    });
    ctx.status = 201;
    return { question: questionJson(question), questions: match.questions.map(questionJson) };
  }

  router.post('/events/:eventId/my-match/questions', (ctx) => {
    const { user, event } = participantEvent(ctx);
    const match = myMatch(ctx, event, user);
    if (match.backupGiver) {
      throw httpError(409, 'This gift was handed to a backup artist, so you no longer need to make it.', 'HANDED_OVER');
    }
    return askQuestion(ctx, event, match, user);
  });

  router.post('/events/:eventId/backups/:matchId/questions', (ctx) => {
    const { user, event } = participantEvent(ctx);
    return askQuestion(ctx, event, backupMatch(ctx, event, user), user);
  });

  const matchForMe = (state, event, user) =>
    ['active', 'completed'].includes(event.status)
      ? state.matches.find((m) => m.event === event.id && m.recipient === user.id && m.published) || null
      : null;

  router.get('/events/:eventId/questions-for-me', (ctx) => {
    const { user, event } = participantEvent(ctx);
    const match = matchForMe(ctx.state, event, user);
    return { questions: (match?.questions || []).map(questionJson), canAnswer: event.status === 'active' };
  });

  router.post('/events/:eventId/questions-for-me/:questionId/answer', (ctx) => {
    const { user, event } = participantEvent(ctx);
    questionsOpen(event);
    const match = matchForMe(ctx.state, event, user);
    const question = match?.questions?.find((q) => q.id === ctx.params.questionId);
    if (!question) throw httpError(404, "That question isn't for you.", 'NOT_FOUND');
    const { text, error } = readAnswer(ctx.body?.answer);
    if (error) throw invalid(error);
    const first = !question.answer;
    Object.assign(question, { answer: text, answeredAt: ctx.now.toISOString() });
    if (first) {
      notify(ctx.state, match.backupGiver || match.giver, {
        type: 'gift_answer',
        title: `${miniOf(ctx.state, user.id).displayName} answered your question`,
        message: `"${clip(question.text, 120)}"`,
        link: match.backupGiver ? `/events/${event.id}/matches?backup=${match.id}` : `/events/${event.id}/matches`,
      });
    }
    return { question: questionJson(question) };
  });

  // ---------- Backup artists ----------

  router.get('/events/:eventId/backups/mine', (ctx) => {
    const { user, event } = participantEvent(ctx);
    const { state } = ctx;
    const matches = state.matches.filter((m) => m.event === event.id && m.backupGiver === user.id && m.published);
    return { backups: matches.map((m) => myMatchJson(state, event, m, { asBackup: true })) };
  });

  router.get('/events/:eventId/backups/volunteers/:matchId', (ctx) => {
    const { event } = organizerOnly(ctx);
    const { state } = ctx;
    const match = state.matches.find((m) => m.id === ctx.params.matchId && m.event === event.id);
    if (!match) throw httpError(404, 'Match not found.', 'NOT_FOUND');
    const volunteers = state.applications.filter(
      (a) =>
        a.event === event.id &&
        a.status === 'accepted' &&
        a.canBackup &&
        a.user !== match.giver &&
        a.user !== match.recipient &&
        (findUser(state, a.user)?.status || 'active') === 'active'
    );
    return {
      volunteers: volunteers.map((a) => {
        const own = state.matches.find((m) => m.event === event.id && m.giver === a.user && m.published);
        return {
          user: miniOf(state, a.user),
          submittedOwn: Boolean(own && submissionForMatch(state, own.id)),
          backingUp: state.matches.filter((m) => m.event === event.id && m.backupGiver === a.user).length,
        };
      }),
    };
  });

  router.get('/events/:eventId/backups/:matchId', (ctx) => {
    const { user, event } = participantEvent(ctx);
    const match = backupMatch(ctx, event, user);
    return { match: myMatchJson(ctx.state, event, match, { asBackup: true }) };
  });

  router.put('/events/:eventId/backups/:matchId/progress', (ctx) => {
    const { user, event } = participantEvent(ctx);
    return saveProgress(ctx, event, backupMatch(ctx, event, user));
  });

  function publishedMatchForBackup(ctx, event) {
    const { state } = ctx;
    const match = state.matches.find((m) => m.id === ctx.params.matchId && m.event === event.id && m.published);
    if (!match) throw httpError(404, 'Match not found.', 'NOT_FOUND');
    if (event.status !== 'active') throw httpError(409, 'Backups can only be arranged while gifts are being made.', 'WRONG_STATUS');
    if (submissionForMatch(state, match.id)) throw httpError(409, 'This gift has already been submitted.', 'ALREADY_SUBMITTED');
    return match;
  }

  router.put('/events/:eventId/matches/:matchId/backup', (ctx) => {
    const { event } = organizerOnly(ctx);
    const { state } = ctx;
    const match = publishedMatchForBackup(ctx, event);
    const userId = String(ctx.body.userId ?? '');
    if (match.giver === userId || match.recipient === userId) throw invalid("That person can't make this gift.");
    const volunteer = state.applications.find(
      (a) => a.event === event.id && a.user === userId && a.status === 'accepted' && a.canBackup
    );
    if (!volunteer) throw invalid("That person didn't volunteer as a backup in this event.");
    const previous = match.backupGiver;
    match.backupGiver = userId;
    match.backupAssignedAt = ctx.now.toISOString();
    match.progress = null;
    const recipientName = miniOf(state, match.recipient).displayName;
    notify(state, userId, {
      type: 'backup_assigned',
      title: `Thank you! You're making a backup gift in ${event.name}`,
      message: `You're making a gift for ${recipientName}. It's a secret, just like your own. Gifts are due ${formatDay(event.submissionDeadline)}.`,
      link: `/events/${event.id}/matches?backup=${match.id}`,
    });
    if (!previous) {
      notify(state, match.giver, {
        type: 'event_status',
        title: `Your gift for ${event.name} was handed to a backup artist`,
        message: "The organisers found someone else to make it, so you don't need to any more. If that's a mistake, ask them.",
        link: `/events/${event.id}/matches`,
      });
    } else if (previous !== userId) {
      notify(state, previous, {
        type: 'event_status',
        title: `You're no longer making a backup gift in ${event.name}`,
        message: 'The organisers asked someone else. Thanks for offering!',
        link: `/events/${event.id}`,
      });
    }
    return { matches: adminList(state, event.id) };
  });

  router.delete('/events/:eventId/matches/:matchId/backup', (ctx) => {
    const { event } = organizerOnly(ctx);
    const { state } = ctx;
    const match = publishedMatchForBackup(ctx, event);
    if (!match.backupGiver) throw httpError(404, 'This gift has no backup artist.', 'NOT_FOUND');
    notify(state, match.backupGiver, {
      type: 'event_status',
      title: `You're no longer making a backup gift in ${event.name}`,
      message: 'The original artist is making it after all. Thanks for offering!',
      link: `/events/${event.id}`,
    });
    notify(state, match.giver, {
      type: 'event_status',
      title: `Your gift for ${event.name} is yours again`,
      message: 'The organisers handed it back to you.',
      link: `/events/${event.id}/matches`,
    });
    match.backupGiver = null;
    match.backupAssignedAt = null;
    return { matches: adminList(state, event.id) };
  });
}
