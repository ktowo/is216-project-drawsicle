// Password reset link states, notification filters and "Remind me" on events.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');
const Event = require('../models/Event.js');
const EventMember = require('../models/EventMember.js');
const Notification = require('../models/Notification.js');
const User = require('../models/User.js');
const { outbox } = require('../services/mailer.js');
const { serializeEvents } = require('../services/events.js');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(async () => {
  await h.clearDb();
  outbox.length = 0;
});

const app = h.makeApp();

// The token from the newest reset email
function tokenFromOutbox() {
  const mail = outbox[outbox.length - 1];
  return mail.text.match(/token=([a-f0-9]{64})/)[1];
}

async function requestReset(email) {
  await h.request(app).post('/api/auth/forgot-password').send({ email }).expect(200);
  return tokenFromOutbox();
}

// ---------- Password reset ----------

test('a fresh reset link checks out, shows a masked email, and stops working once used', async () => {
  const { user } = await h.signUp(app, { email: 'mika.draws@test.local' });
  const token = await requestReset(user.email);

  const check = await h.request(app).get(`/api/auth/reset-password/check?token=${token}`).expect(200);
  assert.equal(check.body.ok, true);
  assert.equal(check.body.email, 'mi•••@test.local');
  assert.ok(new Date(check.body.expiresAt) > new Date());

  // Checking doesn't use the link up
  await h.request(app).get(`/api/auth/reset-password/check?token=${token}`).expect(200);

  const done = await h.request(app).post('/api/auth/reset-password').send({ token, password: 'brand-new-pass' });
  assert.equal(done.status, 200, JSON.stringify(done.body));

  const after = await h.request(app).get(`/api/auth/reset-password/check?token=${token}`).expect(400);
  assert.equal(after.body.code, 'INVALID_TOKEN');
  assert.equal(after.body.reason, 'used');

  const again = await h.request(app).post('/api/auth/reset-password').send({ token, password: 'another-pass' }).expect(400);
  assert.equal(again.body.reason, 'used');
});

test('an expired link says it expired, and a newer email replaces the older link', async () => {
  const { user } = await h.signUp(app);
  const first = await requestReset(user.email);
  const second = await requestReset(user.email);

  const replaced = await h.request(app).get(`/api/auth/reset-password/check?token=${first}`).expect(400);
  assert.equal(replaced.body.reason, 'used');

  await User.updateOne({ email: user.email }, { $set: { resetTokenExpires: new Date(Date.now() - 1000) } });
  const expired = await h.request(app).get(`/api/auth/reset-password/check?token=${second}`).expect(400);
  assert.equal(expired.body.reason, 'expired');
  assert.match(expired.body.error, /expired/);

  const submit = await h.request(app).post('/api/auth/reset-password').send({ token: second, password: 'brand-new-pass' }).expect(400);
  assert.equal(submit.body.reason, 'expired');
});

test('a malformed link is rejected without looking anything up', async () => {
  for (const token of ['', 'abc', 'z'.repeat(64)]) {
    const res = await h.request(app).get(`/api/auth/reset-password/check?token=${token}`).expect(400);
    assert.equal(res.body.code, 'INVALID_TOKEN');
  }
});

// ---------- Notification filters ----------

async function seedNotifications(userId) {
  const types = [
    'match_assigned', // matches
    'deadline_reminder', // reminders
    'event_closing_soon', // reminders
    'application_accepted', // signups
    'announcement', // events
    'something_new', // unknown types count as event updates
    'gift_revealed', // matches
  ];
  const start = Date.now() - types.length * 60000;
  for (const [i, type] of types.entries()) {
    await Notification.create({
      user: userId,
      type,
      title: type,
      readAt: i % 2 ? new Date() : null,
      createdAt: new Date(start + i * 60000),
    });
  }
}

test('notifications can be filtered by group and unread on the server, with counts for the chips', async () => {
  const { agent, user } = await h.signUp(app);
  const other = await h.signUp(app);
  await seedNotifications(user.id);
  await Notification.create({ user: other.user.id, type: 'match_assigned', title: 'not mine' });

  const matches = (await agent.get('/api/notifications?group=matches').expect(200)).body;
  assert.deepEqual(matches.items.map((n) => n.type), ['gift_revealed', 'match_assigned']);
  assert.equal(matches.counts, undefined);

  const events = (await agent.get('/api/notifications?group=events').expect(200)).body;
  assert.deepEqual(events.items.map((n) => n.type), ['something_new', 'announcement']);

  const unread = (await agent.get('/api/notifications?unread=1&counts=1').expect(200)).body;
  assert.ok(unread.items.every((n) => !n.read));
  assert.equal(unread.items.length, 4);
  assert.deepEqual(unread.counts, { all: 4, signups: 0, matches: 2, reminders: 1, events: 1 });

  const all = (await agent.get('/api/notifications?counts=1').expect(200)).body;
  assert.deepEqual(all.counts, { all: 7, signups: 1, matches: 2, reminders: 2, events: 2 });
  assert.equal(all.unreadCount, 4);

  await agent.get('/api/notifications?group=nope').expect(400);
});

test('load more keeps the filter: paging through one group only returns that group', async () => {
  const { agent, user } = await h.signUp(app);
  await seedNotifications(user.id);

  const first = (await agent.get('/api/notifications?group=reminders&limit=1').expect(200)).body;
  assert.deepEqual(first.items.map((n) => n.type), ['event_closing_soon']);
  assert.equal(first.hasMore, true);

  const before = encodeURIComponent(first.items[0].createdAt);
  const next = (await agent.get(`/api/notifications?group=reminders&limit=1&before=${before}`).expect(200)).body;
  assert.deepEqual(next.items.map((n) => n.type), ['deadline_reminder']);
  assert.equal(next.hasMore, false);
});

// ---------- Remind me before sign-ups close ----------

async function makeEvent(organizerId, fields = {}) {
  const event = await Event.create({
    name: 'Winter Swap',
    signupDeadline: h.daysFromNow(7),
    submissionDeadline: h.daysFromNow(30),
    minParticipants: 2,
    status: 'open',
    createdBy: organizerId,
    ...fields,
  });
  await EventMember.grant(organizerId, event._id, 'organizer');
  return event;
}

test('people can ask to be reminded about an open event, and the event page says so', async () => {
  const organizer = await h.signUp(app);
  const fan = await h.signUp(app);
  const event = await makeEvent(organizer.user.id);

  await h.request(app).post(`/api/events/${event._id}/watch`).expect(401);

  const before = (await fan.agent.get(`/api/events/${event._id}`).expect(200)).body.event;
  assert.equal(before.viewer.watching, false);

  assert.deepEqual((await fan.agent.post(`/api/events/${event._id}/watch`).expect(200)).body, { watching: true });
  // Twice is the same as once
  await fan.agent.post(`/api/events/${event._id}/watch`).expect(200);
  assert.equal((await User.findById(fan.user.id)).watchedEvents.length, 1);

  const watching = (await fan.agent.get(`/api/events/${event._id}`).expect(200)).body.event;
  assert.equal(watching.viewer.watching, true);
  // Lists say so too
  const [listed] = await serializeEvents([await Event.findById(event._id)], await User.findById(fan.user.id));
  assert.equal(listed.viewer.watching, true);

  assert.deepEqual((await fan.agent.delete(`/api/events/${event._id}/watch`).expect(200)).body, { watching: false });
  assert.equal((await fan.agent.get(`/api/events/${event._id}`).expect(200)).body.event.viewer.watching, false);
});

test('reminders are only for open events, and deleting an event forgets it', async () => {
  const organizer = await h.signUp(app);
  const fan = await h.signUp(app);
  const matching = await makeEvent(organizer.user.id, { status: 'matching', signupDeadline: h.daysFromNow(-1) });
  const draft = await makeEvent(organizer.user.id, { status: 'draft' });
  const open = await makeEvent(organizer.user.id);

  const res = await fan.agent.post(`/api/events/${matching._id}/watch`).expect(409);
  assert.equal(res.body.code, 'NOT_OPEN');
  // Drafts are hidden from everyone but organisers
  await fan.agent.post(`/api/events/${draft._id}/watch`).expect(404);

  await fan.agent.post(`/api/events/${open._id}/watch`).expect(200);
  await organizer.agent.delete(`/api/events/${open._id}`).expect(200);
  assert.equal((await User.findById(fan.user.id)).watchedEvents.length, 0);
});
