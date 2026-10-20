// The landing page showcase (GET /api/showcase, server/routes/showcase-router.js and the demo mock):
// community tiles and the "Happening now" feed, built the same way in both places. Everything here is
// counted from real records; nothing is invented.
import { CARD_COLORS } from './taste.mjs';

export const COMMUNITIES_MAX = 16;
export const FEED_MAX = 8;
export const GIFTS_MAX = 12;

// A stable colour and monogram for a community name (no real brand logos)
export function communityStyle(name) {
  const text = String(name || '').trim();
  let hash = 7;
  for (const ch of text.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const colour = CARD_COLORS[hash % CARD_COLORS.length];
  const words = text.split(/\s+/).filter((w) => /^[\p{L}\p{N}]/u.test(w));
  const initials = (words.length > 1 ? words.slice(0, 2).map((w) => w[0]) : [...(words[0] || '?')].slice(0, 2))
    .join('')
    .toUpperCase();
  return { colour: colour.swatch, ink: colour.ink, initials };
}

// events: [{ platform, platformName, artists: [userId] }] → community tiles, busiest first
export function buildCommunities(events) {
  const groups = new Map();
  for (const e of events) {
    const name = String(e.platformName || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const group = groups.get(key) || { name, platform: e.platform, exchanges: 0, artistIds: new Set() };
    group.exchanges += 1;
    for (const id of e.artists || []) group.artistIds.add(String(id));
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(({ artistIds, ...g }) => ({ ...g, artists: artistIds.size, ...communityStyle(g.name) }))
    .sort((a, b) => b.exchanges - a.exchanges || b.artists - a.artists || a.name.localeCompare(b.name))
    .slice(0, COMMUNITIES_MAX);
}

const time = (d) => (d ? new Date(d).getTime() : 0);

// events: [{ id, name, status, platformName, signupDeadline, submissionDeadline, completedAt,
// maxParticipants, participants }] → feed rows. Things you can still act on come first.
export function buildFeed(events, now = new Date()) {
  const nowMs = time(now);
  const rows = [];
  for (const e of events) {
    const base = { event: { id: String(e.id), name: e.name }, community: e.platformName || '', artists: e.participants || 0 };
    if (e.status === 'open' && time(e.signupDeadline) > nowMs) {
      const spotsLeft = e.maxParticipants ? Math.max(0, e.maxParticipants - (e.participants || 0)) : null;
      rows.push({ ...base, kind: 'open', at: e.signupDeadline, spotsLeft, rank: 0, key: time(e.signupDeadline) });
    } else if (e.status === 'matching') {
      rows.push({ ...base, kind: 'matching', at: e.signupDeadline, rank: 1, key: -time(e.signupDeadline) });
    } else if (e.status === 'active') {
      rows.push({ ...base, kind: 'active', at: e.submissionDeadline, rank: 2, key: time(e.submissionDeadline) });
    } else if (e.status === 'completed' && e.completedAt) {
      rows.push({ ...base, kind: 'revealed', at: e.completedAt, rank: 3, key: -time(e.completedAt) });
    }
  }
  return rows
    .sort((a, b) => a.rank - b.rank || a.key - b.key || a.event.id.localeCompare(b.event.id))
    .slice(0, FEED_MAX)
    .map(({ rank, key, ...row }) => row);
}
