const { Router } = require('express');
const mongoose = require('mongoose');
const Event = require('../models/Event.js');
const EventMember = require('../models/EventMember.js');
const Presence = require('../models/Presence.js');
const ChatMessage = require('../models/ChatMessage.js');
const { userMini } = require('../models/User.js');
const { requireAuth, optionalAuth } = require('../middleware/auth.js');
const { asyncHandler, httpError } = require('../utils/helpers.js');
const { CHAT, ROOM_KINDS, roomKey, parseChat, cooldownLeft, isRepeat } = require('../../shared/chat.mjs');
const { cleanLook } = require('../../shared/looks.mjs');

// The museum's rooms are shared: everyone in a room sees where the others stand and what they
// say. There are no sockets (the site runs on serverless functions), so each visitor's page
// syncs every few seconds: it sends where you are and gets back who else is there and any new
// chat. Mounted inside museum-router.js at /api/museum/rooms.
//
//   GET  /:kind/:eventId/:room/sync?since=   who's here and new chat (guests can watch wings)
//   POST /:kind/:eventId/:room/sync          the same, after saving where you are
//   POST /:kind/:eventId/:room/chat          say something (cooldowns and mutes apply)
//   POST /leave                              you left the museum
//
// kind 'wing' is the public museum (finished public exchanges); 'gallery' is an exchange's own
// members-only gallery.
const router = Router();

const FINISHED = { publicity: 'public', status: 'completed', disabledAt: null };
const USER_FIELDS = 'displayName username avatarUrl status museumLook';
const FACINGS = ['se', 'sw', 'ne', 'nw'];
const ROOM_SIZE = 10;

const notFound = () => httpError(404, "That room isn't open.", 'NOT_FOUND');

// Can this visitor be in this room? Returns { key, event, label, link }.
async function enterRoom(req) {
  const { kind, eventId } = req.params;
  const room = Number(req.params.room);
  if (!ROOM_KINDS.includes(kind) || !mongoose.isValidObjectId(eventId) || !Number.isInteger(room) || room < 0 || room > 99) {
    throw notFound();
  }
  const event = await Event.findOne({ _id: eventId, ...(kind === 'wing' ? FINISHED : { status: 'completed', disabledAt: null }) });
  if (!event) throw notFound();
  if (kind === 'gallery') {
    if (!req.user) throw httpError(401, 'Log in to visit this gallery.', 'AUTH_REQUIRED');
    const member = await EventMember.exists({ event: event._id, user: req.user._id, roles: { $in: ['organizer', 'participant'] } });
    if (!member) throw httpError(403, 'Only members of this exchange can come in.', 'ACCESS_DENIED');
  }
  return {
    key: roomKey(kind, event.id, room),
    event,
    label: `${event.name}, room ${room + 1}`,
    link: kind === 'wing' ? `/museum/${event.id}?room=${room}` : `/events/${event.id}/museum?room=${room}`,
  };
}

// Someone in the room: the usual mini, plus their avatar's look
const person = (user) => ({ ...userMini(user), look: cleanLook(user?.museumLook) });

const chatJson = (m) => ({
  id: m._id.toString(),
  user: person(m.user),
  kind: m.kind,
  emote: m.emote || '',
  text: m.text,
  createdAt: m.createdAt,
});

// Messages after `since` (never older than the room's history window), and who else is here
async function roomState(key, viewerId, sinceValue) {
  const now = Date.now();
  let since = new Date(now - CHAT.historyMs);
  const asked = sinceValue ? new Date(String(sinceValue)) : null;
  if (asked && !Number.isNaN(asked.getTime()) && asked > since) since = asked;

  const [people, messages] = await Promise.all([
    Presence.find({
      room: key,
      updatedAt: { $gte: new Date(now - Presence.FRESH_MS) },
      ...(viewerId ? { user: { $ne: viewerId } } : {}),
    })
      .limit(40)
      .populate('user', USER_FIELDS),
    ChatMessage.find({ room: key, hiddenAt: null, createdAt: { $gt: since } })
      .sort({ createdAt: -1, _id: -1 })
      .limit(40)
      .populate('user', USER_FIELDS),
  ]);
  const shown = messages.filter((m) => m.user && (m.user.status || 'active') === 'active').reverse();
  return {
    people: people
      .filter((p) => p.user && (p.user.status || 'active') === 'active')
      .map((p) => ({ user: person(p.user), x: p.x, y: p.y, facing: p.facing, sitting: p.sitting, dancing: p.dancing })),
    messages: shown.map(chatJson),
    // Ask for messages after this next time
    cursor: shown.length ? shown[shown.length - 1].createdAt : since,
  };
}

function readSpot(body) {
  const x = Number(body?.x);
  const y = Number(body?.y);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= ROOM_SIZE || y >= ROOM_SIZE) {
    throw httpError(400, 'Where you stand must be a tile in the room.', 'VALIDATION');
  }
  const sitting = body?.sitting === true;
  return {
    x,
    y,
    facing: FACINGS.includes(body?.facing) ? body.facing : 'se',
    sitting,
    dancing: !sitting && body?.dancing === true,
  };
}

const mutedUntil = (user) => (user?.chatMutedUntil && user.chatMutedUntil > new Date() ? user.chatMutedUntil : null);

router.get('/:kind/:eventId/:room/sync', optionalAuth, asyncHandler(async (req, res) => {
  const room = await enterRoom(req);
  res.json(await roomState(room.key, req.user?._id, req.query.since));
}));

router.post('/:kind/:eventId/:room/sync', requireAuth, asyncHandler(async (req, res) => {
  const room = await enterRoom(req);
  const spot = readSpot(req.body);
  await Presence.findOneAndUpdate(
    { user: req.user._id },
    { $set: { room: room.key, label: room.label, link: room.link, ...spot, updatedAt: new Date() } },
    { upsert: true }
  );
  res.json({ ...(await roomState(room.key, req.user._id, req.body?.since)), mutedUntil: mutedUntil(req.user) });
}));

router.post('/:kind/:eventId/:room/chat', requireAuth, asyncHandler(async (req, res) => {
  const room = await enterRoom(req);
  const until = mutedUntil(req.user);
  if (until) {
    return res.status(403).json({
      error: 'A moderator has paused your chat for a while.',
      code: 'MUTED',
      mutedUntil: until,
    });
  }
  const parsed = parseChat(req.body?.text);
  if (parsed.error) throw httpError(400, parsed.error, 'VALIDATION');
  if (parsed.command) throw httpError(400, 'That command works in the room, not in chat.', 'VALIDATION');

  // Cooldowns: a short gap between messages, a breather after a burst, and no repeats
  const now = Date.now();
  const recent = (
    await ChatMessage.find({ user: req.user._id, createdAt: { $gte: new Date(now - CHAT.repeatWindowMs - CHAT.burstWindowMs) } })
      .sort({ createdAt: 1 })
      .select('text kind createdAt')
  ).map((m) => ({ at: m.createdAt.getTime(), text: m.text, kind: m.kind }));
  const wait = cooldownLeft(recent, now, parsed);
  if (wait > 0) {
    return res.status(429).json({ error: 'Slow down a little!', code: 'SLOW_DOWN', retryAfterMs: wait });
  }
  if (parsed.kind !== 'emote' && isRepeat(recent, now, parsed.text)) {
    return res.status(429).json({ error: 'You just said that.', code: 'REPEAT', retryAfterMs: CHAT.gapMs });
  }

  const message = await ChatMessage.create({
    room: room.key,
    roomLabel: room.label,
    event: room.event._id,
    user: req.user._id,
    kind: parsed.kind,
    emote: parsed.emote || '',
    text: parsed.text,
  });
  message.user = req.user;
  res.status(201).json({ message: chatJson(message), cooldownMs: CHAT.gapMs });
}));

router.post('/leave', requireAuth, asyncHandler(async (req, res) => {
  await Presence.deleteOne({ user: req.user._id });
  res.json({ ok: true });
}));

module.exports = router;
