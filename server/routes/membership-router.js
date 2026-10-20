const { Router } = require('express');
const mongoose = require('mongoose');
const EventMember = require('../models/EventMember.js');
const { EVENT_ROLES } = EventMember;
const User = require('../models/User.js');
const { userMini } = User;
const Event = require('../models/Event.js');
const { requireAuth, requireEventRole } = require('../middleware/auth.js');
const { notify } = require('../services/notify.js');
const { asyncHandler, apiErrorHandler, httpError } = require('../utils/helpers.js');

const router = Router();
router.use(requireAuth);

// organizer comes from creating an event / the organisers list, participant from an
// accepted application. Only the helper roles are set by hand here.
const MANAGED_ROLES = ['organizer', 'participant'];
const ROLE_LABELS = { organizer: 'Organiser', participant: 'Participant', helper: 'Helper', approver: 'Approver' };

// My roles across all events (for the dashboard and navbar)
router.get('/mine', asyncHandler(async (req, res) => {
  const rows = await EventMember.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .populate('event', 'name status');

  res.json({
    memberships: rows
      .filter((m) => m.event) // event deleted since
      .map((m) => ({
        eventId: m.event._id.toString(),
        eventName: m.event.name,
        eventStatus: m.event.status,
        roles: [...m.roles],
      })),
  });
}));

// Everyone in an event and their roles (organisers and approvers). Emails are for organisers only.
router.get('/events/:eventId', requireEventRole('organizer', 'approver'), asyncHandler(async (req, res) => {
  const showEmail = req.user.role === 'admin' || req.eventRoles.includes('organizer');
  const rows = await EventMember.find({ event: req.params.eventId })
    .sort({ createdAt: 1 })
    .populate('user', 'displayName username avatarUrl email status');

  res.json({
    members: rows
      .filter((m) => m.user)
      .map((m) => ({
        user: userMini(m.user),
        userId: m.user._id.toString(),
        displayName: userMini(m.user).displayName,
        avatarUrl: m.user.avatarUrl || null,
        ...(showEmail ? { email: m.user.email } : {}),
        roles: [...m.roles],
      })),
  });
}));

// Set someone's helper roles in an event (organisers only). Body: { roles: ['helper', 'approver'] }
// organizer / participant may be listed but can't be added or removed here.
router.put('/events/:eventId/users/:userId', requireEventRole('organizer'), asyncHandler(async (req, res) => {
  const { eventId, userId } = req.params;
  if (!mongoose.isObjectIdOrHexString(userId)) throw httpError(400, 'Invalid user id.', 'INVALID_ID');

  const requested = Array.isArray(req.body?.roles) ? [...new Set(req.body.roles)] : null;
  if (!requested || requested.some((r) => !EVENT_ROLES.includes(r))) {
    throw httpError(400, `roles must be a list using: ${EVENT_ROLES.join(', ')}`, 'VALIDATION');
  }

  if (!(await Event.exists({ _id: eventId }))) throw httpError(404, 'Event not found.', 'NOT_FOUND');
  if (!(await User.exists({ _id: userId, status: { $ne: 'deactivated' } }))) {
    throw httpError(404, 'User not found.', 'USER_NOT_FOUND');
  }

  const current = await EventMember.findOne({ user: userId, event: eventId });
  const currentRoles = current ? [...current.roles] : [];
  for (const role of MANAGED_ROLES) {
    if (requested.includes(role) !== currentRoles.includes(role)) {
      throw httpError(
        400,
        role === 'organizer'
          ? 'Add or remove organisers from the event settings.'
          : 'Participants join by signing up; accept or remove their application instead.',
        'ROLE_MANAGED_ELSEWHERE'
      );
    }
  }

  const roles = EVENT_ROLES.filter((r) => requested.includes(r));
  const changed = roles.length !== currentRoles.length || roles.some((r) => !currentRoles.includes(r));

  if (roles.length === 0) {
    if (current) await current.deleteOne();
    return res.json({ membership: null });
  }

  const membership = await EventMember.findOneAndUpdate(
    { user: userId, event: eventId },
    { $set: { roles } },
    { upsert: true, returnDocument: 'after' }
  );

  if (changed && userId !== req.user._id.toString()) {
    await notify(userId, {
      type: 'role_changed',
      title: 'Your event role was updated',
      message: `Your roles: ${roles.map((r) => ROLE_LABELS[r]).join(', ')}.`,
      link: `/events/${eventId}`,
    });
  }

  res.json({ membership: { eventId, userId, roles: [...membership.roles] } });
}));

router.use(apiErrorHandler);

module.exports = router;
