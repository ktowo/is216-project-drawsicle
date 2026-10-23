const { Router } = require('express');
const mongoose = require('mongoose');
const User = require('../models/User.js');
const InviteCode = require('../models/InviteCode.js');
const Event = require('../models/Event.js');
const EventMember = require('../models/EventMember.js');
const Application = require('../models/Application.js');
const Match = require('../models/Match.js');
const Submission = require('../models/Submission.js');
const Character = require('../models/Character.js');
const Notification = require('../models/Notification.js');
const AuditLog = require('../models/AuditLog.js');
const Report = require('../models/Report.js');
const ChatMessage = require('../models/ChatMessage.js');
const { MUTE_OPTIONS } = require('../../shared/chat.mjs');
const { requireAuth, requirePermission } = require('../middleware/auth.js');
const { withdrawApplications, anonymiseUser } = require('../services/accounts.js');
const { organizerIds, serializeEvent, serializeEvents, deleteEventCascade } = require('../services/events.js');
const { notify, notifyMany } = require('../services/notify.js');
const { describeTarget } = require('../services/reports.js');
const { visionReport, visionTest } = require('../services/vision.js');
const { asyncHandler, apiErrorHandler, httpError } = require('../utils/helpers.js');
const { ALL_EVENT_STATUSES, USER_STATUSES, SITE_ROLES, REPORT_STATUSES } = require('../../shared/constants.mjs');

const { userMini } = User;

// Site admin tools. Who can use what is in shared/permissions.mjs: moderators get reports, chat
// and lookups; admins get everything. Every change is written to the audit log.
const router = Router();
router.use(requireAuth, requirePermission('admin.access'));
const may = requirePermission;

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const isDuplicate = (err, field) => err?.code === 11000 && Boolean(err.keyPattern?.[field] || err.keyValue?.[field]);

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
    chatMutedUntil: user.chatMutedUntil && user.chatMutedUntil > new Date() ? user.chatMutedUntil : null,
    chatMuteReason: user.chatMuteReason || '',
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

// Higher roles can do more; used to word role changes in the audit log
const ROLE_RANK = { user: 0, moderator: 1, admin: 2 };

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

router.get('/stats', may('stats.view'), asyncHandler(async (req, res) => {
  const [userRows, admins, moderators, eventRows, disabled, applications, matches, submissions, newestUsers, newestEvents, openReports] =
    await Promise.all([
      User.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ role: 'moderator' }),
      Event.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
      Event.countDocuments({ disabledAt: { $ne: null } }),
      Application.countDocuments({ status: { $ne: 'withdrawn' } }),
      Match.countDocuments({ published: true }),
      Submission.countDocuments(),
      User.find().sort({ createdAt: -1 }).limit(5),
      Event.find().sort({ createdAt: -1 }).limit(5),
      Report.countDocuments({ status: 'open' }),
    ]);

  const users = Object.fromEntries(USER_STATUSES.map((s) => [s, 0]));
  for (const row of userRows) users[row._id || 'active'] = row.n;
  const byStatus = Object.fromEntries(ALL_EVENT_STATUSES.map((s) => [s, 0]));
  for (const row of eventRows) byStatus[row._id] = row.n;

  const inviteSummary = await InviteCode.aggregate([
    { $project: { capacity: 1, used: { $size: '$signups' } } },
    { $group: { _id: null, codes: { $sum: 1 }, capacity: { $sum: '$capacity' }, used: { $sum: '$used' } } },
  ]);
  res.json({
    users: { ...users, total: Object.values(users).reduce((a, b) => a + b, 0), admins, moderators },
    events: { byStatus, total: Object.values(byStatus).reduce((a, b) => a + b, 0), disabled },
    applications,
    matches,
    submissions,
    invites: inviteSummary[0] || { codes: 0, capacity: 0, used: 0 },
    openReports,
    recent: {
      users: newestUsers.map((u) => adminUser(u)),
      events: newestEvents.map((e) => e.toMini()),
    },
  });
}));

router.get('/invites', may('invites.manage'), asyncHandler(async (req, res) => {
  const invites = await InviteCode.find().sort({ createdAt: -1 }).populate('signups.user', 'displayName username email');
  res.json({
    invites: invites.map((invite) => ({
      id: invite._id.toString(),
      code: invite.code,
      capacity: invite.capacity,
      used: invite.signups.length,
      createdAt: invite.createdAt,
      signups: invite.signups.map((signup) => ({
        email: signup.email,
        signedUpAt: signup.signedUpAt,
        user: signup.user ? { id: signup.user._id.toString(), displayName: signup.user.displayName, username: signup.user.username } : null,
      })),
    })),
  });
}));

router.post('/invites', may('invites.manage'), asyncHandler(async (req, res) => {
  const code = str(req.body?.code).toUpperCase();
  const capacity = Number(req.body?.capacity);
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) throw httpError(400, 'Use 3-40 letters, numbers, hyphens or underscores.', 'VALIDATION');
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000) throw httpError(400, 'Capacity must be a whole number from 1 to 10,000.', 'VALIDATION');
  try {
    const invite = await InviteCode.create({ code, capacity, createdBy: req.user._id });
    await audit(req, 'invite.create', 'invite', invite._id, invite.code, `Capacity: ${capacity}`);
    res.status(201).json({ invite: { id: invite._id.toString(), code: invite.code, capacity: invite.capacity, used: 0, signups: [], createdAt: invite.createdAt } });
  } catch (err) {
    if (isDuplicate(err, 'code')) throw httpError(409, 'That invite code already exists.', 'INVITE_TAKEN');
    throw err;
  }
}));

router.patch('/invites/:inviteId', may('invites.manage'), asyncHandler(async (req, res) => {
  const capacity = Number(req.body?.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000) throw httpError(400, 'Capacity must be a whole number from 1 to 10,000.', 'VALIDATION');
  const invite = await InviteCode.findById(req.params.inviteId);
  if (!invite) throw httpError(404, 'Invite code not found.', 'NOT_FOUND');
  if (capacity < invite.signups.length) throw httpError(400, `Capacity cannot be below the ${invite.signups.length} existing sign-ups.`, 'VALIDATION');
  invite.capacity = capacity;
  await invite.save();
  res.json({ invite: { id: invite._id.toString(), code: invite.code, capacity: invite.capacity, used: invite.signups.length, signups: invite.signups, createdAt: invite.createdAt } });
}));

// ---------- Users ----------

router.get('/users', may('users.view'), asyncHandler(async (req, res) => {
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

router.patch('/users/:userId', may('users.roles'), asyncHandler(async (req, res) => {
  const user = await findUser(req);
  const { role } = req.body || {};
  if (!SITE_ROLES.includes(role)) throw httpError(400, `role must be one of: ${SITE_ROLES.join(', ')}.`, 'VALIDATION');
  notSelf(req, user, "You can't change your own role. Ask another admin.");
  if (user.status === 'banned' && role !== 'user') {
    throw httpError(400, 'Unban this account before giving it a site role.', 'VALIDATION');
  }
  if (user.role !== role) {
    const was = user.role;
    user.role = role;
    await user.save();
    await audit(req, ROLE_RANK[role] > ROLE_RANK[was] ? 'user.promote' : 'user.demote', 'user', user._id, user.displayName || user.email, `${was} → ${role}`);
  }
  res.json({ user: adminUser(user) });
}));

router.post('/users/:userId/ban', may('users.manage'), asyncHandler(async (req, res) => {
  const user = await findUser(req);
  const reason = readReason(req.body, true);
  notSelf(req, user, "You can't ban yourself.");
  if (user.role !== 'user') throw httpError(400, 'Take away their site role before banning them.', 'VALIDATION');
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

router.post('/users/:userId/unban', may('users.manage'), asyncHandler(async (req, res) => {
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
router.delete('/users/:userId', may('users.manage'), asyncHandler(async (req, res) => {
  const user = await findUser(req);
  notSelf(req, user, "You can't delete your own account from here.");
  if (user.role !== 'user') throw httpError(400, 'Take away their site role before deleting the account.', 'VALIDATION');
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

router.get('/events', may('events.moderate'), asyncHandler(async (req, res) => {
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

router.post('/events/:eventId/disable', may('events.moderate'), asyncHandler(async (req, res) => {
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

router.post('/events/:eventId/enable', may('events.moderate'), asyncHandler(async (req, res) => {
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

router.post('/events/:eventId/cancel', may('events.moderate'), asyncHandler(async (req, res) => {
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

router.post('/events/:eventId/restore', may('events.moderate'), asyncHandler(async (req, res) => {
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

router.delete('/events/:eventId', may('events.moderate'), asyncHandler(async (req, res) => {
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

// ---------- Reports ----------

async function reportJson(report) {
  const target = await describeTarget(report.targetType, report.targetId);
  return {
    id: report._id.toString(),
    targetType: report.targetType,
    targetId: report.targetId.toString(),
    targetLabel: target?.label || report.targetLabel,
    targetGone: !target,
    link: target?.link || '',
    preview: target?.preview || null,
    owner: report.targetOwner ? userMini(report.targetOwner) : null,
    event: report.event ? { id: report.event._id.toString(), name: report.event.name } : null,
    reason: report.reason,
    details: report.details,
    status: report.status,
    reporter: userMini(report.reporter),
    handledBy: report.handledBy ? userMini(report.handledBy) : null,
    handledAt: report.handledAt,
    resolution: report.resolution,
    createdAt: report.createdAt,
  };
}

const REPORT_POPULATE = [
  ['reporter', 'displayName username avatarUrl'],
  ['targetOwner', 'displayName username avatarUrl status'],
  ['handledBy', 'displayName username avatarUrl'],
  ['event', 'name'],
];
const populateReport = (query) => REPORT_POPULATE.reduce((q, [path, select]) => q.populate(path, select), query);

router.get('/reports', may('reports.review'), asyncHandler(async (req, res) => {
  const { page, limit, skip } = paging(req);
  const status = REPORT_STATUSES.includes(req.query.status) ? req.query.status : 'open';
  const filter = { status };
  const [reports, total, countRows] = await Promise.all([
    // Open reports oldest first, so nothing waits forever; handled ones newest first
    populateReport(Report.find(filter).sort({ createdAt: status === 'open' ? 1 : -1 }).skip(skip).limit(limit)),
    Report.countDocuments(filter),
    Report.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  const counts = Object.fromEntries(REPORT_STATUSES.map((s) => [s, 0]));
  for (const row of countRows) counts[row._id] = row.n;
  res.json({
    reports: await Promise.all(reports.map(reportJson)),
    counts,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
}));

const REPORT_DONE_MESSAGES = {
  resolved: 'An admin looked into it and took action. Thanks for helping keep Drawsicle friendly.',
  dismissed: "An admin looked into it and found it doesn't break the community guidelines. Thanks for letting us know.",
};

router.patch('/reports/:reportId', may('reports.review'), asyncHandler(async (req, res) => {
  const { reportId } = req.params;
  const report = mongoose.isValidObjectId(reportId) ? await Report.findById(reportId) : null;
  if (!report) throw httpError(404, 'Report not found.', 'NOT_FOUND');
  const status = req.body?.status;
  if (!REPORT_STATUSES.includes(status)) throw httpError(400, 'Pick open, resolved or dismissed.', 'VALIDATION');
  const resolution = str(req.body?.resolution).slice(0, 500);
  const was = report.status;

  report.status = status;
  report.resolution = status === 'open' ? '' : resolution;
  report.handledBy = status === 'open' ? null : req.user._id;
  report.handledAt = status === 'open' ? null : new Date();
  await report.save();

  const action = { open: 'report.reopen', resolved: 'report.resolve', dismissed: 'report.dismiss' }[status];
  await audit(req, action, 'report', report._id, report.targetLabel, resolution);

  // Let the reporter know it was looked at (once, when it first leaves the queue)
  if (was === 'open' && status !== 'open') {
    try {
      await notify(report.reporter, {
        type: 'report_handled',
        title: `Your report about ${report.targetLabel} was reviewed`.slice(0, 120),
        message: REPORT_DONE_MESSAGES[status],
        link: '',
      });
    } catch (err) {
      console.error('Report notification failed:', err.message);
    }
  }

  res.json({ report: await reportJson(await populateReport(Report.findById(report._id))) });
}));

// ---------- Museum chat ----------

const chatRow = (m) => ({
  id: m._id.toString(),
  room: m.room,
  roomLabel: m.roomLabel,
  link: m.room.startsWith('wing:') ? `/museum/${m.event}` : `/events/${m.event}/museum`,
  user: m.user ? { ...userMini(m.user), email: m.user.email, role: m.user.role, chatMutedUntil: m.user.chatMutedUntil && m.user.chatMutedUntil > new Date() ? m.user.chatMutedUntil : null } : userMini(null),
  kind: m.kind,
  emote: m.emote,
  text: m.text,
  createdAt: m.createdAt,
  hidden: Boolean(m.hiddenAt),
  hiddenAt: m.hiddenAt,
  hiddenBy: m.hiddenBy ? userMini(m.hiddenBy) : null,
});

// Every message said in the museum, newest first. q searches the words; person matches a name,
// username or email; show = 'hidden' or 'visible'.
router.get('/chat', may('chat.logs'), asyncHandler(async (req, res) => {
  const { page, limit, skip } = paging(req);
  const filter = {};
  const q = str(req.query.q).slice(0, 100);
  if (q) filter.text = { $regex: escapeRegex(q), $options: 'i' };
  const person = str(req.query.person).slice(0, 100);
  if (person) {
    const re = { $regex: escapeRegex(person), $options: 'i' };
    filter.user = { $in: await User.find({ $or: [{ displayName: re }, { username: re }, { email: re }] }).distinct('_id') };
  }
  if (req.query.show === 'hidden') filter.hiddenAt = { $ne: null };
  if (req.query.show === 'visible') filter.hiddenAt = null;
  const [messages, total] = await Promise.all([
    ChatMessage.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'displayName username avatarUrl email role chatMutedUntil')
      .populate('hiddenBy', 'displayName username avatarUrl'),
    ChatMessage.countDocuments(filter),
  ]);
  res.json({ messages: messages.map(chatRow), total, page, pages: Math.max(1, Math.ceil(total / limit)) });
}));

async function findMessage(req) {
  const { messageId } = req.params;
  const message = mongoose.isValidObjectId(messageId) ? await ChatMessage.findById(messageId) : null;
  if (!message) throw httpError(404, 'Message not found.', 'NOT_FOUND');
  return message;
}

router.post('/chat/:messageId/hide', may('chat.moderate'), asyncHandler(async (req, res) => {
  const message = await findMessage(req);
  if (!message.hiddenAt) {
    message.hiddenAt = new Date();
    message.hiddenBy = req.user._id;
    await message.save();
    await audit(req, 'chat.hide', 'chat', message._id, message.text.slice(0, 80), readReason(req.body, false));
  }
  res.json({ ok: true });
}));

router.post('/chat/:messageId/unhide', may('chat.moderate'), asyncHandler(async (req, res) => {
  const message = await findMessage(req);
  if (message.hiddenAt) {
    message.hiddenAt = null;
    message.hiddenBy = null;
    await message.save();
    await audit(req, 'chat.unhide', 'chat', message._id, message.text.slice(0, 80));
  }
  res.json({ ok: true });
}));

// Pause someone's museum chat for a while (they can still walk around and look)
router.post('/users/:userId/mute', may('chat.moderate'), asyncHandler(async (req, res) => {
  const user = await findUser(req);
  notSelf(req, user, "You can't mute yourself.");
  if (user.role !== 'user') throw httpError(400, "Moderators and admins can't be muted.", 'VALIDATION');
  const minutes = Number(req.body?.minutes);
  if (!MUTE_OPTIONS.some((o) => o.minutes === minutes)) {
    throw httpError(400, `Pick how long: ${MUTE_OPTIONS.map((o) => o.label).join(', ')}.`, 'VALIDATION');
  }
  const reason = readReason(req.body, true);
  user.chatMutedUntil = new Date(Date.now() + minutes * 60 * 1000);
  user.chatMuteReason = reason;
  await user.save();
  await audit(req, 'user.mute', 'user', user._id, user.displayName || user.email, `${MUTE_OPTIONS.find((o) => o.minutes === minutes).label}: ${reason}`);
  try {
    await notifyMany([user._id], {
      type: 'chat_muted',
      title: 'Your museum chat is paused for a while',
      message: `A moderator paused your chat: ${reason}`.slice(0, 500),
      link: '/museum',
    });
  } catch (err) {
    console.error('Mute notification failed:', err.message);
  }
  res.json({ user: adminUser(user) });
}));

router.post('/users/:userId/unmute', may('chat.moderate'), asyncHandler(async (req, res) => {
  const user = await findUser(req);
  if (user.chatMutedUntil) {
    user.chatMutedUntil = null;
    user.chatMuteReason = '';
    await user.save();
    await audit(req, 'user.unmute', 'user', user._id, user.displayName || user.email);
  }
  res.json({ user: adminUser(user) });
}));

// ---------- Audit log ----------

// ---------- Vision (Ollama, for art style matching) ----------

router.get('/vision', may('stats.view'), asyncHandler(async (req, res) => {
  res.json({ report: await visionReport() });
}));

router.post('/vision/test', may('stats.view'), asyncHandler(async (req, res) => {
  const report = await visionReport();
  if (!report.reachable) {
    return res.json({ result: { ok: false, step: 'connect', error: report.error || 'Ollama is not set up yet.', timings: {} } });
  }
  res.json({ result: await visionTest() });
}));

router.get('/audit', may('audit.view'), asyncHandler(async (req, res) => {
  const { page, limit, skip } = paging(req);
  const filter = {};
  if (['user', 'event', 'report', 'chat'].includes(req.query.targetType)) filter.targetType = req.query.targetType;
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
