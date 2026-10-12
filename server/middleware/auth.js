const mongoose = require('mongoose');
const User = require('../models/User.js');
const Event = require('../models/Event.js');
const EventMember = require('../models/EventMember.js');
const { readSession } = require('../utils/session.js');
const { asyncHandler } = require('../utils/helpers.js');

// Looks up the user for the session cookie, or null.
async function userFromSession(req) {
  const session = readSession(req);
  if (!session) return null;
  const user = await User.findById(session.userId);
  if (!user || (user.sessionVersion || 0) !== session.version) return null;
  if (user.status === 'deactivated') return null;
  return user;
}

// Must be logged in. Puts the user on req.user.
const requireAuth = asyncHandler(async (req, res, next) => {
  if (!readSession(req)) return res.status(401).json({ error: 'Please log in.', code: 'AUTH_REQUIRED' });

  const user = await userFromSession(req);
  if (!user) {
    return res
      .status(401)
      .json({ error: 'Your session has expired. Please log in again.', code: 'SESSION_EXPIRED' });
  }

  req.user = user;
  next();
});

// Logged in or not. Sets req.user when there's a valid session, never blocks.
const optionalAuth = asyncHandler(async (req, res, next) => {
  req.user = (await userFromSession(req)) || null;
  next();
});

// Site-wide admin only. Use after requireAuth.
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admins only.', code: 'ACCESS_DENIED' });
  next();
}

// Loads the event from the URL (:eventId) into req.event. 404 if it doesn't exist.
const loadEvent = asyncHandler(async (req, res, next) => {
  const { eventId } = req.params;
  if (!mongoose.isValidObjectId(eventId)) {
    return res.status(404).json({ error: 'Event not found.', code: 'NOT_FOUND' });
  }
  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ error: 'Event not found.', code: 'NOT_FOUND' });
  req.event = event;
  next();
});

// The roles a user holds in an event, e.g. ['organizer', 'participant']. [] for guests.
async function getEventRoles(user, eventId) {
  if (!user) return [];
  const membership = await EventMember.findOne({ user: user._id, event: eventId });
  return membership ? [...membership.roles] : [];
}

// Must hold at least one of these roles in the event from the URL (:eventId).
// Site admins always pass. Use after requireAuth. Sets req.membership and req.eventRoles.
//
//   router.post('/matches/generate', requireAuth, requireEventRole('organizer'), handler)
function requireEventRole(...allowed) {
  return asyncHandler(async (req, res, next) => {
    const { eventId } = req.params;
    if (!mongoose.isValidObjectId(eventId)) {
      return res.status(400).json({ error: 'Invalid event id.', code: 'INVALID_ID' });
    }

    const membership = await EventMember.findOne({ user: req.user._id, event: eventId });
    req.membership = membership;
    req.eventRoles = membership ? [...membership.roles] : [];

    if (req.user.role === 'admin') return next();
    if (!membership || !membership.roles.some((r) => allowed.includes(r))) {
      return res
        .status(403)
        .json({ error: "You don't have permission to do that in this event.", code: 'ACCESS_DENIED' });
    }
    next();
  });
}

module.exports = { requireAdmin, requireEventRole, requireAuth, optionalAuth, loadEvent, getEventRoles };
