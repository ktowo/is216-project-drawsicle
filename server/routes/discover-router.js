const { Router } = require('express');
const User = require('../models/User.js');
const Event = require('../models/Event.js');
const Application = require('../models/Application.js');
const Submission = require('../models/Submission.js');
const { optionalAuth } = require('../middleware/auth.js');
const { FINISHED, artistCard } = require('../services/artists.js');
const Follow = require('../models/Follow.js');
const { asyncHandler, apiErrorHandler, httpError } = require('../utils/helpers.js');
const { CREATION_TYPE_VALUES } = require('../../shared/constants.mjs');
const { THEME_VALUES } = require('../../shared/taste.mjs');

// Discover artists: /api/discover/artists. Only active artists who haven't turned off
// profilePrivacy.listInDiscover, never yourself.
const router = Router();

const PAGE = 12;
const PAGE_MAX = 48;
// Enough for a class-sized community; the list is ranked in memory, then one page is built
const CANDIDATES_MAX = 500;

const invalid = (message) => httpError(400, message, 'VALIDATION');
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Everyone who could appear, with what the ordering needs (cheap: no cards built yet)
async function candidates({ q, viewer }) {
  const filter = { status: 'active', 'profilePrivacy.listInDiscover': { $ne: false } };
  if (viewer) filter._id = { $ne: viewer._id };
  const text = String(q || '').trim().replace(/^@/, '');
  if (text) {
    const re = new RegExp(escapeRegex(text.slice(0, 60)), 'i');
    filter.$or = [{ displayName: re }, { username: re }];
  }
  const users = await User.find(filter).sort({ createdAt: -1, _id: -1 }).limit(CANDIDATES_MAX);
  const ids = users.map((u) => u._id);

  const [finished, agreed] = await Promise.all([
    Event.distinct('_id', FINISHED),
    User.distinct('_id', { status: 'active', 'profilePrivacy.showGifts': true }),
  ]);
  const [joined, givers] = await Promise.all([
    Application.find({ user: { $in: ids }, status: 'accepted', event: { $in: finished } }).select('user event'),
    Submission.distinct('giver', { giver: { $in: agreed }, recipient: { $in: agreed }, event: { $in: finished } }),
  ]);
  const exchanges = new Map();
  for (const a of joined) {
    const key = a.user.toString();
    if (!exchanges.has(key)) exchanges.set(key, new Set());
    exchanges.get(key).add(a.event.toString());
  }
  const hasGifts = new Set(givers.map(String));

  return users.map((user) => {
    const id = user._id.toString();
    const tags = user.toPublic().artistTags;
    const showExchanges = user.profilePrivacy?.showExchanges !== false;
    return {
      user,
      id,
      tags,
      exchanges: showExchanges ? exchanges.get(id)?.size || 0 : 0,
      hasGifts: hasGifts.has(id),
      tagged: Boolean(tags.makes.length || tags.themes.length),
      createdAt: user.createdAt ? user.createdAt.getTime() : 0,
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

router.get('/artists', optionalAuth, asyncHandler(async (req, res) => {
  const { limit, offset } = readPaging(req.query);
  const filters = readFilters(req.query);
  if (filters.following && !req.user) throw httpError(401, 'Log in to see who you follow.', 'AUTH_REQUIRED');
  const followed = new Set(
    filters.following ? (await Follow.distinct('following', { follower: req.user._id })).map(String) : []
  );
  const list = (await candidates({ q: req.query.q, viewer: req.user })).filter(matches(filters, followed));
  const ordered = sortBy(list, ORDERS[filters.sort]);
  const page = ordered.slice(offset, offset + limit);
  const items = await Promise.all(page.map((c) => artistCard(c.user, req.user)));
  const hasMore = ordered.length > offset + limit;
  res.json({ items, hasMore, nextCursor: hasMore ? String(offset + limit) : null, total: ordered.length });
}));

router.use(apiErrorHandler);

module.exports = router;
