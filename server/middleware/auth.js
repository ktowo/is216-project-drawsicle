const mongoose = require('mongoose');
const User = require('../models/User.js');
const EventMember = require('../models/EventMember.js');
const { readSession } = require('../utils/session.js');
const { asyncHandler } = require('../utils/helpers.js');

// Must be logged in. Puts the user on req.user.
const requireAuth = asyncHandler(async (req, res, next) => {
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: 'Please log in.' });

  const user = await User.findById(session.userId);
  if (!user || (user.sessionVersion || 0) !== session.version) {
    return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  }

  req.user = user;
  next();
});

// Site-wide admin only. Use after requireAuth.
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admins only.' });
  next();
}

// Must hold at least one of these roles in the event from the URL (:eventId).
// Site admins always pass. Use after requireAuth.
//
//   router.post('/events/:eventId/match', requireAuth, requireEventRole('organizer'), runMatching)
//   router.post('/events/:eventId/applications/:id/approve', requireAuth, requireEventRole('approver', 'organizer'), approve)
function requireEventRole(...allowed) {
  return asyncHandler(async (req, res, next) => {
    if (req.user.role === 'admin') return next();

    const { eventId } = req.params;
    if (!mongoose.isValidObjectId(eventId)) {
      return res.status(400).json({ error: 'Invalid event id.' });
    }

    const membership = await EventMember.findOne({ user: req.user._id, event: eventId });
    if (!membership || !membership.roles.some((r) => allowed.includes(r))) {
      return res.status(403).json({ error: "You don't have permission to do that in this event." });
    }

    req.membership = membership;
    next();
  });
}

module.exports = { requireAdmin, requireEventRole, requireAuth };
