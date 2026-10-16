// Shared museum rooms in the demo (server/routes/museum-rooms.js). The demo has only you in it,
// so "who's here" is just the people the server would list, and chat is kept in this browser,
// along with the guestbook and how often the cats have been petted.
import { CHAT, GUESTBOOK, PET_EMOTE, ROOM_KINDS, roomKey, parseChat, cleanText, cooldownLeft, isRepeat } from '@shared/chat.mjs';
import { CATS } from '@shared/museum-cats.mjs';
import { can } from '@shared/permissions.mjs';
import { isId, newId } from '../db.js';
import { findUser, miniOf } from '../model.js';
import { cleanLook } from '@shared/looks.mjs';
import { httpError } from '../util.js';

const FRESH_MS = 40 * 1000;
const FACINGS = ['se', 'sw', 'ne', 'nw'];
const ROOM_SIZE = 10;

const notFound = () => httpError(404, "That room isn't open.", 'NOT_FOUND');

// Can this visitor come into this exchange's rooms? Returns the event.
function enterPlace(ctx) {
  const { state } = ctx;
  const { kind, eventId } = ctx.params;
  if (!ROOM_KINDS.includes(kind) || !isId(eventId)) throw notFound();
  const event = state.events.find((e) => e.id === eventId);
  const open =
    event &&
    event.status === 'completed' &&
    !event.disabledAt &&
    (kind === 'gallery' || event.publicity === 'public');
  if (!open) throw notFound();
  if (kind === 'gallery') {
    const user = ctx.currentUser();
    if (!user) throw httpError(401, 'Log in to visit this gallery.', 'AUTH_REQUIRED');
    const member = state.members.find((m) => m.user === user.id && m.event === event.id);
    if (!member || !member.roles.some((r) => ['organizer', 'participant'].includes(r))) {
      throw httpError(403, 'Only members of this exchange can come in.', 'ACCESS_DENIED');
    }
  }
  return event;
}

function enterRoom(ctx) {
  const { kind } = ctx.params;
  const room = Number(ctx.params.room);
  if (!Number.isInteger(room) || room < 0 || room > 99) throw notFound();
  const event = enterPlace(ctx);
  return {
    key: roomKey(kind, event.id, room),
    event,
    label: `${event.name}, room ${room + 1}`,
    link: kind === 'wing' ? `/museum/${event.id}?room=${room}` : `/events/${event.id}/museum?room=${room}`,
  };
}

// Someone in the room: the usual mini, plus their avatar's look
function person(state, id) {
  return { ...miniOf(state, id), look: cleanLook(findUser(state, id)?.museumLook) };
}

const chatJson = (state, m) => ({
  id: m.id,
  user: person(state, m.user),
  kind: m.kind,
  emote: m.emote || '',
  target: m.target || '',
  text: m.text,
  createdAt: m.createdAt,
});

function roomState(ctx, key, viewerId, sinceValue) {
  const { state } = ctx;
  const now = ctx.now.getTime();
  let since = now - CHAT.historyMs;
  const asked = sinceValue ? new Date(String(sinceValue)).getTime() : NaN;
  if (!Number.isNaN(asked) && asked > since) since = asked;
  const messages = state.chats
    .filter((m) => m.room === key && !m.hiddenAt && new Date(m.createdAt).getTime() > since)
    .slice(-40);
  return {
    people: state.presence
      .filter((p) => p.room === key && p.user !== viewerId && now - new Date(p.updatedAt).getTime() < FRESH_MS)
      .map((p) => ({ user: person(state, p.user), x: p.x, y: p.y, facing: p.facing, sitting: p.sitting, dancing: Boolean(p.dancing) })),
    messages: messages.map((m) => chatJson(state, m)),
    cursor: messages.length ? messages[messages.length - 1].createdAt : new Date(since).toISOString(),
  };
}

const mutedUntil = (user, now) =>
  user?.chatMutedUntil && new Date(user.chatMutedUntil).getTime() > now.getTime() ? user.chatMutedUntil : null;

export function register(router) {
  router.get('/museum/rooms/:kind/:eventId/:room/sync', (ctx) => {
    const room = enterRoom(ctx);
    return roomState(ctx, room.key, ctx.currentUser()?.id, ctx.query.since);
  });

  router.post('/museum/rooms/:kind/:eventId/:room/sync', (ctx) => {
    const user = ctx.requireAuth();
    const room = enterRoom(ctx);
    const x = Number(ctx.body?.x);
    const y = Number(ctx.body?.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= ROOM_SIZE || y >= ROOM_SIZE) {
      throw httpError(400, 'Where you stand must be a tile in the room.', 'VALIDATION');
    }
    const spot = {
      room: room.key,
      label: room.label,
      link: room.link,
      x,
      y,
      facing: FACINGS.includes(ctx.body?.facing) ? ctx.body.facing : 'se',
      sitting: ctx.body?.sitting === true,
      dancing: ctx.body?.sitting !== true && ctx.body?.dancing === true,
      updatedAt: ctx.now.toISOString(),
    };
    const row = ctx.state.presence.find((p) => p.user === user.id);
    if (row) Object.assign(row, spot);
    else ctx.state.presence.push({ id: newId(), user: user.id, ...spot });
    return { ...roomState(ctx, room.key, user.id, ctx.body?.since), mutedUntil: mutedUntil(user, ctx.now) };
  });

  router.post('/museum/rooms/:kind/:eventId/:room/chat', (ctx) => {
    const { state } = ctx;
    const user = ctx.requireAuth();
    const room = enterRoom(ctx);
    const until = mutedUntil(user, ctx.now);
    if (until) {
      ctx.status = 403;
      return { error: 'A moderator has paused your chat for a while.', code: 'MUTED', mutedUntil: until };
    }
    const parsed = parseChat(ctx.body?.text);
    if (parsed.error) throw httpError(400, parsed.error, 'VALIDATION');
    if (parsed.command) throw httpError(400, 'That command works in the room, not in chat.', 'VALIDATION');

    const now = ctx.now.getTime();
    const recent = state.chats
      .filter((m) => m.user === user.id && now - new Date(m.createdAt).getTime() < CHAT.repeatWindowMs + CHAT.burstWindowMs)
      .map((m) => ({ at: new Date(m.createdAt).getTime(), text: m.text, kind: m.kind }));
    const wait = cooldownLeft(recent, now, parsed);
    if (wait > 0) {
      ctx.status = 429;
      return { error: 'Slow down a little!', code: 'SLOW_DOWN', retryAfterMs: wait };
    }
    if (parsed.kind !== 'emote' && isRepeat(recent, now, parsed.text)) {
      ctx.status = 429;
      return { error: 'You just said that.', code: 'REPEAT', retryAfterMs: CHAT.gapMs };
    }
    const message = {
      id: newId(),
      room: room.key,
      roomLabel: room.label,
      event: room.event.id,
      user: user.id,
      kind: parsed.kind,
      emote: parsed.emote || '',
      target: parsed.target || '',
      text: parsed.text,
      hiddenAt: null,
      createdAt: ctx.now.toISOString(),
    };
    state.chats.push(message);
    // Keep the demo's saved data small
    if (state.chats.length > 500) state.chats.splice(0, state.chats.length - 500);
    if (parsed.emote === PET_EMOTE) {
      let row = state.catPets.find((c) => c.key === parsed.target);
      if (!row) state.catPets.push((row = { key: parsed.target, pets: 0 }));
      Object.assign(row, { pets: row.pets + 1, lastPetAt: ctx.now.toISOString(), lastPetBy: user.id });
    }
    ctx.status = 201;
    return { message: chatJson(state, message), cooldownMs: CHAT.gapMs };
  });

  router.post('/museum/rooms/leave', (ctx) => {
    const user = ctx.requireAuth();
    ctx.state.presence = ctx.state.presence.filter((p) => p.user !== user.id);
    return { ok: true };
  });

  // ---------- The museum cats ----------

  router.get('/museum/rooms/cats', (ctx) => {
    const { state } = ctx;
    return {
      cats: CATS.map((c) => {
        const row = state.catPets.find((r) => r.key === c.key);
        const by = row?.lastPetBy ? findUser(state, row.lastPetBy) : null;
        return {
          key: c.key,
          name: c.name,
          pets: row?.pets || 0,
          lastPetAt: row?.lastPetAt || null,
          lastPetBy: by && (by.status || 'active') === 'active' ? miniOf(state, by.id) : null,
        };
      }),
    };
  });

  // ---------- The guestbook ----------

  const canRemoveNotes = (state, user, eventId) =>
    Boolean(
      user &&
        (can(user, 'chat.moderate') ||
          state.members.some((m) => m.event === eventId && m.user === user.id && m.roles.includes('organizer')))
    );
  const noteJson = (state, entry, viewer, moderator) => {
    const mine = Boolean(viewer && entry.user === viewer.id);
    return { id: entry.id, user: person(state, entry.user), text: entry.text, createdAt: entry.createdAt, mine, canRemove: mine || moderator };
  };
  const activeAuthor = (state, entry) => (findUser(state, entry.user)?.status || 'active') === 'active';

  router.get('/museum/rooms/:kind/:eventId/guestbook', (ctx) => {
    const { state } = ctx;
    const event = enterPlace(ctx);
    const viewer = ctx.currentUser();
    const moderator = canRemoveNotes(state, viewer, event.id);
    const all = state.guestbook.filter((e) => e.event === event.id && !e.hiddenAt);
    const notes = all.filter((e) => activeAuthor(state, e)).reverse().slice(0, GUESTBOOK.shown);
    const last = viewer ? all.filter((e) => e.user === viewer.id).pop() : null;
    const nextAt = last ? new Date(last.createdAt).getTime() + GUESTBOOK.gapMs : 0;
    return {
      entries: notes.map((e) => noteJson(state, e, viewer, moderator)),
      total: all.length,
      nextAt: nextAt > ctx.now.getTime() ? new Date(nextAt).toISOString() : null,
    };
  });

  router.post('/museum/rooms/:kind/:eventId/guestbook', (ctx) => {
    const { state } = ctx;
    const user = ctx.requireAuth();
    const event = enterPlace(ctx);
    const until = mutedUntil(user, ctx.now);
    if (until) {
      ctx.status = 403;
      return { error: 'A moderator has paused your chat for a while.', code: 'MUTED', mutedUntil: until };
    }
    const text = cleanText(ctx.body?.text);
    if (text.length < 2) throw httpError(400, 'Write a few words for the guestbook.', 'VALIDATION');
    if (text.length > GUESTBOOK.maxLength) throw httpError(400, `Keep it under ${GUESTBOOK.maxLength} characters.`, 'VALIDATION');
    const last = state.guestbook.filter((e) => e.event === event.id && e.user === user.id).pop();
    const wait = last ? new Date(last.createdAt).getTime() + GUESTBOOK.gapMs - ctx.now.getTime() : 0;
    if (wait > 0) {
      ctx.status = 429;
      return { error: 'You signed the guestbook a moment ago.', code: 'SLOW_DOWN', retryAfterMs: wait };
    }
    const entry = { id: newId(), event: event.id, user: user.id, text, createdAt: ctx.now.toISOString(), hiddenAt: null };
    state.guestbook.push(entry);
    ctx.status = 201;
    return { entry: noteJson(state, entry, user, canRemoveNotes(state, user, event.id)) };
  });

  router.delete('/museum/rooms/guestbook/:entryId', (ctx) => {
    const { state } = ctx;
    const user = ctx.requireAuth();
    const entry = state.guestbook.find((e) => e.id === ctx.params.entryId && !e.hiddenAt);
    if (!entry) throw httpError(404, "That note isn't in the guestbook.", 'NOT_FOUND');
    if (entry.user !== user.id && !canRemoveNotes(state, user, entry.event)) {
      throw httpError(403, 'Only the person who wrote it, the organisers or a moderator can take it down.', 'ACCESS_DENIED');
    }
    entry.hiddenAt = ctx.now.toISOString();
    entry.hiddenBy = user.id;
    return { ok: true };
  });
}
