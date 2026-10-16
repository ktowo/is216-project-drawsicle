// Following and friends in the demo (server/services/social.js)
import { findUser, miniOf } from './model.js';
import { cleanLook } from '@shared/looks.mjs';

const FRESH_MS = 40 * 1000;

export function relation(state, viewerId, otherId) {
  if (!viewerId || !otherId || viewerId === otherId) return null;
  const following = state.follows.some((f) => f.follower === viewerId && f.following === otherId);
  const followsYou = state.follows.some((f) => f.follower === otherId && f.following === viewerId);
  return { following, followsYou, friends: following && followsYou };
}

export function followCounts(state, userId) {
  return {
    followers: state.follows.filter((f) => f.following === userId).length,
    following: state.follows.filter((f) => f.follower === userId).length,
  };
}

export function whereabouts(state, userId, now = Date.now()) {
  const row = state.presence.find((p) => p.user === userId && now - new Date(p.updatedAt).getTime() < FRESH_MS);
  return row ? { label: row.label, link: row.link } : null;
}

export function friendList(state, userId) {
  const active = (id) => {
    const u = findUser(state, id);
    return Boolean(u && (u.status || 'active') === 'active');
  };
  const out = state.follows.filter((f) => f.follower === userId && active(f.following));
  const inc = state.follows.filter((f) => f.following === userId && active(f.follower));
  const outIds = new Set(out.map((f) => f.following));
  const incIds = new Set(inc.map((f) => f.follower));
  const entry = (id, since) => ({
    user: { ...miniOf(state, id), look: cleanLook(findUser(state, id)?.museumLook) },
    since,
    online: whereabouts(state, id),
  });
  const byName = (a, b) =>
    Number(Boolean(b.online)) - Number(Boolean(a.online)) || a.user.displayName.localeCompare(b.user.displayName);
  return {
    friends: out.filter((f) => incIds.has(f.following)).map((f) => entry(f.following, f.createdAt)).sort(byName),
    following: out.filter((f) => !incIds.has(f.following)).map((f) => entry(f.following, f.createdAt)).sort(byName),
    followers: inc.filter((f) => !outIds.has(f.follower)).map((f) => entry(f.follower, f.createdAt)).sort(byName),
  };
}
