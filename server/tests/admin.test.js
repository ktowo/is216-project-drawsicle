const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');
const User = require('../models/User.js');
const Application = require('../models/Application.js');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);

const PASSWORD = 'password123';

async function makeAdmin(app) {
  const { agent, user } = await h.signUp(app, { displayName: 'Admin' });
  await User.updateOne({ _id: user.id }, { role: 'admin' });
  return { agent, user };
}

// An organiser with an open public event, plus an accepted participant
async function openEvent(app) {
  const organiser = await h.signUp(app, { displayName: 'Org' });
  const created = await organiser.agent
    .post('/api/events')
    .send({
      name: 'Winter Swap',
      signupDeadline: h.daysFromNow(10),
      submissionDeadline: h.daysFromNow(30),
      allowedTypes: ['art'],
    })
    .expect(201);
  const eventId = created.body.event.id;
  await organiser.agent.post(`/api/events/${eventId}/status`).send({ status: 'open' }).expect(200);

  const artist = await h.signUp(app, { displayName: 'Artist' });
  await artist.agent
    .put(`/api/events/${eventId}/application`)
    .send({
      communityUsername: 'artist#1',
      canCreate: ['art'],
      wantsTypes: ['art'],
      newCharacters: [{ name: 'Sprout', species: 'cat' }],
    })
    .expect(201);
  return { organiser, artist, eventId };
}

test('admin routes need a logged-in site admin', async () => {
  const app = h.makeApp();
  await h.request(app).get('/api/admin/stats').expect(401);
  const { agent } = await h.signUp(app);
  const res = await agent.get('/api/admin/stats').expect(403);
  assert.equal(res.body.code, 'ACCESS_DENIED');

  const admin = await makeAdmin(app);
  const stats = await admin.agent.get('/api/admin/stats').expect(200);
  assert.equal(stats.body.users.total, 2);
  assert.equal(stats.body.users.admins, 1);
});

test('banning logs someone out, blocks login and withdraws open sign-ups; unbanning restores access', async () => {
  const app = h.makeApp();
  const admin = await makeAdmin(app);
  const { artist, eventId } = await openEvent(app);
  const email = (await User.findById(artist.user.id)).email;

  await admin.agent.post(`/api/admin/users/${artist.user.id}/ban`).send({}).expect(400); // reason required
  const ban = await admin.agent
    .post(`/api/admin/users/${artist.user.id}/ban`)
    .send({ reason: 'Spam' })
    .expect(200);
  assert.equal(ban.body.user.status, 'banned');
  assert.equal(ban.body.withdrawnApplications, 1);
  assert.equal((await Application.findOne({ event: eventId, user: artist.user.id })).status, 'withdrawn');

  await artist.agent.get('/api/auth/me').expect(401); // old cookie no longer works
  const login = await h.request(app).post('/api/auth/login').send({ email, password: PASSWORD }).expect(403);
  assert.equal(login.body.code, 'ACCOUNT_BANNED');
  assert.match(login.body.error, /Spam/);

  await admin.agent.post(`/api/admin/users/${artist.user.id}/ban`).send({ reason: 'again' }).expect(409);
  await admin.agent.post(`/api/admin/users/${artist.user.id}/unban`).expect(200);
  await h.request(app).post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
});

test('admins cannot ban, demote or delete themselves, or ban other admins', async () => {
  const app = h.makeApp();
  const admin = await makeAdmin(app);
  const other = await makeAdmin(app);

  const self = await admin.agent.post(`/api/admin/users/${admin.user.id}/ban`).send({ reason: 'x' }).expect(400);
  assert.equal(self.body.code, 'SELF');
  await admin.agent.patch(`/api/admin/users/${admin.user.id}`).send({ role: 'user' }).expect(400);
  await admin.agent.delete(`/api/admin/users/${admin.user.id}`).expect(400);
  await admin.agent.post(`/api/admin/users/${other.user.id}/ban`).send({ reason: 'x' }).expect(400);

  const demoted = await admin.agent.patch(`/api/admin/users/${other.user.id}`).send({ role: 'user' }).expect(200);
  assert.equal(demoted.body.user.role, 'user');
  await other.agent.get('/api/admin/stats').expect(403);
});

test('a disabled event is hidden from everyone but its organisers and is read-only', async () => {
  const app = h.makeApp();
  const admin = await makeAdmin(app);
  const { organiser, artist, eventId } = await openEvent(app);

  await admin.agent.post(`/api/admin/events/${eventId}/disable`).send({ reason: 'Under review' }).expect(200);

  await h.request(app).get(`/api/events/${eventId}`).expect(404);
  await artist.agent.get(`/api/events/${eventId}`).expect(404);
  await artist.agent.get(`/api/events/${eventId}/application`).expect(404);
  const listing = await h.request(app).get('/api/events').expect(200);
  assert.equal(listing.body.total, 0);
  const mine = await artist.agent.get('/api/events/mine').expect(200);
  assert.equal(mine.body.participating.length, 0);

  const seen = await organiser.agent.get(`/api/events/${eventId}`).expect(200);
  assert.equal(seen.body.event.disabled, true);
  assert.equal(seen.body.event.disabledReason, 'Under review');
  const edit = await organiser.agent.patch(`/api/events/${eventId}`).send({ theme: 'Snow' }).expect(409);
  assert.equal(edit.body.code, 'EVENT_DISABLED');

  await admin.agent.post(`/api/admin/events/${eventId}/enable`).expect(200);
  await artist.agent.get(`/api/events/${eventId}`).expect(200);
});

test('a cancelled event stays visible with its reason, accepts no changes, and can be restored', async () => {
  const app = h.makeApp();
  const admin = await makeAdmin(app);
  const { artist, eventId } = await openEvent(app);

  await admin.agent.post(`/api/admin/events/${eventId}/cancel`).send({}).expect(400);
  await admin.agent.post(`/api/admin/events/${eventId}/cancel`).send({ reason: 'Organiser left' }).expect(200);

  const page = await h.request(app).get(`/api/events/${eventId}`).expect(200);
  assert.equal(page.body.event.status, 'cancelled');
  assert.equal(page.body.event.cancelReason, 'Organiser left');
  const apply = await artist.agent.delete(`/api/events/${eventId}/application`).expect(409);
  assert.equal(apply.body.code, 'EVENT_CANCELLED');

  const cancelled = await h.request(app).get('/api/events?status=cancelled').expect(200);
  assert.equal(cancelled.body.total, 1);
  const open = await h.request(app).get('/api/events?status=open').expect(200);
  assert.equal(open.body.total, 0);

  const restored = await admin.agent.post(`/api/admin/events/${eventId}/restore`).expect(200);
  assert.equal(restored.body.event.status, 'open');
  assert.equal(restored.body.event.cancelReason, '');
});

test('admins can delete events and accounts, and every action lands in the audit log', async () => {
  const app = h.makeApp();
  const admin = await makeAdmin(app);
  const { artist, eventId } = await openEvent(app);

  const events = await admin.agent.get('/api/admin/events?q=winter').expect(200);
  assert.equal(events.body.events.length, 1);
  assert.ok(events.body.events[0].createdBy.displayName);

  await admin.agent.delete(`/api/admin/events/${eventId}`).expect(200);
  await h.request(app).get(`/api/events/${eventId}`).expect(404);

  await admin.agent.delete(`/api/admin/users/${artist.user.id}`).expect(200);
  const gone = await User.findById(artist.user.id);
  assert.match(gone.email, /@deleted\.invalid$/);
  assert.equal(gone.displayName, 'Deleted user');
  await artist.agent.get('/api/auth/me').expect(401);

  const log = await admin.agent.get('/api/admin/audit').expect(200);
  assert.deepEqual(log.body.entries.map((e) => e.action), ['user.delete', 'event.delete']);
  assert.equal(log.body.entries[1].targetLabel, 'Winter Swap');

  const users = await admin.agent.get('/api/admin/users?status=deactivated').expect(200);
  assert.equal(users.body.total, 1);
});
