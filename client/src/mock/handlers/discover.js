// /discover: Discover artists (server/routes/discover-router.js)
import { artistTagsOf, THEME_VALUES } from '@shared/taste.mjs';
import { CREATION_TYPE_VALUES } from '@shared/constants.mjs';
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
  newest: [(c) => c.createdAt],
  exchanges: [(c) => c.exchanges, interesting, (c) => c.createdAt],
};

// ?makes=art,writing&themes=fantasy&hasGifts=true&following=true. Within makes or themes any value
// matches; different filters must all match.
function readFilters(query) {
  const listOf = (key, allowed) => {
    if (query[key] === undefined || query[key] === '') return [];
    const values = String(query[key]).split(',').map((v) => v.trim()).filter(Boolean);
    if (values.some((v) => !allowed.includes(v))) throw invalid(`${key} must use: ${allowed.join(', ')}.`);
    return [...new Set(values)];
  };
  const sort = query.sort === undefined || query.sort === '' ? 'default' : String(query.sort);
  if (!Object.keys(ORDERS).includes(sort)) throw invalid(`sort must be one of: ${Object.keys(ORDERS).join(', ')}.`);
  return {
    makes: listOf('makes', CREATION_TYPE_VALUES),
    themes: listOf('themes', THEME_VALUES),
    hasGifts: query.hasGifts === 'true',
    following: query.following === 'true',
    sort,
  };
}

const matches = (filters, followed) => (c) =>
  (!filters.makes.length || filters.makes.some((m) => c.tags.makes.includes(m))) &&
  (!filters.themes.length || filters.themes.some((t) => c.tags.themes.includes(t))) &&
  (!filters.hasGifts || c.hasGifts) &&
  (!filters.following || followed.has(c.id));


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
    const filters = readFilters(ctx.query);
    if (filters.following && !viewer) throw httpError(401, 'Log in to see who you follow.', 'AUTH_REQUIRED');
    const followed = new Set(
      filters.following ? state.follows.filter((f) => f.follower === viewer.id).map((f) => f.following) : []
    );
    const list = candidates(state, { q: ctx.query.q, viewer }).filter(matches(filters, followed));
    const ordered = sortBy(list, ORDERS[filters.sort]);
    const items = ordered.slice(offset, offset + limit).map((c) => artistCard(state, c.user, viewer));
    const hasMore = ordered.length > offset + limit;
    return { items, hasMore, nextCursor: hasMore ? String(offset + limit) : null, total: ordered.length };
  });
}
