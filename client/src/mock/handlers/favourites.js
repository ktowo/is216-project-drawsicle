// /favourites: saved art (server/routes/favourite-router.js). You can save, and keep seeing, a
// gift you could see anyway: one in the public museum, or one from a finished exchange you
// organised or took part in.
import { isId } from '../db.js';
import { findUser, miniOf, submissionPublic } from '../model.js';
import { httpError } from '../util.js';
import { LIMITS } from '@shared/constants.mjs';

const shows = (state, id) => {
  const user = findUser(state, id);
  return Boolean(user && (user.status || 'active') === 'active' && user.profilePrivacy?.showGifts);
};

function canSee(state, user, submission) {
  const event = state.events.find((e) => e.id === submission.event);
  if (!event || event.status !== 'completed' || event.disabledAt) return false;
  const member = state.members.some(
    (m) => m.event === event.id && m.user === user.id && m.roles.some((r) => ['organizer', 'participant'].includes(r))
  );
  if (member) return true;
  return event.publicity === 'public' && shows(state, submission.giver) && shows(state, submission.recipient);
}

function item(state, submission, savedAt) {
  const event = state.events.find((e) => e.id === submission.event);
  const { id, title, type, images, thumbnails, imageDescriptions, contentWarnings, links, submittedAt } = submissionPublic(submission);
  return {
    submission: { id, title, type, images, thumbnails, imageDescriptions, contentWarnings, links, submittedAt },
    event: { id: event.id, name: event.name },
    giver: miniOf(state, submission.giver),
    recipient: miniOf(state, submission.recipient),
    savedAt,
  };
}

export function register(router) {
  router.get('/favourites', (ctx) => {
    const { state } = ctx;
    const user = ctx.requireAuth();
    const items = state.favourites
      .filter((f) => f.user === user.id)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((f) => ({ f, s: state.submissions.find((s) => s.id === f.submission) }))
      .filter(({ s }) => s && canSee(state, user, s))
      .map(({ f, s }) => item(state, s, f.createdAt));
    return { items, ids: items.map((i) => i.submission.id) };
  });

  router.put('/favourites/:submissionId', (ctx) => {
    const { state } = ctx;
    const user = ctx.requireAuth();
    const id = ctx.params.submissionId;
    const submission = isId(id) ? state.submissions.find((s) => s.id === id) : null;
    if (!submission || !canSee(state, user, submission)) throw httpError(404, "That gift isn't one you can see.", 'NOT_FOUND');
    const mine = state.favourites.filter((f) => f.user === user.id);
    if (!mine.some((f) => f.submission === id)) {
      if (mine.length >= LIMITS.favourites) {
        throw httpError(409, `You can save up to ${LIMITS.favourites} gifts. Unsave a few first.`, 'TOO_MANY');
      }
      state.favourites.push({ user: user.id, submission: id, createdAt: ctx.now.toISOString() });
    }
    return { saved: true };
  });

  router.delete('/favourites/:submissionId', (ctx) => {
    const { state } = ctx;
    const user = ctx.requireAuth();
    state.favourites = state.favourites.filter((f) => !(f.user === user.id && f.submission === ctx.params.submissionId));
    return { saved: false };
  });
}
