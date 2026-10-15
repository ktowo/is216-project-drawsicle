// /users/:username: public artist profiles (server/routes/user-router.js)
import { isId } from '../db.js';
import { findUser, miniOf, serializeEvent, submissionPublic, userMini, userProfile } from '../model.js';
import { httpError } from '../util.js';

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
const PROFILE_EVENTS_MAX = 12;
const GIFTS_PAGE = 12;
const GIFTS_PAGE_MAX = 48;

const notFound = () => httpError(404, "We couldn't find that artist.", 'USER_NOT_FOUND');

// By username (any case); an id works too, for links made before someone picked a username
function findProfileUser(state, handle) {
  const value = String(handle || '').trim().toLowerCase().replace(/^@/, '');
  let user = null;
  if (USERNAME_RE.test(value)) user = state.users.find((u) => u.username === value) || null;
  if (!user && isId(value)) user = findUser(state, value);
  return user;
}

const isListed = (event) => event.publicity === 'public' && event.status !== 'draft';
// Exchanges and gifts only ever come from finished public events
const isFinished = (event) => event.publicity === 'public' && event.status === 'completed' && !event.disabledAt;
const newestCompletedFirst = (a, b) =>
  String(b.completedAt || '').localeCompare(String(a.completedAt || '')) || b.id.localeCompare(a.id);

// Deactivated and banned accounts have no public profile
function visibleProfileUser(state, handle) {
  const user = findProfileUser(state, handle);
  if (!user || (user.status || 'active') !== 'active') throw notFound();
  return user;
}

// Gifts this artist made that both they and the recipient agreed to show publicly,
// from finished public events, newest first
function publicGifts(state, user) {
  if (!user.profilePrivacy?.showGifts) return [];
  const agreed = (id) => {
    const recipient = findUser(state, id);
    return Boolean(recipient && (recipient.status || 'active') === 'active' && recipient.profilePrivacy?.showGifts);
  };
  const finished = (id) => {
    const event = state.events.find((e) => e.id === id);
    return Boolean(event && isFinished(event));
  };
  return state.submissions
    .filter((s) => s.giver === user.id && finished(s.event) && agreed(s.recipient))
    .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)) || b.id.localeCompare(a.id));
}

// What the gallery shows of a gift: never the private note to the recipient or the organisers' checks
function giftItem(state, submission, giver) {
  const { id, title, type, images, links, submittedAt } = submissionPublic(submission);
  const event = state.events.find((e) => e.id === submission.event);
  return {
    submission: { id, title, type, images, links, submittedAt },
    event: { id: event.id, name: event.name },
    giver: userMini(giver),
    recipient: miniOf(state, submission.recipient),
  };
}

export function register(router) {
  router.get('/users/:username/gifts', (ctx) => {
    const { state } = ctx;
    const limit = Math.min(Math.max(Number(ctx.query.limit) || GIFTS_PAGE, 1), GIFTS_PAGE_MAX);
    let before = null;
    if (ctx.query.before) {
      before = new Date(String(ctx.query.before));
      if (Number.isNaN(before.getTime())) throw httpError(400, 'before must be a date.', 'VALIDATION');
    }
    const user = visibleProfileUser(state, ctx.params.username);
    const gifts = publicGifts(state, user).filter((s) => !before || new Date(s.submittedAt) < before);
    return { items: gifts.slice(0, limit).map((s) => giftItem(state, s, user)), hasMore: gifts.length > limit };
  });

  router.get('/users/:username', (ctx) => {
    const { state } = ctx;
    const viewer = ctx.currentUser();
    const user = visibleProfileUser(state, ctx.params.username);

    const organizedIds = new Set(
      state.members.filter((m) => m.user === user.id && m.roles.includes('organizer')).map((m) => m.event)
    );
    const listed = state.events.filter((e) => organizedIds.has(e.id) && isListed(e));
    const newestFirst = [...listed].sort(
      (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id.localeCompare(a.id)
    );

    const body = {
      profile: { ...userProfile(user), createdAt: user.createdAt },
      organizing: newestFirst.slice(0, PROFILE_EVENTS_MAX).map((event) => serializeEvent(state, event, viewer)),
      stats: { eventsOrganized: listed.length },
    };

    // Exchanges they took part in, unless they chose to keep that to themselves
    if (user.profilePrivacy?.showExchanges !== false) {
      const joinedIds = new Set(
        state.applications.filter((a) => a.user === user.id && a.status === 'accepted').map((a) => a.event)
      );
      const joined = state.events.filter((e) => joinedIds.has(e.id) && isFinished(e)).sort(newestCompletedFirst);
      body.exchanges = joined.slice(0, PROFILE_EVENTS_MAX).map((event) => serializeEvent(state, event, viewer));
      body.stats.exchangesCompleted = joined.length;
    }

    body.hasGifts = publicGifts(state, user).length > 0;
    if (viewer && viewer.id !== user.id) body.viewer = { blocked: (viewer.blockedUsers || []).includes(user.id) };
    return body;
  });
}
