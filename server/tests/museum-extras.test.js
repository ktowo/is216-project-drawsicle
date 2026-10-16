// The museum's extras: petting the cats, the guestbook, and the organisers' room design.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');
const fx = require('./exchange-fixture.js');
const ChatMessage = require('../models/ChatMessage.js');
const GuestbookEntry = require('../models/GuestbookEntry.js');
const User = require('../models/User.js');
const { CHAT, GUESTBOOK } = require('../../shared/chat.mjs');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);
let app;
before(() => {
  app = fx.use(h.makeApp());
});

async function finished() {
  const ctx = await fx.setup({ count: 2, status: 'completed', event: { completedAt: new Date() } });
  return {
    ctx,
    wing: `/api/museum/rooms/wing/${ctx.eventId}`,
    gallery: `/api/museum/rooms/gallery/${ctx.eventId}`,
  };
}

test('petting a cat is an emote everyone sees, and the server counts it', async () => {
  const { ctx, wing } = await finished();
  const [ada, ben] = ctx.people;

  const pet = await ada.agent.post(`${wing}/0/chat`).send({ text: '/pet Mochi' }).expect(201);
  assert.deepEqual(
    [pet.body.message.kind, pet.body.message.emote, pet.body.message.target, pet.body.message.text],
    ['emote', 'pet', 'mochi', 'pets Mochi']
  );
  // Unknown cats and a missing name are refused
  await ben.agent.post(`${wing}/0/chat`).send({ text: '/pet Garfield' }).expect(400);
  await ben.agent.post(`${wing}/0/chat`).send({ text: '/pet' }).expect(400);
  // The emote cooldown applies to pets too
  await ada.agent.post(`${wing}/0/chat`).send({ text: '/pet mochi' }).expect(429);
  await ChatMessage.collection.updateMany({}, [{ $set: { createdAt: { $subtract: ['$createdAt', CHAT.emoteGapMs + 100] } } }]);
  await ada.agent.post(`${wing}/0/chat`).send({ text: '/pet mochi' }).expect(201);

  const seen = await ben.agent.post(`${wing}/0/sync`).send({ x: 5, y: 8 }).expect(200);
  assert.ok(seen.body.messages.some((m) => m.emote === 'pet' && m.target === 'mochi'));

  const { body } = await h.request(app).get('/api/museum/rooms/cats').expect(200);
  const mochi = body.cats.find((c) => c.key === 'mochi');
  assert.equal(mochi.pets, 2);
  assert.equal(mochi.lastPetBy.displayName, 'Ada Artist');
  assert.equal(body.cats.find((c) => c.key === 'pixel').pets, 0);
});

test('the guestbook: reading, signing, pacing and taking notes down', async () => {
  const { ctx, wing, gallery } = await finished();
  const [ada, ben] = ctx.people;
  const outsider = await h.signUp(app, { displayName: 'Out Sider' });

  // Anyone can read a public wing's guestbook; signing needs an account
  assert.deepEqual((await h.request(app).get(`${wing}/guestbook`).expect(200)).body.entries, []);
  await h.request(app).post(`${wing}/guestbook`).send({ text: 'Hello!' }).expect(401);
  // The members' gallery shares the book, but only members get in
  await outsider.agent.get(`${gallery}/guestbook`).expect(403);

  await ada.agent.post(`${wing}/guestbook`).send({ text: ' ' }).expect(400);
  await ada.agent.post(`${wing}/guestbook`).send({ text: 'x'.repeat(GUESTBOOK.maxLength + 1) }).expect(400);
  const signed = await ada.agent.post(`${wing}/guestbook`).send({ text: 'What a lovely exchange!' }).expect(201);
  assert.equal(signed.body.entry.text, 'What a lovely exchange!');
  assert.equal(signed.body.entry.mine, true);
  // One note every ten minutes
  const again = await ada.agent.post(`${wing}/guestbook`).send({ text: 'Me again' }).expect(429);
  assert.ok(again.body.retryAfterMs > 0);
  await outsider.agent.post(`${wing}/guestbook`).send({ text: 'Visiting from afar' }).expect(201);

  const book = (await ben.agent.get(`${gallery}/guestbook`).expect(200)).body;
  assert.equal(book.total, 2);
  assert.deepEqual(book.entries.map((e) => [e.user.displayName, e.canRemove]), [
    ['Out Sider', false],
    ['Ada Artist', false],
  ]);
  assert.ok((await ada.agent.get(`${wing}/guestbook`).expect(200)).body.nextAt);

  // Other visitors can't take a note down; its writer and the organisers can
  const [outsiderNote, adaNote] = book.entries;
  await ben.agent.delete(`/api/museum/rooms/guestbook/${adaNote.id}`).expect(403);
  await outsider.agent.delete(`/api/museum/rooms/guestbook/${outsiderNote.id}`).expect(200);
  const organiserView = (await ctx.organizer.agent.get(`${wing}/guestbook`).expect(200)).body;
  assert.deepEqual(organiserView.entries.map((e) => e.canRemove), [true]);
  await ctx.organizer.agent.delete(`/api/museum/rooms/guestbook/${adaNote.id}`).expect(200);
  await ctx.organizer.agent.delete(`/api/museum/rooms/guestbook/${adaNote.id}`).expect(404);
  assert.equal((await h.request(app).get(`${wing}/guestbook`).expect(200)).body.total, 0);
  // Hidden, not deleted: moderators can still see what was said
  assert.equal(await GuestbookEntry.countDocuments({ hiddenAt: { $ne: null } }), 2);

  // Muted people can't sign
  await User.updateOne({ _id: ben.user.id }, { chatMutedUntil: new Date(Date.now() + 60 * 60 * 1000) });
  await ben.agent.post(`${wing}/guestbook`).send({ text: 'Hi there' }).expect(403);
});

test('organisers pick the room design, even after the event is over', async () => {
  const { ctx } = await finished();
  const url = `/api/events/${ctx.eventId}/museum-theme`;

  await ctx.people[0].agent.put(url).send({ museumTheme: 'midnight' }).expect(403);
  await ctx.organizer.agent.put(url).send({ museumTheme: 'disco' }).expect(400);
  const saved = await ctx.organizer.agent.put(url).send({ museumTheme: 'midnight' }).expect(200);
  assert.equal(saved.body.museumTheme, 'midnight');

  const { body } = await ctx.people[0].agent.get(`/api/events/${ctx.eventId}`).expect(200);
  assert.equal(body.event.museumTheme, 'midnight');
  await ctx.organizer.agent.put(url).send({ museumTheme: 'auto' }).expect(200);
});
