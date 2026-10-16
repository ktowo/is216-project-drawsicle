// /users/:username: public artist profiles (server/routes/user-router.js)
import { isId, newId } from '../db.js';
import { findUser, miniOf, notify, serializeEvent, submissionPublic, userMini, userProfile, userPublic } from '../model.js';
import { httpError } from '../util.js';
import { earnedBadges } from '@shared/badges.mjs';
import { LIMITS } from '@shared/constants.mjs';
import { followCounts, friendList, relation } from '../social.js';

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
export const isFinished = (event) => event.publicity === 'public' && event.status === 'completed' && !event.disabledAt;
const newestCompletedFirst = (a, b) =>
  String(b.completedAt || '').localeCompare(String(a.completedAt || '')) || b.id.localeCompare(a.id);

// Deactivated and banned accounts have no public profile
export function visibleProfileUser(state, handle) {
  const user = findProfileUser(state, handle);
  if (!user || (user.status || 'active') !== 'active') throw notFound();
  return user;
}

// Gifts this artist made that both they and the recipient agreed to show publicly,
// from finished public events, newest first
export function publicGifts(state, user) {
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

// Gifts they made in finished public events, as the facts shared/badges.mjs needs
export function badgeGifts(state, user) {
  return state.submissions
    .filter((s) => s.giver === user.id)
    .map((s) => ({ s, event: state.events.find((e) => e.id === s.event) }))
    .filter(({ event }) => event && isFinished(event))
    .map(({ s, event }) => ({
      event: event.id,
      late: Boolean(s.late),
      type: s.type,
      thanked: Boolean(s.thanks?.at),
      asBackup: state.matches.find((m) => m.id === s.match)?.giver !== user.id,
    }));
}

// Badges for a public profile or card. Hidden exchanges stay hidden: no badges that hint at them.
export function profileBadges(state, user) {
  const organized = new Set(
    state.members.filter((m) => m.user === user.id && m.roles.includes('organizer')).map((m) => m.event)
  );
  const eventsRun = state.events.filter((e) => organized.has(e.id) && isFinished(e)).length;
  const showExchanges = user.profilePrivacy?.showExchanges !== false;
  return earnedBadges({ eventsRun, gifts: showExchanges ? badgeGifts(state, user) : null });
}

// The compact card used by Discover and hover cards (server/services/artists.js). viewer may be null.
export function artistCard(state, user, viewer) {
  const showExchanges = user.profilePrivacy?.showExchanges !== false;
  const card = {
    user: userMini(user),
    artistTags: userPublic(user).artistTags,
    badges: profileBadges(state, user),
    gifts: publicGifts(state, user)
      .slice(0, 3)
      .map((s) => {
        const { id, title, images, thumbnails, imageDescriptions, contentWarnings } = submissionPublic(s);
        return {
          id,
          title,
          image: thumbnails?.[0] || images[0] || null,
          alt: imageDescriptions?.[0] || '',
          contentWarnings: contentWarnings || [],
        };
      }),
  };
  if (showExchanges) {
    const joined = new Set(
      state.applications.filter((a) => a.user === user.id && a.status === 'accepted').map((a) => a.event)
    );
    card.exchangesCompleted = state.events.filter((e) => joined.has(e.id) && isFinished(e)).length;
  }
  if (viewer) card.following = viewer.id !== user.id && Boolean(relation(state, viewer.id, user.id)?.following);
  return card;
}

// What the gallery shows of a gift: never the private note to the recipient or the organisers' checks
function giftItem(state, submission, giver) {
  const { id, title, type, images, thumbnails, imageDescriptions, contentWarnings, links, submittedAt } =
    submissionPublic(submission);
  const event = state.events.find((e) => e.id === submission.event);
  return {
    submission: { id, title, type, images, thumbnails, imageDescriptions, contentWarnings, links, submittedAt },
    event: { id: event.id, name: event.name },
    giver: userMini(giver),
    recipient: miniOf(state, submission.recipient),
  };
}

export function register(router) {
  // ---------- Following (user-router.js) ----------
  router.post('/users/:username/follow', (ctx) => {
    const { state } = ctx;
    const me = ctx.requireAuth();
    const user = visibleProfileUser(state, ctx.params.username);
    if (user.id === me.id) throw httpError(400, "You can't follow yourself.", 'VALIDATION');
    if (!state.follows.some((f) => f.follower === me.id && f.following === user.id)) {
      if (state.follows.filter((f) => f.follower === me.id).length >= LIMITS.following) {
        throw httpError(400, `You can follow up to ${LIMITS.following} people.`, 'VALIDATION');
      }
      state.follows.push({ id: newId(), follower: me.id, following: user.id, createdAt: ctx.now.toISOString() });
      const link = me.username ? `/users/${me.username}` : '/friends';
      notify(state, user.id, relation(state, me.id, user.id).friends
        ? { type: 'new_friend', title: `You and ${me.displayName} are friends now`, message: 'You follow each other.', link }
        : { type: 'new_follower', title: `${me.displayName} followed you`, message: 'Follow them back to become friends.', link });
    }
    return { viewer: relation(state, me.id, user.id), stats: followCounts(state, user.id) };
  });

  router.delete('/users/:username/follow', (ctx) => {
    const { state } = ctx;
    const me = ctx.requireAuth();
    const user = visibleProfileUser(state, ctx.params.username);
    state.follows = state.follows.filter((f) => !(f.follower === me.id && f.following === user.id));
    return { viewer: relation(state, me.id, user.id), stats: followCounts(state, user.id) };
  });

  // ---------- The friend list (friends-router.js) ----------
  router.get('/friends', (ctx) => friendList(ctx.state, ctx.requireAuth().id));

  // The small card shown when you hover or focus someone's name (and on Discover)
  router.get('/users/:username/card', (ctx) => {
    const user = visibleProfileUser(ctx.state, ctx.params.username);
    return { card: artistCard(ctx.state, user, ctx.currentUser()) };
  });

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

    const showExchanges = user.profilePrivacy?.showExchanges !== false;
    const body = {
      profile: { ...userProfile(user), createdAt: user.createdAt },
      organizing: newestFirst.slice(0, PROFILE_EVENTS_MAX).map((event) => serializeEvent(state, event, viewer)),
      stats: { eventsOrganized: listed.length, ...followCounts(state, user.id) },
      badges: earnedBadges({
        eventsRun: listed.filter(isFinished).length,
        gifts: showExchanges ? badgeGifts(state, user) : null,
      }),
    };

    // Exchanges they took part in, unless they chose to keep that to themselves
    if (showExchanges) {
      const joinedIds = new Set(
        state.applications.filter((a) => a.user === user.id && a.status === 'accepted').map((a) => a.event)
      );
      const joined = state.events.filter((e) => joinedIds.has(e.id) && isFinished(e)).sort(newestCompletedFirst);
      body.exchanges = joined.slice(0, PROFILE_EVENTS_MAX).map((event) => serializeEvent(state, event, viewer));
      body.stats.exchangesCompleted = joined.length;
    }

    body.hasGifts = publicGifts(state, user).length > 0;
    if (viewer && viewer.id !== user.id) {
      body.viewer = { blocked: (viewer.blockedUsers || []).includes(user.id), ...relation(state, viewer.id, user.id) };
    }
    return body;
  });
}
