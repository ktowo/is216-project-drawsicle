// Organisers reaching people: announcements, inviting a past group, Discord posts and time zones.
const { test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');
const fx = require('./exchange-fixture.js');
const Application = require('../models/Application.js');
const Event = require('../models/Event.js');
const EventMember = require('../models/EventMember.js');
const Notification = require('../models/Notification.js');
const User = require('../models/User.js');
const { setDiscordSender } = require('../services/discord.js');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);
let app;
before(() => {
  app = fx.use(h.makeApp());
});

// Discord posts are collected here instead of being sent
let posts = [];
beforeEach(() => {
  posts = [];
  setDiscordSender(async (url, payload) => {
    posts.push({ url, payload });
  });
});
afterEach(() => setDiscordSender(async () => {}));
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const WEBHOOK = 'https://discord.com/api/webhooks/123456/abcDEF-ghi_jkl';

test('organisers post updates that members are told about and everyone can read', async () => {
  const ctx = await fx.setup({ count: 2, status: 'open' });
  const url = `/api/events/${ctx.eventId}/announcements`;

  // Only organisers can post
  await ctx.people[0].agent.post(url).send({ message: 'Hi' }).expect(403);
  await ctx.organizer.agent.post(url).send({ message: '   ' }).expect(400);
  await ctx.organizer.agent.post(url).send({ message: 'x'.repeat(1001) }).expect(400);

  const posted = await ctx.organizer.agent.post(url).send({ message: 'The deadline moved to Friday!' }).expect(201);
  assert.equal(posted.body.announcement.message, 'The deadline moved to Friday!');
  assert.equal(posted.body.announcement.author.displayName, 'Olive Organiser');
  for (const person of ctx.people) {
    assert.equal(await Notification.countDocuments({ user: person.id, type: 'announcement' }), 1);
  }
  assert.equal(await Notification.countDocuments({ user: ctx.organizer.id, type: 'announcement' }), 0);

  // Anyone who can see the event can read updates, newest first
  await ctx.organizer.agent.post(url).send({ message: 'Second update', notify: false }).expect(201);
  const list = await h.request(app).get(url).expect(200);
  assert.deepEqual(list.body.announcements.map((a) => a.message), ['Second update', 'The deadline moved to Friday!']);

  await ctx.organizer.agent.delete(`${url}/${posted.body.announcement.id}`).expect(200);
  await ctx.organizer.agent.delete(`${url}/${posted.body.announcement.id}`).expect(404);
  assert.equal((await h.request(app).get(url).expect(200)).body.announcements.length, 1);
});

test('updates on private events stay private', async () => {
  const ctx = await fx.setup({ count: 1, status: 'open', event: { publicity: 'private' } });
  await ctx.organizer.agent.post(`/api/events/${ctx.eventId}/announcements`).send({ message: 'Secret' }).expect(201);
  await h.request(app).get(`/api/events/${ctx.eventId}/announcements`).expect(404);
  const event = await Event.findById(ctx.eventId);
  await h.request(app).get(`/api/events/${ctx.eventId}/announcements?invite=${event.inviteCode}`).expect(200);
});

test('organisers can invite the group from an earlier exchange, once', async () => {
  const past = await fx.setup({ count: 3, status: 'completed' });
  const next = await Event.create({
    name: 'Next Swap',
    signupDeadline: h.daysFromNow(10),
    submissionDeadline: h.daysFromNow(30),
    status: 'draft',
    createdBy: past.organizer.id,
  });
  await EventMember.grant(past.organizer.id, next._id, 'organizer');
  const url = `/api/events/${next.id}/invite-from`;

  // Sign-ups must be open
  const draft = await past.organizer.agent.post(url).send({ fromEventId: past.eventId }).expect(409);
  assert.equal(draft.body.code, 'WRONG_STATUS');
  await Event.updateOne({ _id: next._id }, { $set: { status: 'open' } });

  // One of them already signed up, and one deactivated their account
  await Application.create({
    event: next._id,
    user: past.people[0].id,
    status: 'accepted',
    communityUsername: 'x',
    canCreate: ['art'],
    wantsTypes: ['art'],
    offeredCharacters: [past.people[0].character._id],
  });
  await User.updateOne({ _id: past.people[1].id }, { $set: { status: 'deactivated' } });

  const sent = await past.organizer.agent.post(url).send({ fromEventId: past.eventId }).expect(200);
  assert.equal(sent.body.sent, 1);
  const invite = await Notification.findOne({ user: past.people[2].id, type: 'event_invite' });
  assert.match(invite.title, /Next Swap/);
  assert.equal(invite.link, `/events/${next.id}`);

  const again = await past.organizer.agent.post(url).send({ fromEventId: past.eventId }).expect(409);
  assert.equal(again.body.code, 'ALREADY_INVITED');

  // You can only invite from events you organise
  const other = await fx.setup({ count: 1, status: 'completed' });
  await past.organizer.agent.post(url).send({ fromEventId: other.eventId }).expect(404);
});

test('time zones and Discord webhooks are checked, and milestones are posted', async () => {
  const ctx = await fx.setup({ count: 2, status: 'draft', event: { signupDeadline: h.daysFromNow(5) } });
  const url = `/api/events/${ctx.eventId}`;

  await ctx.organizer.agent.patch(url).send({ timeZone: 'Mars/Olympus_Mons' }).expect(400);
  await ctx.organizer.agent.patch(url).send({ discordWebhookUrl: 'https://example.com/hook' }).expect(400);
  const saved = await ctx.organizer.agent.patch(url).send({ timeZone: 'Asia/Singapore', discordWebhookUrl: WEBHOOK }).expect(200);
  assert.equal(saved.body.event.timeZone, 'Asia/Singapore');
  assert.equal(saved.body.event.discordWebhookUrl, WEBHOOK);

  await ctx.organizer.agent.post(`${url}/status`).send({ status: 'open' }).expect(200);

  // Participants see the time zone but never the webhook
  const asParticipant = await ctx.people[0].agent.get(url).expect(200);
  assert.equal(asParticipant.body.event.timeZone, 'Asia/Singapore');
  assert.equal(asParticipant.body.event.discordWebhookUrl, undefined);
  await settle();
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, WEBHOOK);
  assert.match(posts[0].payload.embeds[0].title, /Sign-ups are open/);
  assert.deepEqual(posts[0].payload.allowed_mentions, { parse: [] });

  await ctx.organizer.agent.post(`${url}/announcements`).send({ message: 'Hello Discord' }).expect(201);
  await settle();
  assert.equal(posts.length, 2);
  assert.equal(posts[1].payload.embeds[0].description, 'Hello Discord');

  // Clearing the webhook stops the posts
  await ctx.organizer.agent.patch(url).send({ discordWebhookUrl: '' }).expect(200);
  await ctx.organizer.agent.post(`${url}/announcements`).send({ message: 'Quiet now' }).expect(201);
  await settle();
  assert.equal(posts.length, 2);
});

test('organisers see what happened in their event, newest first', async () => {
  const ctx = await fx.setup({ count: 3, status: 'open' });
  const url = `/api/events/${ctx.eventId}/activity`;
  await ctx.people[0].agent.get(url).expect(403);

  await ctx.organizer.agent.post(`/api/events/${ctx.eventId}/announcements`).send({ message: 'Welcome all!' }).expect(201);
  await fx.forceStatus(ctx.eventId, 'matching');
  await Event.updateOne(
    { _id: ctx.eventId },
    { $push: { statusHistory: { status: 'matching', at: new Date(), by: ctx.organizer.id } } }
  );

  const { body } = await ctx.organizer.agent.get(url).expect(200);
  const kinds = body.items.map((i) => i.kind);
  assert.equal(kinds[0], 'status');
  assert.equal(body.items[0].status, 'matching');
  assert.equal(body.items[0].by.displayName, 'Olive Organiser');
  assert.equal(kinds.filter((k) => k === 'signup').length, 3);
  const update = body.items.find((i) => i.kind === 'announcement');
  assert.equal(update.text, 'Welcome all!');
  // Newest first all the way down
  const times = body.items.map((i) => new Date(i.at).getTime());
  assert.deepEqual(times, [...times].sort((a, b) => b - a));
  assert.equal(body.total, body.items.length);
});
