// /discover: Discover artists (server/routes/discover-router.js)
import { artistTagsOf } from '@shared/taste.mjs';
import { httpError } from '../util.js';
import { artistCard, isFinished } from './users.js';

const PAGE = 12;
const PAGE_MAX = 48;

const invalid = (message) => httpError(400, message, 'VALIDATION');
const timeOf = (iso) => (iso ? new Date(iso).getTime() : 0);

// Everyone who could appear, with what the ordering needs
function candidates(state, { q, viewer }) {
  const text = String(q || '').trim().replace(/^@/, '').toLowerCase().slice(0, 60);
  const finished = new Set(state.events.filter(isFinished).map((e) => e.id));
  const agreed = new Set(
    state.users.filter((u) => (u.status || 'active') === 'active' && u.profilePrivacy?.showGifts).map((u) => u.id)
  );
  const givers = new Set(
    state.submissions
      .filter((s) => finished.has(s.event) && agreed.has(s.giver) && agreed.has(s.recipient))
      .map((s) => s.giver)
  );

  return state.users
    .filter((u) => (u.status || 'active') === 'active' && u.profilePrivacy?.listInDiscover !== false)
    .filter((u) => !viewer || u.id !== viewer.id)
    .filter(
      (u) =>
        !text ||
        String(u.displayName || '').toLowerCase().includes(text) ||
        String(u.username || '').toLowerCase().includes(text)
    )
    .map((user) => {
      const tags = artistTagsOf(user.artistTags);
      const showExchanges = user.profilePrivacy?.showExchanges !== false;
      const joined = new Set(
        state.applications
          .filter((a) => a.user === user.id && a.status === 'accepted' && finished.has(a.event))
          .map((a) => a.event)
      );
      return {
        user,
        id: user.id,
        tags,
        exchanges: showExchanges ? joined.size : 0,
        hasGifts: givers.has(user.id),
        tagged: Boolean(tags.makes.length || tags.themes.length),
        createdAt: timeOf(user.createdAt),
      };
    });
}

// Profiles with something to see first, then the most experienced, then the newest
const interesting = (c) => Number(c.tagged) + Number(c.hasGifts) + Number(c.exchanges > 0);
const ORDERS = {
  default: [interesting, (c) => c.exchanges, (c) => c.createdAt],
};

function sortBy(list, keys) {
  return [...list].sort((a, b) => {
    for (const key of keys) {
      const x = key(a);
      const y = key(b);
      if (x !== y) return y > x ? 1 : -1;
    }
    return a.id.localeCompare(b.id);
  });
}

function readPaging(query) {
  const limit = Math.min(Math.max(Number(query.limit) || PAGE, 1), PAGE_MAX);
  const offset = query.cursor === undefined ? 0 : Number(query.cursor);
  if (!Number.isInteger(offset) || offset < 0) throw invalid('cursor must come from a previous page.');
  return { limit, offset };
}

export function register(router) {
  router.get('/discover/artists', (ctx) => {
    const { state } = ctx;
    const viewer = ctx.currentUser();
    const { limit, offset } = readPaging(ctx.query);
    const ordered = sortBy(candidates(state, { q: ctx.query.q, viewer }), ORDERS.default);
    const items = ordered.slice(offset, offset + limit).map((c) => artistCard(state, c.user, viewer));
    const hasMore = ordered.length > offset + limit;
    return { items, hasMore, nextCursor: hasMore ? String(offset + limit) : null, total: ordered.length };
  });
}
