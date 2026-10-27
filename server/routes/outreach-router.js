const { Router } = require('express');
const mongoose = require('mongoose');
const Announcement = require('../models/Announcement.js');
const Application = require('../models/Application.js');
const Event = require('../models/Event.js');
const EventInvite = require('../models/EventInvite.js');
const EventMember = require('../models/EventMember.js');
const Match = require('../models/Match.js');
const Submission = require('../models/Submission.js');
const User = require('../models/User.js');
const { userMini } = require('../models/User.js');
const { requireAuth, optionalAuth, loadEvent, requireEventRole, getEventRoles } = require('../middleware/auth.js');
const { viewerContext, canViewEvent } = require('../services/events.js');
const { notifyMany } = require('../services/notify.js');
const { postToDiscord } = require('../services/discord.js');
const { LIMITS } = require('../../shared/constants.mjs');
const { asyncHandler, apiErrorHandler, httpError, clientUrl } = require('../utils/helpers.js');

// Organisers reaching their people: updates on the event page, and inviting the group from an
// earlier exchange. Also the activity timeline on the manage page. Mounted at /api/events/:eventId.
const router = Router({ mergeParams: true });

const invalid = (message) => httpError(400, message, 'VALIDATION');
const organizerOnly = [requireAuth, loadEvent, requireEventRole('organizer')];
const MEMBER_STATUSES = ['pending', 'accepted', 'waitlisted'];

async function quietly(task) {
  try {
    await task;
  } catch (err) {
    console.error('Notification failed:', err.message);
  }
}

function announcementJson(row) {
  return {
    id: row._id.toString(),
    message: row.message,
    createdAt: row.createdAt,
    author: row.author && row.author._id ? userMini(row.author) : null,
  };
}

// ---------- Announcements ----------

router.get('/announcements', optionalAuth, loadEvent, asyncHandler(async (req, res) => {
  const ctx = await viewerContext(req.event, req.user);
  const invite = typeof req.query.invite === 'string' ? req.query.invite : undefined;
  if (!canViewEvent(req.event, ctx, invite)) throw httpError(404, 'Event not found.', 'NOT_FOUND');
  const rows = await Announcement.find({ event: req.event._id })
    .sort({ createdAt: -1, _id: -1 })
    .limit(LIMITS.announcementsShown)
    .populate('author', 'displayName username avatarUrl email');
  res.json({ announcements: rows.map(announcementJson) });
}));

router.post('/announcements', ...organizerOnly, asyncHandler(async (req, res) => {
  const { event, user } = req;
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (typeof body.message !== 'string' || !body.message.trim()) throw invalid('Write your update first.');
  const message = body.message.trim();
  if (message.length > LIMITS.announcement) {
    throw invalid(`Keep updates under ${LIMITS.announcement} characters.`);
  }

  const row = await Announcement.create({ event: event._id, author: user._id, message });
  await row.populate('author', 'displayName username avatarUrl email');

  if (body.notify !== false && event.status !== 'draft') {
    const members = await Application.find({ event: event._id, status: { $in: MEMBER_STATUSES } }).distinct('user');
    await quietly(
      notifyMany(members.filter((id) => !id.equals(user._id)), {
        type: 'announcement',
        title: `Update from ${event.name}`,
        message,
        link: `/events/${event.id}`,
        email: 'eventUpdates',
      })
    );
  }
  if (body.postToDiscord !== false && event.status !== 'draft') {
    postToDiscord(event, {
      title: `Update from the organisers of ${event.name}`,
      description: message,
      url: `${clientUrl()}/events/${event.id}`,
    });
  }

  res.status(201).json({ announcement: announcementJson(row) });
}));

router.delete('/announcements/:announcementId', ...organizerOnly, asyncHandler(async (req, res) => {
  const { announcementId } = req.params;
  if (!mongoose.isValidObjectId(announcementId)) throw httpError(404, 'That update is already gone.', 'NOT_FOUND');
  const { deletedCount } = await Announcement.deleteOne({ _id: announcementId, event: req.event._id });
  if (!deletedCount) throw httpError(404, 'That update is already gone.', 'NOT_FOUND');
  res.json({ ok: true });
}));

// A test post, so organisers know their webhook works before a real milestone
// ---------- Activity timeline ----------

const ACTIVITY_MAX = 60;
const USER_FIELDS = 'displayName username avatarUrl';
const mini = (user) => (user && user._id ? userMini(user) : null);

// Everything that happened in the event, newest first: stage changes (with who made them),
// sign-ups and withdrawals, updates, gifts arriving and backup artists stepping in.
router.get('/activity', ...organizerOnly, asyncHandler(async (req, res) => {
  const { event } = req;
  const [historyUsers, applications, announcements, submissions, backups] = await Promise.all([
    User.find({ _id: { $in: (event.statusHistory || []).map((h) => h.by).filter(Boolean) } }).select(USER_FIELDS),
    Application.find({ event: event._id }).select('user status createdAt updatedAt').populate('user', USER_FIELDS),
    Announcement.find({ event: event._id }).select('author message createdAt').populate('author', USER_FIELDS),
    Submission.find({ event: event._id }).select('giver submittedAt late').populate('giver', USER_FIELDS),
    Match.find({ event: event._id, backupGiver: { $ne: null } }).select('backupGiver backupAssignedAt').populate('backupGiver', USER_FIELDS),
  ]);
  const byId = new Map(historyUsers.map((u) => [u._id.toString(), u]));

  const items = [
    ...(event.statusHistory || []).map((h) => ({
      kind: 'status',
      status: h.status,
      at: h.at,
      by: h.by ? mini(byId.get(h.by.toString())) : null, // null: it happened automatically
    })),
    ...applications.map((a) => ({ kind: 'signup', at: a.createdAt, user: mini(a.user) })),
    ...applications
      .filter((a) => a.status === 'withdrawn')
      .map((a) => ({ kind: 'withdrawn', at: a.updatedAt, user: mini(a.user) })),
    ...announcements.map((a) => ({ kind: 'announcement', at: a.createdAt, by: mini(a.author), text: a.message.slice(0, 140) })),
    ...submissions.map((s) => ({ kind: 'gift', at: s.submittedAt, user: mini(s.giver), late: Boolean(s.late) })),
    ...backups
      .filter((m) => m.backupAssignedAt)
      .map((m) => ({ kind: 'backup', at: m.backupAssignedAt, user: mini(m.backupGiver) })),
  ]
    .filter((item) => item.at)
    .sort((a, b) => new Date(b.at) - new Date(a.at));

  res.json({ items: items.slice(0, ACTIVITY_MAX), total: items.length });
}));

router.post('/discord/test', ...organizerOnly, asyncHandler(async (req, res) => {
  const { event } = req;
  if (!event.discordWebhookUrl) throw httpError(409, 'Add a Discord webhook to this event first.', 'NO_WEBHOOK');
  const sent = await postToDiscord(event, {
    title: `Drawsicle is connected to ${event.name}`,
    description: "This channel will hear when sign-ups open and close, when matches are out and at the reveal.",
    url: `${clientUrl()}/events/${event.id}`,
  });
  if (!sent) {
    throw httpError(409, "Discord didn't accept the post. Check the webhook link is complete and still exists.", 'DISCORD_FAILED');
  }
  res.json({ sent: true });
}));

// ---------- Inviting a past group ----------

// Everyone accepted in an earlier exchange you organised gets an invite to this one, once
router.post('/invite-from', ...organizerOnly, asyncHandler(async (req, res) => {
  const { event, user } = req;
  const fromId = req.body?.fromEventId;
  const notFound = () => httpError(404, "We couldn't find that exchange among the ones you organise.", 'NOT_FOUND');
  if (!mongoose.isValidObjectId(fromId)) throw notFound();
  if (String(fromId) === event.id) throw invalid('Pick a different exchange to invite people from.');

  const source = await Event.findById(fromId);
  if (!source) throw notFound();
  const isAdmin = user.role === 'admin';
  if (!isAdmin && !(await getEventRoles(user, source._id)).includes('organizer')) throw notFound();

  if (event.status !== 'open') {
    throw httpError(409, 'Open sign-ups first, so the people you invite can join straight away.', 'WRONG_STATUS');
  }
  if ((event.invitedFrom || []).some((id) => id.equals(source._id))) {
    throw httpError(409, `You've already invited the people from ${source.name}.`, 'ALREADY_INVITED');
  }

  const [pastIds, alreadyHere, organisers] = await Promise.all([
    Application.find({ event: source._id, status: 'accepted' }).distinct('user'),
    Application.find({ event: event._id }).distinct('user'),
    EventMember.find({ event: event._id, roles: 'organizer' }).distinct('user'),
  ]);
  const skip = new Set([...alreadyHere, ...organisers, user._id].map(String));
  const candidates = pastIds.filter((id) => !skip.has(String(id)));
  const active = await User.find({ _id: { $in: candidates }, status: 'active' }).distinct('_id');

  const link = `/events/${event.id}${event.publicity === 'private' ? `?invite=${event.inviteCode}` : ''}`;
  const closes = event.signupDeadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  await quietly(
    notifyMany(active, {
      type: 'event_invite',
      title: `You're invited to ${event.name}`,
      message: `The organisers of ${source.name} are running another exchange. Sign-ups close ${closes}.`,
      link,
      email: 'eventUpdates',
    })
  );

  event.invitedFrom.push(source._id);
  await event.save();
  res.json({ sent: active.length });
}));

// ---------- Inviting one artist ----------

const artistLink = (event) => `/events/${event.id}${event.publicity === 'private' ? `?invite=${event.inviteCode}` : ''}`;

// Who this organiser has invited to the event, and whether they have signed up since
router.get('/invites', ...organizerOnly, asyncHandler(async (req, res) => {
  const { event } = req;
  const rows = await EventInvite.find({ event: event._id })
    .sort({ createdAt: -1, _id: -1 })
    .populate('artist', 'displayName username avatarUrl email');
  const joined = new Set(
    (await Application.find({ event: event._id, status: { $ne: 'withdrawn' } }).distinct('user')).map(String)
  );
  res.json({
    invites: rows.map((r) => ({
      id: r._id.toString(),
      artist: r.artist && r.artist._id ? userMini(r.artist) : null,
      message: r.message,
      at: r.createdAt,
      joined: Boolean(r.artist && joined.has(String(r.artist._id))),
    })),
  });
}));

// Invite an artist you found on Discover. They get a notification with a link to the event.
router.post('/invites', ...organizerOnly, asyncHandler(async (req, res) => {
  const { event, user } = req;
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const notFound = () => httpError(404, "We couldn't find that artist.", 'NOT_FOUND');
  if (!mongoose.isValidObjectId(body.artistId)) throw notFound();
  if (String(body.artistId) === String(user._id)) throw invalid("You can't invite yourself.");

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (message.length > LIMITS.inviteMessage) throw invalid(`Keep your message to ${LIMITS.inviteMessage} characters or fewer.`);

  if (event.status !== 'open' || event.signupDeadline <= new Date()) {
    throw httpError(409, 'You can invite artists while sign-ups are open.', 'WRONG_STATUS');
  }

  // Only artists who show up on Discover can be invited, and never someone who blocked you
  const artist = await User.findById(body.artistId);
  const blocked = artist && (artist.blockedUsers || []).some((id) => id.equals(user._id));
  if (!artist || artist.status !== 'active' || artist.profilePrivacy?.listInDiscover === false || blocked) throw notFound();

  const [isOrganiser, applied, already, count] = await Promise.all([
    EventMember.exists({ event: event._id, user: artist._id, roles: 'organizer' }),
    Application.exists({ event: event._id, user: artist._id, status: { $ne: 'withdrawn' } }),
    EventInvite.exists({ event: event._id, artist: artist._id }),
    EventInvite.countDocuments({ event: event._id }),
  ]);
  if (isOrganiser || applied) throw httpError(409, `${artist.displayName} is already part of this event.`, 'ALREADY_JOINED');
  if (already) throw httpError(409, `You've already invited ${artist.displayName}.`, 'ALREADY_INVITED');
  if (count >= LIMITS.invitesPerEvent) {
    throw httpError(409, `You can invite up to ${LIMITS.invitesPerEvent} artists to one event.`, 'LIMIT');
  }

  const invite = await EventInvite.create({ event: event._id, artist: artist._id, invitedBy: user._id, message });

  const closes = event.signupDeadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  await quietly(
    notifyMany([artist._id], {
      type: 'event_invite',
      title: `${user.displayName} invited you to ${event.name}`,
      message: message || `They found you on Discover. Sign-ups close ${closes}.`,
      link: artistLink(event),
      email: 'eventUpdates',
    })
  );
  res.status(201).json({ invite: { id: invite._id.toString(), artist: userMini(artist), message, at: invite.createdAt, joined: false } });
}));

// Take an invite back (the notification they already got stays)
router.delete('/invites/:inviteId', ...organizerOnly, asyncHandler(async (req, res) => {
  const { inviteId } = req.params;
  if (!mongoose.isValidObjectId(inviteId)) throw httpError(404, 'That invite is already gone.', 'NOT_FOUND');
  const { deletedCount } = await EventInvite.deleteOne({ _id: inviteId, event: req.event._id });
  if (!deletedCount) throw httpError(404, 'That invite is already gone.', 'NOT_FOUND');
  res.json({ ok: true });
}));

router.use(apiErrorHandler);

module.exports = router;
