const { Router } = require('express');
const User = require('../models/User.js');
const { userMini } = User;
const Event = require('../models/Event.js');
const EventMember = require('../models/EventMember.js');
const Application = require('../models/Application.js');
const Submission = require('../models/Submission.js');
const { optionalAuth, requireAuth } = require('../middleware/auth.js');
const Follow = require('../models/Follow.js');
const { relation, followCounts } = require('../services/social.js');
const { notify } = require('../services/notify.js');
const { LIMITS } = require('../../shared/constants.mjs');
const { serializeEvents } = require('../services/events.js');
const { asyncHandler, apiErrorHandler, httpError } = require('../utils/helpers.js');
const { earnedBadges } = require('../../shared/badges.mjs');
const { FINISHED, visibleProfileUser, publicGiftsFilter, badgeGifts } = require('../services/artists.js');

// Public artist profiles: /api/users/:username
const router = Router();

const PROFILE_EVENTS_MAX = 12;
const GIFTS_PAGE = 12;
const GIFTS_PAGE_MAX = 48;
const LISTED = { publicity: 'public', status: { $ne: 'draft' }, disabledAt: null };
// What the gallery shows of a gift: never the private note to the recipient or the organisers' checks
function giftItem(submission, giver) {
  const { id, title, type, images, thumbnails, imageDescriptions, contentWarnings, links, submittedAt } =
    submission.toPublic();
  return {
    submission: { id, title, type, images, thumbnails, imageDescriptions, contentWarnings, links, submittedAt },
    event: { id: submission.event._id.toString(), name: submission.event.name },
    giver: giver.toMini(),
    recipient: userMini(submission.recipient),
  };
}

router.get('/:username', optionalAuth, asyncHandler(async (req, res) => {
  const user = await visibleProfileUser(req.params.username);

  const organizedIds = await EventMember.distinct('event', { user: user._id, roles: 'organizer' });
  const showExchanges = user.profilePrivacy?.showExchanges !== false;
  const [events, eventsOrganized, eventsRun, madeGifts] = await Promise.all([
    Event.find({ _id: { $in: organizedIds }, ...LISTED }).sort({ createdAt: -1, _id: -1 }).limit(PROFILE_EVENTS_MAX),
    Event.countDocuments({ _id: { $in: organizedIds }, ...LISTED }),
    Event.countDocuments({ _id: { $in: organizedIds }, ...FINISHED }),
    // Hidden exchanges stay hidden: no badges that would hint at them
    showExchanges ? badgeGifts(user) : null,
  ]);
  const body = {
    profile: { ...user.toPublicProfile(), createdAt: user.createdAt },
    organizing: await serializeEvents(events, req.user),
    stats: { eventsOrganized, ...(await followCounts(user._id)) },
    badges: earnedBadges({ eventsRun, gifts: madeGifts }),
  };

  // Exchanges they took part in, unless they chose to keep that to themselves
  if (showExchanges) {
    const joinedIds = await Application.distinct('event', { user: user._id, status: 'accepted' });
    const joined = { _id: { $in: joinedIds }, ...FINISHED };
    const [exchanges, exchangesCompleted] = await Promise.all([
      Event.find(joined).sort({ completedAt: -1, _id: -1 }).limit(PROFILE_EVENTS_MAX),
      Event.countDocuments(joined),
    ]);
    body.exchanges = await serializeEvents(exchanges, req.user);
    body.stats.exchangesCompleted = exchangesCompleted;
  }

  const gifts = await publicGiftsFilter(user);
  body.hasGifts = Boolean(gifts && (await Submission.exists(gifts)));

  // Only the viewer learns whether they keep this person off their matches
  if (req.user && !req.user._id.equals(user._id)) {
    body.viewer = {
      blocked: (req.user.blockedUsers || []).some((id) => id.equals(user._id)),
      ...(await relation(req.user._id, user._id)),
    };
  }

  res.json(body);
}));

// The artist's public gift gallery, newest first. ?before=<ISO date> pages backwards
// (strictly older than it); hasMore says whether an older page exists.
router.get('/:username/gifts', optionalAuth, asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || GIFTS_PAGE, 1), GIFTS_PAGE_MAX);
  let before = null;
  if (req.query.before) {
    before = new Date(String(req.query.before));
    if (Number.isNaN(before.getTime())) throw httpError(400, 'before must be a date.', 'VALIDATION');
  }

  const user = await visibleProfileUser(req.params.username);
  const filter = await publicGiftsFilter(user);
  if (!filter) return res.json({ items: [], hasMore: false });
  if (before) filter.submittedAt = { $lt: before };

  const rows = await Submission.find(filter)
    .sort({ submittedAt: -1, _id: -1 })
    .limit(limit + 1)
    .populate('event', 'name')
    .populate('recipient');
  res.json({ items: rows.slice(0, limit).map((s) => giftItem(s, user)), hasMore: rows.length > limit });
}));

// ---------- Following ----------
// Following someone shows them in your friend list; once they follow you back you're friends.

router.post('/:username/follow', requireAuth, asyncHandler(async (req, res) => {
  const user = await visibleProfileUser(req.params.username);
  if (user._id.equals(req.user._id)) throw httpError(400, "You can't follow yourself.", 'VALIDATION');
  const already = await Follow.exists({ follower: req.user._id, following: user._id });
  if (!already) {
    if ((await Follow.countDocuments({ follower: req.user._id })) >= LIMITS.following) {
      throw httpError(400, `You can follow up to ${LIMITS.following} people.`, 'VALIDATION');
    }
    try {
      await Follow.create({ follower: req.user._id, following: user._id });
    } catch (err) {
      if (err?.code !== 11000) throw err; // a double click: already following
    }
    const now = await relation(req.user._id, user._id);
    const me = userMini(req.user);
    try {
      await notify(user._id, now.friends
        ? { type: 'new_friend', title: `You and ${me.displayName} are friends now`, message: 'You follow each other.', link: me.username ? `/users/${me.username}` : '/friends' }
        : { type: 'new_follower', title: `${me.displayName} followed you`, message: 'Follow them back to become friends.', link: me.username ? `/users/${me.username}` : '/friends' });
    } catch (err) {
      console.error('Follow notification failed:', err.message);
    }
  }
  res.json({ viewer: await relation(req.user._id, user._id), stats: await followCounts(user._id) });
}));

router.delete('/:username/follow', requireAuth, asyncHandler(async (req, res) => {
  const user = await visibleProfileUser(req.params.username);
  await Follow.deleteOne({ follower: req.user._id, following: user._id });
  res.json({ viewer: await relation(req.user._id, user._id), stats: await followCounts(user._id) });
}));

router.use(apiErrorHandler);

module.exports = router;
