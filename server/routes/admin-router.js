const { Router } = require('express');
const mongoose = require('mongoose');
const User = require('../models/User.js');
const Event = require('../models/Event.js');
const EventMember = require('../models/EventMember.js');
const Application = require('../models/Application.js');
const Match = require('../models/Match.js');
const Submission = require('../models/Submission.js');
const Character = require('../models/Character.js');
const Notification = require('../models/Notification.js');
const AuditLog = require('../models/AuditLog.js');
const { requireAuth, requireAdmin } = require('../middleware/auth.js');
const { withdrawApplications, anonymiseUser } = require('../services/accounts.js');
const { organizerIds, serializeEvent, serializeEvents, deleteEventCascade } = require('../services/events.js');
const { notifyMany } = require('../services/notify.js');
const { asyncHandler, apiErrorHandler, httpError } = require('../utils/helpers.js');
const { ALL_EVENT_STATUSES, USER_STATUSES, SITE_ROLES } = require('../../shared/constants.mjs');

const { userMini } = User;

// Site admin tools: everything here needs User.role === 'admin'.
// Every change is written to the audit log.
const router = Router();
router.use(requireAuth, requireAdmin);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const str = (v) => (typeof v === 'string' ? v.trim() : '');

function paging(req) {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

function readReason(body, required) {
  const reason = str(body?.reason).slice(0, 500);
  if (required && !reason) throw httpError(400, 'Add a short reason. The people affected will see it.', 'VALIDATION');
  return reason;
}

function audit(req, action, targetType, targetId, targetLabel, reason = '') {
  return AuditLog.create({ actor: req.user._id, action, targetType, targetId, targetLabel, reason });
}

function adminUser(user, extra = {}) {
  return {
    ...user.toMini(),
    email: user.email,
    role: user.role,
    status: user.status || 'active',
    bannedAt: user.bannedAt,
    banReason: user.banReason || '',
    deactivatedAt: user.deactivatedAt,
    createdAt: user.createdAt,
    ...extra,
  };
}

async function findUser(req) {
  const { userId } = req.params;
  const user = mongoose.isValidObjectId(userId) ? await User.findById(userId) : null;
  if (!user) throw httpError(404, 'User not found.', 'USER_NOT_FOUND');
  return user;
}

async function findEvent(req) {
  const { eventId } = req.params;
  const event = mongoose.isValidObjectId(eventId) ? await Event.findById(eventId) : null;
  if (!event) throw httpError(404, 'Event not found.', 'NOT_FOUND');
  return event;
}

function notSelf(req, user, message) {
  if (user._id.equals(req.user._id)) throw httpError(400, message, 'SELF');
}

async function acceptedIds(eventId) {
  return Application.find({ event: eventId, status: 'accepted' }).distinct('user');
}

// Organisers plus accepted participants, without duplicates
async function everyoneIn(eventId) {
  const ids = [...(await organizerIds(eventId)), ...(await acceptedIds(eventId))];
  return [...new Map(ids.map((id) => [id.toString(), id])).values()];
}

const quietly = (promise) => promise.catch((err) => console.error('Admin notification failed:', err.message));

// ---------- Overview ----------

router.get('/stats', asyncHandler(async (req, res) => {
  const [userRows, admins, eventRows, disabled, applications, matches, submissions, newestUsers, newestEvents] =
    await Promise.all([
      User.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      User.countDocuments({ role: 'admin' }),
      Event.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      Event.countDocuments({ disabledAt: { $ne: null } }),
      Application.countDocuments({ status: { $ne: 'withdrawn' } }),
      Match.countDocuments({ published: true }),
      Submission.countDocuments(),
      User.find().sort({ createdAt: -1 }).limit(5),
      Event.find().sort({ createdAt: -1 }).limit(5),
    ]);

  const users = Object.fromEntries(USER_STATUSES.map((s) => [s, 0]));
  for (const row of userRows) users[row._id || 'active'] = row.n;
  const byStatus = Object.fromEntries(ALL_EVENT_STATUSES.map((s) => [s, 0]));
  for (const row of eventRows) byStatus[row._id] = row.n;

  res.json({
    users: { ...users, total: Object.values(users).reduce((a, b) => a + b, 0), admins },
    events: { byStatus, total: Object.values(byStatus).reduce((a, b) => a + b, 0), disabled },
    applications,
    matches,
    submissions,
    recent: {
      users: newestUsers.map((u) => adminUser(u)),
      events: newestEvents.map((e) => e.toMini()),
    },
  });
}));

// ---------- Users ----------

router.get('/users', asyncHandler(async (req, res) => {
  const { page, limit, skip } = paging(req);
  const filter = {};
  const q = str(req.query.q).slice(0, 100);
  if (q) {
    const re = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ displayName: re }, { username: re }, { email: re }];
  }
  if (USER_STATUSES.includes(req.query.status)) filter.status = req.query.status;
  if (SITE_ROLES.includes(req.query.role)) filter.role = req.query.role;

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  const organizing = await EventMember.aggregate([
    { $match: { user: { $in: users.map((u) => u._id) }, roles: 'organizer' } },
    { $group: { _id: '$user', n: { $sum: 1 } } },
  ]);
  const counts = new Map(organizing.map((r) => [r._id.toString(), r.n]));

  res.json({
    users: users.map((u) => adminUser(u, { eventsOrganized: counts.get(u._id.toString()) || 0 })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
}));

router.patch('/users/:userId', asyncHandler(async (req, res) => {
  const user = await findUser(req);
  const { role } = req.body || {};
  if (!SITE_ROLES.includes(role)) throw httpError(400, `role must be one of: ${SITE_ROLES.join(', ')}.`, 'VALIDATION');
  notSelf(req, user, "You can't change your own role. Ask another admin.");
  if (user.status === 'banned' && role === 'admin') {
    throw httpError(400, 'Unban this account before making it an admin.', 'VALIDATION');
  }
  if (user.role !== role) {
    user.role = role;
    await user.save();
    await audit(req, role === 'admin' ? 'user.promote' : 'user.demote', 'user', user._id, user.displayName || user.email);
  }
  res.json({ user: adminUser(user) });
}));

router.post('/users/:userId/ban', asyncHandler(async (req, res) => {
  const user = await findUser(req);
  const reason = readReason(req.body, true);
  notSelf(req, user, "You can't ban yourself.");
  if (user.role === 'admin') throw httpError(400, 'Remove their admin role before banning them.', 'VALIDATION');
  if (user.status === 'banned') throw httpError(409, 'This account is already banned.', 'ALREADY_BANNED');

  user.status = 'banned';
  user.bannedAt = new Date();
  user.banReason = reason;
  user.bannedBy = req.user._id;
  user.sessionVersion = (user.sessionVersion || 0) + 1; // logs them out everywhere
  await user.save();
  const withdrawn = await withdrawApplications(user);
  await audit(req, 'user.ban', 'user', user._id, user.displayName || user.email, reason);
  res.json({ user: adminUser(user), withdrawnApplications: withdrawn });
}));

router.post('/users/:userId/unban', asyncHandler(async (req, res) => {
  const user = await findUser(req);
  if (user.status !== 'banned') throw httpError(409, "This account isn't banned.", 'NOT_BANNED');
  user.status = 'active';
  user.bannedAt = null;
  user.banReason = '';
  user.bannedBy = null;
  await user.save();
  await audit(req, 'user.unban', 'user', user._id, user.displayName || user.email, readReason(req.body, false));
  res.json({ user: adminUser(user) });
}));

// Deleting keeps the document (anonymised) so past events, matches and gifts stay intact
router.delete('/users/:userId', asyncHandler(async (req, res) => {
  const user = await findUser(req);
  notSelf(req, user, "You can't delete your own account from here.");
  if (user.role === 'admin') throw httpError(400, 'Remove their admin role before deleting the account.', 'VALIDATION');
  const label = user.displayName || user.email;

  await withdrawApplications(user);
  await Promise.all([
    Character.updateMany({ owner: user._id, archivedAt: null }, { $set: { archivedAt: new Date() } }),
    Notification.deleteMany({ user: user._id }),
    User.updateOne(
      { _id: user._id },
      { $set: { status: 'deactivated', deactivatedAt: new Date(), bannedAt: null, banReason: '', bannedBy: null } }
    ),
  ]);
  await anonymiseUser(user._id);
  await audit(req, 'user.delete', 'user', user._id, label, readReason(req.body, false));
  res.json({ ok: true });
}));

// ---------- Events ----------

router.get('/events', asyncHandler(async (req, res) => {
  const { page, limit, skip } = paging(req);
  const filter = {};
  const q = str(req.query.q).slice(0, 100);
  if (q) {
    const re = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: re }, { theme: re }];
  }
  if (ALL_EVENT_STATUSES.includes(req.query.status)) filter.status = req.query.status;
  if (req.query.moderation === 'disabled') filter.disabledAt = { $ne: null };
  if (req.query.moderation === 'none') filter.disabledAt = null;

  const [events, total] = await Promise.all([
    Event.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('createdBy', 'displayName username avatarUrl email'),
    Event.countDocuments(filter),
  ]);
  const serialized = await serializeEvents(events, req.user);
  res.json({
    events: serialized.map((e, i) => ({ ...e, createdBy: userMini(events[i].createdBy) })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
}));

router.post('/events/:eventId/disable', asyncHandler(async (req, res) => {
  const event = await findEvent(req);
  const reason = readReason(req.body, true);
  if (event.disabledAt) throw httpError(409, 'This event is already disabled.', 'ALREADY_DISABLED');
  event.disabledAt = new Date();
  event.disabledReason = reason;
  event.disabledBy = req.user._id;
  await event.save();
  await quietly(
    notifyMany(await organizerIds(event._id), {
      type: 'event_status',
      title: `${event.name} was disabled by the site admins`,
      message: `Only organisers can see it until it's turned back on. Reason: ${reason}`,
      link: `/events/${event._id}`,
      email: 'eventUpdates',
    })
  );
  await audit(req, 'event.disable', 'event', event._id, event.name, reason);
  res.json({ event: await serializeEvent(event, req.user) });
}));

router.post('/events/:eventId/enable', asyncHandler(async (req, res) => {
  const event = await findEvent(req);
  if (!event.disabledAt) throw httpError(409, "This event isn't disabled.", 'NOT_DISABLED');
  event.disabledAt = null;
  event.disabledReason = '';
  event.disabledBy = null;
  await event.save();
  await quietly(
    notifyMany(await organizerIds(event._id), {
      type: 'event_status',
      title: `${event.name} is visible again`,
      message: 'The site admins turned your event back on.',
      link: `/events/${event._id}`,
    })
  );
  await audit(req, 'event.enable', 'event', event._id, event.name, readReason(req.body, false));
  res.json({ event: await serializeEvent(event, req.user) });
}));

router.post('/events/:eventId/cancel', asyncHandler(async (req, res) => {
  const event = await findEvent(req);
  const reason = readReason(req.body, true);
  if (event.status === 'cancelled') throw httpError(409, 'This event is already cancelled.', 'ALREADY_CANCELLED');
  event.statusBeforeCancel = event.status;
  event.setStatus('cancelled', req.user._id);
  event.cancelledAt = new Date();
  event.cancelReason = reason;
  event.cancelledBy = req.user._id;
  await event.save();
  await quietly(
    notifyMany(await everyoneIn(event._id), {
      type: 'event_status',
      title: `${event.name} was cancelled`,
      message: `The site admins cancelled this event. Reason: ${reason}`,
      link: `/events/${event._id}`,
      email: 'eventUpdates',
    })
  );
  await audit(req, 'event.cancel', 'event', event._id, event.name, reason);
  res.json({ event: await serializeEvent(event, req.user) });
}));

router.post('/events/:eventId/restore', asyncHandler(async (req, res) => {
  const event = await findEvent(req);
  if (event.status !== 'cancelled') throw httpError(409, "This event isn't cancelled.", 'NOT_CANCELLED');
  event.setStatus(event.statusBeforeCancel || 'draft', req.user._id);
  event.statusBeforeCancel = null;
  event.cancelledAt = null;
  event.cancelReason = '';
  event.cancelledBy = null;
  await event.save();
  await quietly(
    notifyMany(await everyoneIn(event._id), {
      type: 'event_status',
      title: `${event.name} is back on`,
      message: 'The site admins restored this event.',
      link: `/events/${event._id}`,
      email: 'eventUpdates',
    })
  );
  await audit(req, 'event.restore', 'event', event._id, event.name, readReason(req.body, false));
  res.json({ event: await serializeEvent(event, req.user) });
}));

router.delete('/events/:eventId', asyncHandler(async (req, res) => {
  const event = await findEvent(req);
  const reason = readReason(req.body, false);
  await quietly(
    notifyMany(await everyoneIn(event._id), {
      type: 'event_status',
      title: `${event.name} was removed`,
      message: reason ? `The site admins removed this event. Reason: ${reason}` : 'The site admins removed this event.',
      link: '/my-events',
    })
  );
  await deleteEventCascade(event);
  await audit(req, 'event.delete', 'event', event._id, event.name, reason);
  res.json({ ok: true });
}));

// ---------- Audit log ----------

router.get('/audit', asyncHandler(async (req, res) => {
  const { page, limit, skip } = paging(req);
  const filter = {};
  if (['user', 'event'].includes(req.query.targetType)) filter.targetType = req.query.targetType;
  const [entries, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('actor', 'displayName username avatarUrl email'),
    AuditLog.countDocuments(filter),
  ]);
  res.json({
    entries: entries.map((e) => ({
      id: e._id.toString(),
      action: e.action,
      targetType: e.targetType,
      targetId: e.targetId.toString(),
      targetLabel: e.targetLabel,
      reason: e.reason,
      actor: userMini(e.actor),
      createdAt: e.createdAt,
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
}));

router.use(apiErrorHandler);

module.exports = router;
