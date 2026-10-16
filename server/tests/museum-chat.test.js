// Shared museum rooms: who's where, chat, cooldowns and mutes.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const h = require('./helpers.js');
const fx = require('./exchange-fixture.js');
const ChatMessage = require('../models/ChatMessage.js');
const Event = require('../models/Event.js');
const User = require('../models/User.js');
const { CHAT } = require('../../shared/chat.mjs');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);
let app;
before(() => {
  app = fx.use(h.makeApp());
});

// Pretend everything said so far was said `ms` ago (skips waiting out cooldowns)
const age = (ms) => ChatMessage.collection.updateMany({}, [{ $set: { createdAt: { $subtract: ['$createdAt', ms] } } }]);

async function finished() {
  const ctx = await fx.setup({ count: 2, status: 'completed', event: { completedAt: new Date() } });
  const wing = `/api/museum/rooms/wing/${ctx.eventId}/0`;
  const gallery = `/api/museum/rooms/gallery/${ctx.eventId}/0`;
  return { ctx, wing, gallery };
}

test('who can be in which room', async () => {
  const { ctx, wing, gallery } = await finished();
  const outsider = await h.signUp(app, { displayName: 'Out Sider' });

  // Anyone can watch a public wing; only members walk into the exchange's own gallery
  await h.request(app).get(`${wing}/sync`).expect(200);
  await h.request(app).post(`${wing}/sync`).send({ x: 1, y: 1 }).expect(401);
  await h.request(app).get(`${gallery}/sync`).expect(401);
  await outsider.agent.get(`${gallery}/sync`).expect(403);
  await ctx.people[0].agent.get(`${gallery}/sync`).expect(200);
  await ctx.organizer.agent.get(`${gallery}/sync`).expect(200);

  // Unfinished, private or made-up rooms aren't open
  await h.request(app).get(`/api/museum/rooms/wing/${ctx.eventId}/100/sync`).expect(404);
  await h.request(app).get('/api/museum/rooms/attic/0123456789abcdef01234567/0/sync').expect(404);
  await Event.updateOne({ _id: ctx.eventId }, { publicity: 'private' });
  await h.request(app).get(`${wing}/sync`).expect(404);
  await ctx.people[0].agent.get(`${gallery}/sync`).expect(200);
  await Event.updateOne({ _id: ctx.eventId }, { status: 'active' });
  await ctx.people[0].agent.get(`${gallery}/sync`).expect(404);
});

test('people see each other move, sit and leave', async () => {
  const { ctx, wing } = await finished();
  const [ada, ben] = ctx.people;

  await ada.agent.post(`${wing}/sync`).send({ x: 12, y: 1 }).expect(400);
  await ada.agent.post(`${wing}/sync`).send({ x: 3, y: 4, facing: 'nw', sitting: true }).expect(200);
  const seen = await ben.agent.post(`${wing}/sync`).send({ x: 5, y: 8 }).expect(200);
  assert.deepEqual(
    seen.body.people.map((p) => [p.user.displayName, p.x, p.y, p.facing, p.sitting]),
    [['Ada Artist', 3, 4, 'nw', true]]
  );
  // Nobody sees themselves in the list; guests see everyone
  const guest = await h.request(app).get(`${wing}/sync`).expect(200);
  assert.equal(guest.body.people.length, 2);

  // Moving to another room takes you out of this one
  await ada.agent.post(`/api/museum/rooms/wing/${ctx.eventId}/1/sync`).send({ x: 5, y: 8 }).expect(200);
  assert.equal((await ben.agent.post(`${wing}/sync`).send({ x: 5, y: 8 }).expect(200)).body.people.length, 0);

  await ben.agent.post('/api/museum/rooms/leave').expect(200);
  assert.equal((await h.request(app).get(`${wing}/sync`).expect(200)).body.people.length, 0);
});

test('chat: messages, emotes, cooldowns, repeats and mutes', async () => {
  const { ctx, wing } = await finished();
  const [ada, ben] = ctx.people;
  const say = (who, text) => who.agent.post(`${wing}/chat`).send({ text });

  const first = await say(ada, '  Hello   there ').expect(201);
  assert.equal(first.body.message.text, 'Hello there');
  assert.equal(first.body.message.kind, 'say');

  // Too soon after the last one
  const soon = await say(ada, 'Again').expect(429);
  assert.equal(soon.body.code, 'SLOW_DOWN');
  assert.ok(soon.body.retryAfterMs > 0 && soon.body.retryAfterMs <= CHAT.gapMs);

  await age(CHAT.gapMs + 100);
  const wave = await say(ada, '/wave').expect(201);
  assert.deepEqual([wave.body.message.kind, wave.body.message.emote, wave.body.message.text], ['emote', 'wave', 'waves']);
  await age(CHAT.gapMs + 100);
  assert.equal((await say(ada, 'hello THERE').expect(429)).body.code, 'REPEAT');
  await say(ada, '/shout Look at this one!').expect(201);
  await age(CHAT.gapMs + 100);

  await say(ada, '/teleport').expect(400);
  await say(ada, '/sit').expect(400);
  await say(ada, 'x'.repeat(CHAT.maxLength + 1)).expect(400);
  await say(ada, '   ').expect(400);

  // Ben walks in and sees the recent chat, oldest first
  const room = await ben.agent.get(`${wing}/sync`).expect(200);
  assert.deepEqual(room.body.messages.map((m) => m.kind), ['say', 'emote', 'shout']);
  // ...and only what's new after that
  const later = await ben.agent.get(`${wing}/sync?since=${encodeURIComponent(room.body.cursor)}`).expect(200);
  assert.deepEqual(later.body.messages, []);

  // A burst earns a breather
  const now = Date.now();
  await ChatMessage.collection.insertMany(
    Array.from({ length: CHAT.burst }, (_, i) => ({
      room: 'elsewhere',
      user: new mongoose.Types.ObjectId(ben.id),
      kind: 'say',
      emote: '',
      text: `m${i}`,
      hiddenAt: null,
      createdAt: new Date(now - CHAT.gapMs - 1000 - i * 10),
    }))
  );
  assert.equal((await say(ben, 'one more').expect(429)).body.code, 'SLOW_DOWN');

  // A muted person can't talk until the mute ends
  await User.updateOne({ _id: ada.id }, { chatMutedUntil: new Date(Date.now() + 60_000) });
  const muted = await say(ada, 'Hi?').expect(403);
  assert.equal(muted.body.code, 'MUTED');
  const me = await ada.agent.get('/api/auth/me').expect(200);
  assert.ok(me.body.user.chatMutedUntil);

  // Hidden messages stay in the logs but leave the room
  await ChatMessage.updateMany({ kind: 'shout' }, { hiddenAt: new Date() });
  const after2 = await h.request(app).get(`${wing}/sync`).expect(200);
  assert.deepEqual(after2.body.messages.map((m) => m.kind), ['say', 'emote']);
});

test('friends can see which room you are in', async () => {
  const { ctx, wing } = await finished();
  const [ada, ben] = ctx.people;
  await User.updateOne({ _id: ada.id }, { username: 'ada_artist' });
  await User.updateOne({ _id: ben.id }, { username: 'ben_artist' });
  const [adaName, benName] = ['ada_artist', 'ben_artist'];
  await ada.agent.post(`/api/users/${benName}/follow`).expect(200);
  await ben.agent.post(`/api/users/${adaName}/follow`).expect(200);

  await ben.agent.post(`${wing}/sync`).send({ x: 2, y: 2 }).expect(200);
  const list = await ada.agent.get('/api/friends').expect(200);
  assert.equal(list.body.friends[0].online.label, 'Winter Swap, room 1');
  assert.equal(list.body.friends[0].online.link, `/museum/${ctx.eventId}?room=0`);
});
