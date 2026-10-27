const { Router } = require('express');
const Rating = require('../models/Rating.js');
const User = require('../models/User.js');
const { userMini } = User;
const { requireAuth, optionalAuth, loadEvent, getEventRoles } = require('../middleware/auth.js');
const { viewerContext, canViewEvent } = require('../services/events.js');
const { notify } = require('../services/notify.js');
const { organiserSummary, ratingJson } = require('../services/ratings.js');
const { LIMITS } = require('../../shared/constants.mjs');
const { asyncHandler, apiErrorHandler, httpError } = require('../utils/helpers.js');

// Rating the organiser after an exchange: stars (1 to 5) and an optional comment.
// Mounted at /api/events/:eventId, like the other event routers.
const router = Router({ mergeParams: true });

async function quietly(task) {
  try {
    await task;
  } catch (err) {
    console.error('Notification failed:', err.message);
  }
}

// Why this person can't rate yet, or null when they can.
// Only people who took part (and are not organisers) can rate, and only once the gifts are revealed.
async function whyNotRate(event, user) {
  if (event.status !== 'completed') return { status: 409, code: 'NOT_COMPLETED', message: 'You can rate the organiser once the gifts are revealed.' };
  if (String(user._id) === String(event.createdBy)) return { status: 403, code: 'FORBIDDEN', message: 'You cannot rate yourself.' };
  const roles = await getEventRoles(user, event._id);
  if (roles.includes('organizer')) return { status: 403, code: 'FORBIDDEN', message: 'Organisers cannot rate their own exchange.' };
  if (!roles.includes('participant')) return { status: 403, code: 'FORBIDDEN', message: 'Only people who took part can rate the organiser.' };
  return null;
}

// The organiser's score, your own rating and whether you can rate. Anyone who can see the event can read it
router.get('/rating', optionalAuth, loadEvent, asyncHandler(async (req, res) => {
  const { event, user } = req;
  const invite = typeof req.query.invite === 'string' ? req.query.invite : undefined;
  const ctx = await viewerContext(event, user);
  if (!canViewEvent(event, ctx, invite)) throw httpError(404, 'Event not found.', 'NOT_FOUND');

  const organiser = await User.findById(event.createdBy);
  const body = {
    organiser: organiser ? userMini(organiser) : null,
    summary: await organiserSummary(event.createdBy),
    rating: null,
    canRate: false,
  };
  if (user) {
    body.rating = ratingJson(await Rating.findOne({ event: event._id, rater: user._id }));
    body.canRate = !(await whyNotRate(event, user));
  }
  res.json(body);
}));

// Rate the organiser. Saving again changes your rating.
router.put('/rating', requireAuth, loadEvent, asyncHandler(async (req, res) => {
  const { event, user } = req;
  const blocked = await whyNotRate(event, user);
  if (blocked) throw httpError(blocked.status, blocked.message, blocked.code);

  const stars = Number(req.body?.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw httpError(400, 'Pick 1 to 5 stars.', 'VALIDATION');
  const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim() : '';
  if (comment.length > LIMITS.ratingComment) {
    throw httpError(400, `Keep your comment to ${LIMITS.ratingComment} characters or fewer.`, 'VALIDATION');
  }

  const filter = { event: event._id, rater: user._id };
  const first = !(await Rating.exists(filter));
  const rating = await Rating.findOneAndUpdate(
    filter,
    { organiser: event.createdBy, stars, comment },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  // The organiser hears about a new rating once (without who gave it)
  if (first) {
    await quietly(
      notify(event.createdBy, {
        type: 'organiser_rated',
        title: `You got a ${stars}-star rating for ${event.name}`,
        message: comment || 'An artist who took part rated how it went.',
        link: `/events/${event.id}`,
      })
    );
  }
  res.json({ rating: ratingJson(rating), summary: await organiserSummary(event.createdBy) });
}));

// Take your rating back
router.delete('/rating', requireAuth, loadEvent, asyncHandler(async (req, res) => {
  const { event, user } = req;
  await Rating.deleteOne({ event: event._id, rater: user._id });
  res.json({ rating: null, summary: await organiserSummary(event.createdBy) });
}));

router.use(apiErrorHandler);

module.exports = router;
