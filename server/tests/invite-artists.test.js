// Inviting one artist to an event from Discover: only organisers, only while sign-ups are open,
// and the artist gets a notification.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const h = require('./helpers.js');
const fx = require('./exchange-fixture.js');
const Application = require('../models/Application.js');
const Character = require('../models/Character.js');
const EventInvite = require('../models/EventInvite.js');
const Notification = require('../models/Notification.js');
const User = require('../models/User.js');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);
before(() => fx.use(h.makeApp()));

const url = (ctx, tail = '') => `/api/events/${ctx.eventId}/invites${tail}`;

// An open event (sign-ups close in 5 days) with an organiser and two people already in
async function openEvent() {
  return fx.setup({ count: 2, status: 'open', event: { signupDeadline: h.daysFromNow(5) } });
}

test('an organiser invites an artist and the artist is told', async () => {
  const ctx = await openEvent();
  const nora = await fx.signUpAs('Nora Newcomer');

  const res = await ctx.organizer.agent.post(url(ctx)).send({ artistId: nora.id, message: '  Your ink art would fit in here  ' }).expect(201);
  assert.equal(res.body.invite.artist.displayName, 'Nora Newcomer');
  assert.equal(res.body.invite.message, 'Your ink art would fit in here');
  assert.equal(await EventInvite.countDocuments(), 1);

  const note = await Notification.findOne({ user: nora.id, type: 'event_invite' });
  assert.ok(note, 'the artist gets a notification');
  assert.match(note.title, /Olive Organiser invited you to Winter Swap/);
  assert.equal(note.message, 'Your ink art would fit in here');
  assert.equal(note.link, `/events/${ctx.eventId}`);

  // Without a message the notification says where they were found
  const omar = await fx.signUpAs('Omar Newcomer');
  await ctx.organizer.agent.post(url(ctx)).send({ artistId: omar.id }).expect(201);
  const plain = await Notification.findOne({ user: omar.id, type: 'event_invite' });
  assert.match(plain.message, /found you on Discover/);
});

test('the organiser sees who they invited, and who has joined since', async () => {
  const ctx = await openEvent();
  const nora = await fx.signUpAs('Nora Newcomer');
  const omar = await fx.signUpAs('Omar Newcomer');
  await ctx.organizer.agent.post(url(ctx)).send({ artistId: nora.id }).expect(201);
  await ctx.organizer.agent.post(url(ctx)).send({ artistId: omar.id }).expect(201);
  // Nora signs up for the event
  const oc = await Character.create({ owner: nora.id, name: "Nora's OC", species: 'fox' });
  await Application.create({
    event: ctx.eventId,
    user: nora.id,
    status: 'pending',
    communityUsername: 'nora#0001',
    canCreate: ['art'],
    wantsTypes: ['art'],
    offeredCharacters: [oc._id],
  });

  const list = await ctx.organizer.agent.get(url(ctx)).expect(200);
  assert.equal(list.body.invites.length, 2);
  const byName = Object.fromEntries(list.body.invites.map((i) => [i.artist.displayName, i]));
  assert.equal(byName['Nora Newcomer'].joined, true);
  assert.equal(byName['Omar Newcomer'].joined, false);

  // Taking an invite back removes it from the list (and lets you invite them again)
  await ctx.organizer.agent.delete(url(ctx, `/${byName['Omar Newcomer'].id}`)).expect(200);
  await ctx.organizer.agent.delete(url(ctx, `/${byName['Omar Newcomer'].id}`)).expect(404);
  await ctx.organizer.agent.post(url(ctx)).send({ artistId: omar.id }).expect(201);
});

test('only organisers can invite, and only while sign-ups are open', async () => {
  const ctx = await openEvent();
  const [ada] = ctx.people;
  const nora = await fx.signUpAs('Nora Newcomer');

  // Participants, other artists and logged-out visitors are turned away
  await ada.agent.post(url(ctx)).send({ artistId: nora.id }).expect(403);
  await nora.agent.post(url(ctx)).send({ artistId: ada.id }).expect(403);
  await ada.agent.get(url(ctx)).expect(403);
  await request(h.makeApp()).post(url(ctx)).send({ artistId: nora.id }).expect(401);

  // Sign-ups closed
  await fx.forceStatus(ctx.eventId, 'matching');
  const closed = await ctx.organizer.agent.post(url(ctx)).send({ artistId: nora.id }).expect(409);
  assert.equal(closed.body.code, 'WRONG_STATUS');
  assert.equal(await EventInvite.countDocuments(), 0);
});

test('you cannot invite twice, yourself, people already in, or people who are not on Discover', async () => {
  const ctx = await openEvent();
  const [ada] = ctx.people;
  const nora = await fx.signUpAs('Nora Newcomer');

  await ctx.organizer.agent.post(url(ctx)).send({ artistId: nora.id }).expect(201);
  const twice = await ctx.organizer.agent.post(url(ctx)).send({ artistId: nora.id }).expect(409);
  assert.equal(twice.body.code, 'ALREADY_INVITED');

  const self = await ctx.organizer.agent.post(url(ctx)).send({ artistId: ctx.organizer.id }).expect(400);
  assert.equal(self.body.code, 'VALIDATION');

  const inAlready = await ctx.organizer.agent.post(url(ctx)).send({ artistId: ada.id }).expect(409);
  assert.equal(inAlready.body.code, 'ALREADY_JOINED');

  // Hidden from Discover, banned, or has blocked the organiser: looks like they don't exist
  const hidden = await fx.signUpAs('Hana Hidden');
  await User.updateOne({ _id: hidden.id }, { $set: { 'profilePrivacy.listInDiscover': false } });
  const banned = await fx.signUpAs('Bo Banned');
  await User.updateOne({ _id: banned.id }, { $set: { status: 'banned' } });
  const blocker = await fx.signUpAs('Bea Blocker');
  await User.updateOne({ _id: blocker.id }, { $set: { blockedUsers: [ctx.organizer.id] } });
  for (const who of [hidden, banned, blocker]) {
    const res = await ctx.organizer.agent.post(url(ctx)).send({ artistId: who.id }).expect(404);
    assert.equal(res.body.code, 'NOT_FOUND');
  }
  await ctx.organizer.agent.post(url(ctx)).send({ artistId: 'nobody' }).expect(404);
  assert.equal(await Notification.countDocuments({ type: 'event_invite' }), 1);
});

test('messages have a length limit, and private events send the invite link', async () => {
  const ctx = await openEvent();
  const nora = await fx.signUpAs('Nora Newcomer');
  await ctx.organizer.agent.post(url(ctx)).send({ artistId: nora.id, message: 'x'.repeat(301) }).expect(400);

  const secret = await fx.setup({ count: 1, status: 'open', event: { name: 'Secret Swap', publicity: 'private', signupDeadline: h.daysFromNow(5) } });
  const omar = await fx.signUpAs('Omar Newcomer');
  await secret.organizer.agent.post(url(secret)).send({ artistId: omar.id }).expect(201);
  const note = await Notification.findOne({ user: omar.id, type: 'event_invite' });
  assert.match(note.link, new RegExp(`^/events/${secret.eventId}\\?invite=`));
});
