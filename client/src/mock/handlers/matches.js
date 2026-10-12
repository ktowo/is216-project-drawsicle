// /events/:eventId/matches and /my-match (server/routes/match-router.js)
import { generateMatches, scorePair } from '@shared/matching.mjs';
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

// Matches of one event for organisers, sorted by giver name like the server does
export function adminMatches(state, eventId, { publishedOnly = false } = {}) {
  return state.matches
    .filter((m) => m.event === eventId && (!publishedOnly || m.published))
    .map((m) => ({ match: m, admin: matchAdmin(state, m) }))
    .sort((a, b) => byName(a.admin.giver.displayName, b.admin.giver.displayName));
}

const adminList = (state, eventId) => adminMatches(state, eventId).map((row) => row.admin);

// What the matching algorithm sees. Only types the event allows count, so nobody is
// matched on something they couldn't submit.
function toParticipant(state, application, allowedTypes) {
  const allowed = new Set(allowedTypes);
  return {
    id: application.user,
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

export function register(router) {
  router.post('/events/:eventId/matches/generate', (ctx) => {
    const { event } = organizerOnly(ctx);
    const { state } = ctx;
    if (event.status !== 'matching') throw httpError(409, 'Close sign-ups before generating matches.', 'WRONG_STATUS');

    const applications = state.applications
      .filter((a) => a.event === event.id && a.status === 'accepted' && findUser(state, a.user))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
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

    const result = generateMatches(
      applications.map((a) => toParticipant(state, a, event.allowedTypes)),
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

    const { participants, matched, totalScore, averageScore, cycles, seed: usedSeed } = result.stats;
    return {
      matches: adminList(state, event.id),
      result: {
        unmatched: result.unmatched.map((id) => miniOf(state, id)),
        warnings: result.warnings,
        stats: { participants, matched, totalScore, averageScore, cycles, seed: usedSeed },
      },
    };
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
    const accepted = state.applications.filter((a) => a.event === event.id && a.status === 'accepted');
    if (!matches.length) throw httpError(409, 'Generate matches before publishing them.', 'NO_MATCHES');

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
  router.get('/events/:eventId/my-match', (ctx) => {
    const { user, event } = participantEvent(ctx);
    const { state } = ctx;
    const match = myMatch(ctx, event, user);
    const recipientApplication =
      state.applications.find((a) => a.id === match.recipientApplication) ||
      state.applications.find((a) => a.event === event.id && a.user === match.recipient) ||
      null;
    const mini = userMini(findUser(state, match.recipient));
    const submission = submissionForMatch(state, match.id);

    return {
      match: {
        id: match.id,
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
          characters: (recipientApplication?.offeredCharacters || [])
            .map((id) => state.characters.find((c) => c.id === id))
            .filter(Boolean)
            .map((c) => characterPublic(c)),
        },
        submission: submission ? submissionPublic(submission) : null,
      },
    };
  });
}
