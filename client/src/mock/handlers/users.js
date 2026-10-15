// /users/:username: public artist profiles (server/routes/user-router.js)
import { isId } from '../db.js';
import { findUser, serializeEvent, userProfile } from '../model.js';
import { httpError } from '../util.js';

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
const PROFILE_EVENTS_MAX = 12;

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

export function register(router) {
  router.get('/users/:username', (ctx) => {
    const { state } = ctx;
    const viewer = ctx.currentUser();
    const user = findProfileUser(state, ctx.params.username);
    // Deactivated and banned accounts have no public profile
    if (!user || (user.status || 'active') !== 'active') throw notFound();

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

    return body;
  });
}
