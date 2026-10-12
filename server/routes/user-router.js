const { Router } = require('express');
const mongoose = require('mongoose');
const User = require('../models/User.js');
const Event = require('../models/Event.js');
const EventMember = require('../models/EventMember.js');
const Application = require('../models/Application.js');
const { optionalAuth } = require('../middleware/auth.js');
const { serializeEvents } = require('../services/events.js');
const { asyncHandler, apiErrorHandler, httpError } = require('../utils/helpers.js');

// Public artist profiles: /api/users/:username
const router = Router();

const PROFILE_EVENTS_MAX = 12;
const LISTED = { publicity: 'public', status: { $ne: 'draft' }, disabledAt: null };

const notFound = () => httpError(404, "We couldn't find that artist.", 'USER_NOT_FOUND');

// By username (any case); an id works too, for links made before someone picked a username
async function findProfileUser(handle) {
  const value = String(handle || '').trim().toLowerCase().replace(/^@/, '');
  let user = null;
  if (User.USERNAME_RE.test(value)) user = await User.findOne({ username: value });
  if (!user && mongoose.isObjectIdOrHexString(value)) user = await User.findById(value);
  return user;
}

router.get('/:username', optionalAuth, asyncHandler(async (req, res) => {
  const user = await findProfileUser(req.params.username);
  if (!user || user.status === 'deactivated') throw notFound();

  const organizedIds = await EventMember.distinct('event', { user: user._id, roles: 'organizer' });
  const [events, eventsOrganized, participatedIn] = await Promise.all([
    Event.find({ _id: { $in: organizedIds }, ...LISTED }).sort({ createdAt: -1, _id: -1 }).limit(PROFILE_EVENTS_MAX),
    Event.countDocuments({ _id: { $in: organizedIds }, ...LISTED }),
    Application.distinct('event', { user: user._id, status: 'accepted' }),
  ]);
  const exchangesCompleted = participatedIn.length
    ? await Event.countDocuments({ _id: { $in: participatedIn }, status: 'completed' })
    : 0;

  res.json({
    profile: { ...user.toPublicProfile(), createdAt: user.createdAt },
    organizing: await serializeEvents(events, req.user),
    stats: { eventsOrganized, exchangesCompleted },
  });
}));

router.use(apiErrorHandler);

module.exports = router;
