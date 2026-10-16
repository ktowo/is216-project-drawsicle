const { Router } = require('express');
const mongoose = require('mongoose');
const Event = require('../models/Event.js');
const EventMember = require('../models/EventMember.js');
const Favourite = require('../models/Favourite.js');
const Submission = require('../models/Submission.js');
const { userMini } = require('../models/User.js');
const { requireAuth } = require('../middleware/auth.js');
const { asyncHandler, apiErrorHandler, httpError } = require('../utils/helpers.js');
const { LIMITS } = require('../../shared/constants.mjs');

// Saved art: gifts someone wants to come back to. Private to them.
//
//   GET    /api/favourites                 the gifts you saved that you can still see, newest first
//   PUT    /api/favourites/:submissionId   save one
//   DELETE /api/favourites/:submissionId   unsave it
//
// You can only save (and keep seeing) a gift you could see anyway: one hanging in the public
// museum, or one from a finished exchange you organised or took part in.
const router = Router();
router.use(requireAuth);

const USER_FIELDS = 'displayName username avatarUrl status profilePrivacy';
const shows = (user) => Boolean(user && (user.status || 'active') === 'active' && user.profilePrivacy?.showGifts);

// The submissions (populated) this person can see
async function visibleTo(user, submissions) {
  const eventIds = [...new Set(submissions.map((s) => String(s.event?._id || s.event)))];
  const [events, memberships] = await Promise.all([
    Event.find({ _id: { $in: eventIds }, status: 'completed', disabledAt: null }).select('name publicity'),
    EventMember.find({ user: user._id, event: { $in: eventIds }, roles: { $in: ['organizer', 'participant'] } }).select('event'),
  ]);
  const finished = new Map(events.map((e) => [e._id.toString(), e]));
  const mine = new Set(memberships.map((m) => m.event.toString()));
  return submissions.filter((s) => {
    const id = String(s.event?._id || s.event);
    const event = finished.get(id);
    if (!event) return false;
    if (mine.has(id)) return true;
    return event.publicity === 'public' && shows(s.giver) && shows(s.recipient);
  });
}

function item(submission, event, savedAt) {
  const { id, title, type, images, thumbnails, imageDescriptions, contentWarnings, links, submittedAt } = submission.toPublic();
  return {
    submission: { id, title, type, images, thumbnails, imageDescriptions, contentWarnings, links, submittedAt },
    event: { id: event._id.toString(), name: event.name },
    giver: userMini(submission.giver),
    recipient: userMini(submission.recipient),
    savedAt,
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const saved = await Favourite.find({ user: req.user._id }).sort({ createdAt: -1, _id: -1 }).limit(LIMITS.favourites);
  const subs = await Submission.find({ _id: { $in: saved.map((f) => f.submission) } })
    .populate('giver', USER_FIELDS)
    .populate('recipient', USER_FIELDS)
    .populate('event', 'name');
  const visible = new Map((await visibleTo(req.user, subs)).map((s) => [s._id.toString(), s]));
  const items = saved
    .filter((f) => visible.has(f.submission.toString()))
    .map((f) => {
      const s = visible.get(f.submission.toString());
      return item(s, s.event, f.createdAt);
    });
  res.json({ items, ids: items.map((i) => i.submission.id) });
}));

async function visibleSubmission(req) {
  const missing = () => httpError(404, "That gift isn't one you can see.", 'NOT_FOUND');
  if (!mongoose.isValidObjectId(req.params.submissionId)) throw missing();
  const sub = await Submission.findById(req.params.submissionId).populate('giver', USER_FIELDS).populate('recipient', USER_FIELDS);
  if (!sub || !(await visibleTo(req.user, [sub])).length) throw missing();
  return sub;
}

router.put('/:submissionId', asyncHandler(async (req, res) => {
  const sub = await visibleSubmission(req);
  const already = await Favourite.exists({ user: req.user._id, submission: sub._id });
  if (!already && (await Favourite.countDocuments({ user: req.user._id })) >= LIMITS.favourites) {
    throw httpError(409, `You can save up to ${LIMITS.favourites} gifts. Unsave a few first.`, 'TOO_MANY');
  }
  await Favourite.updateOne({ user: req.user._id, submission: sub._id }, { $setOnInsert: { user: req.user._id, submission: sub._id } }, { upsert: true });
  res.json({ saved: true });
}));

router.delete('/:submissionId', asyncHandler(async (req, res) => {
  if (mongoose.isValidObjectId(req.params.submissionId)) {
    await Favourite.deleteOne({ user: req.user._id, submission: req.params.submissionId });
  }
  res.json({ saved: false });
}));

router.use(apiErrorHandler);

module.exports = router;
