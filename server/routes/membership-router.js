const { Router } = require('express');
const mongoose = require('mongoose');
const EventMember = require('../models/EventMember.js');
const { EVENT_ROLES } = EventMember;
const { requireAuth, requireEventRole } = require('../middleware/auth.js');
const { notify } = require('../services/notify.js');
const { asyncHandler, apiErrorHandler } = require('../utils/helpers.js');

const router = Router();
router.use(requireAuth);

// The Event model belongs to a teammate. Only populate it once it exists.
const eventModelExists = () => mongoose.modelNames().includes('Event');

// My roles across all events (for the dashboard)
router.get('/mine', asyncHandler(async (req, res) => {
  let query = EventMember.find({ user: req.user._id }).sort({ createdAt: -1 });
  if (eventModelExists()) query = query.populate('event', 'name title');

  const rows = await query;
  res.json({
    memberships: rows.map((m) => ({
      eventId: (m.event?._id || m.event).toString(),
      eventName: m.event?.name || m.event?.title || null,
      roles: m.roles,
    })),
  });
}));

// Everyone in an event and their roles (organizers + approvers only)
router.get('/events/:eventId', requireEventRole('organizer', 'approver'), asyncHandler(async (req, res) => {
  const rows = await EventMember.find({ event: req.params.eventId }).populate('user', 'displayName avatarUrl email');
  res.json({
    members: rows
      .filter((m) => m.user)
      .map((m) => ({
        userId: m.user._id.toString(),
        displayName: m.user.displayName,
        avatarUrl: m.user.avatarUrl || null,
        email: m.user.email,
        roles: m.roles,
      })),
  });
}));

// Set someone's roles in an event (organizers only). Body: { roles: ['participant', 'helper'] }
router.put('/events/:eventId/users/:userId', requireEventRole('organizer'), asyncHandler(async (req, res) => {
  const { eventId, userId } = req.params;
  if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ error: 'Invalid user id.' });

  const roles = Array.isArray(req.body.roles) ? [...new Set(req.body.roles)] : null;
  if (!roles || roles.some((r) => !EVENT_ROLES.includes(r))) {
    return res.status(400).json({ error: `roles must be a list using: ${EVENT_ROLES.join(', ')}` });
  }

  // Don't let an organizer lock themselves out of their own event by accident
  if (userId === req.user._id.toString() && !roles.includes('organizer') && req.user.role !== 'admin') {
    return res.status(400).json({ error: "You can't remove your own organizer role." });
  }

  if (roles.length === 0) {
    await EventMember.deleteOne({ user: userId, event: eventId });
    return res.json({ membership: null });
  }

  const membership = await EventMember.findOneAndUpdate(
    { user: userId, event: eventId },
    { $set: { roles } },
    { upsert: true, new: true }
  );

  await notify(userId, {
    type: 'role_changed',
    title: 'Your event role was updated',
    message: `You're now: ${roles.join(', ')}.`,
    link: `/events/${eventId}`,
  });

  res.json({ membership: { eventId, userId, roles: membership.roles } });
}));

router.use(apiErrorHandler);

module.exports = router;
