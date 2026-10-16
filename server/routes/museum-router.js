const { Router } = require('express');
const mongoose = require('mongoose');
const Event = require('../models/Event.js');
const Submission = require('../models/Submission.js');
const { userMini } = require('../models/User.js');
const { asyncHandler, apiErrorHandler, httpError } = require('../utils/helpers.js');

// The public museum: one wing per finished public exchange, hung with the gifts that both the
// artist and the recipient chose to show on their profiles. Anyone can visit, signed in or not.
const router = Router();

const FINISHED = { publicity: 'public', status: 'completed', disabledAt: null };
const WINGS_MAX = 60;
const USER_FIELDS = 'displayName username avatarUrl status profilePrivacy';

// Both people agreed to show it (same rule as the gift gallery on profiles)
const shown = (user) => Boolean(user && (user.status || 'active') === 'active' && user.profilePrivacy?.showGifts);

async function publicGifts(eventIds) {
  const subs = await Submission.find({ event: { $in: eventIds } })
    .sort({ submittedAt: 1, _id: 1 })
    .populate('giver', USER_FIELDS)
    .populate('recipient', USER_FIELDS);
  return subs.filter((s) => shown(s.giver) && shown(s.recipient));
}

// Just what a visitor sees: never the private note to the recipient or the organisers' checks
function artwork(submission, event) {
  const { id, title, type, images, thumbnails, imageDescriptions, contentWarnings, links, submittedAt } =
    submission.toPublic();
  return {
    submission: { id, title, type, images, thumbnails, imageDescriptions, contentWarnings, links, submittedAt },
    event: { id: event._id.toString(), name: event.name },
    giver: userMini(submission.giver),
    recipient: userMini(submission.recipient),
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const events = await Event.find(FINISHED).sort({ completedAt: -1, _id: -1 }).limit(WINGS_MAX * 2);
  const gifts = await publicGifts(events.map((e) => e._id));
  const byEvent = new Map();
  for (const s of gifts) {
    const key = s.event.toString();
    if (!byEvent.has(key)) byEvent.set(key, []);
    byEvent.get(key).push(s);
  }
  const wings = events
    .filter((e) => byEvent.has(e._id.toString()))
    .slice(0, WINGS_MAX)
    .map((e) => {
      const list = byEvent.get(e._id.toString());
      const cover = list.map((s) => s.toPublic()).find((p) => p.images.length && !p.contentWarnings.length);
      return {
        event: { id: e._id.toString(), name: e.name, theme: e.theme || '', completedAt: e.completedAt, bannerUrl: e.bannerUrl || null },
        count: list.length,
        cover: cover ? cover.thumbnails[0] : null,
      };
    });
  res.json({ wings });
}));

router.get('/:eventId', asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const missing = () => httpError(404, "That wing of the museum isn't open.", 'NOT_FOUND');
  if (!mongoose.isValidObjectId(eventId)) throw missing();
  const event = await Event.findOne({ _id: eventId, ...FINISHED });
  if (!event) throw missing();
  const gifts = await publicGifts([event._id]);
  if (!gifts.length) throw missing();
  res.json({
    event: { id: event.id, name: event.name, theme: event.theme || '', completedAt: event.completedAt },
    artworks: gifts.map((s) => artwork(s, event)),
  });
}));

router.use(apiErrorHandler);

module.exports = router;
