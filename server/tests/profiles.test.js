// Public artist profiles, "download my data", notification paging and what deactivating
// an account does to someone's sign-ups.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');
const Application = require('../models/Application.js');
const Character = require('../models/Character.js');
const Event = require('../models/Event.js');
const EventMember = require('../models/EventMember.js');
const Match = require('../models/Match.js');
const Notification = require('../models/Notification.js');
const Submission = require('../models/Submission.js');
const User = require('../models/User.js');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);

let app;
before(() => {
  app = h.makeApp();
});

const PASSWORD = 'password123';

async function signUpAs(displayName, extra = {}) {
  const result = await h.signUp(app, { displayName });
  if (Object.keys(extra).length) await User.updateOne({ _id: result.user.id }, { $set: extra });
  return { ...result, id: result.user.id };
}

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

async function signUpFor(event, userId, status = 'accepted') {
  const character = await Character.create({ owner: userId, name: 'Pip', species: 'fox' });
  const application = await Application.create({
    event: event._id,
    user: userId,
    status,
    communityUsername: 'member#0001',
    canCreate: ['art'],
    wantsTypes: ['art'],
    offeredCharacters: [character._id],
  });
  if (status === 'accepted') await EventMember.grant(userId, event._id, 'participant');
  return application;
}

// ---------- Public profiles ----------

test('public profiles show public events, stats and socials, never private details', async () => {
  const mika = await signUpAs('Mika', {
    username: 'mika_draws',
    bio: 'Pastel dragons.',
    socials: { discord: 'mika.draws', bluesky: 'mika.bsky.social' },
  });
  const viewer = await signUpAs('Viewer');

  const older = await makeEvent(mika.id, { name: 'Older Swap', createdAt: h.daysFromNow(-20) });
  const newer = await makeEvent(mika.id, { name: 'Newer Swap', status: 'completed', completedAt: new Date() });
  await makeEvent(mika.id, { name: 'Secret Club', publicity: 'private' });
  await makeEvent(mika.id, { name: 'Unfinished', status: 'draft' });
  // Took part in two completed events (one private) and one that is still running
  const other = await signUpAs('Other');
  await signUpFor(await makeEvent(other.id, { name: 'Done A', status: 'completed' }), mika.id);
  await signUpFor(await makeEvent(other.id, { name: 'Done B', status: 'completed', publicity: 'private' }), mika.id);
  await signUpFor(await makeEvent(other.id, { name: 'Running', status: 'active' }), mika.id);
  await signUpFor(await makeEvent(other.id, { name: 'Done C', status: 'completed' }), mika.id, 'rejected');

  const res = await h.request(app).get('/api/users/Mika_Draws').expect(200);
  const { profile, organizing, stats } = res.body;
  assert.deepEqual(Object.keys(profile).sort(), ['avatarUrl', 'bio', 'createdAt', 'displayName', 'id', 'socials', 'username']);
  assert.equal(profile.username, 'mika_draws');
  assert.equal(profile.bio, 'Pastel dragons.');
  assert.equal(profile.socials.discord, 'mika.draws');
  assert.equal(profile.socials.twitter, '');
  assert.deepEqual(organizing.map((e) => e.name), [newer.name, older.name]);
  assert.equal(organizing[0].viewer, null);
  assert.equal(organizing[0].inviteCode, undefined);
  // Only public exchanges count, matching the list on the page (Done B is private)
  assert.deepEqual(stats, { eventsOrganized: 2, exchangesCompleted: 1 });

  // Logged in: events carry the viewer, and the id works as well as the username
  const asViewer = await viewer.agent.get(`/api/users/${mika.id}`).expect(200);
  assert.equal(asViewer.body.profile.id, mika.id);
  assert.deepEqual(asViewer.body.organizing[0].viewer, { roles: [], isOrganizer: false, applicationStatus: null });

  for (const missing of ['nobody_here', 'x', '000000000000000000000000']) {
    const notFound = await h.request(app).get(`/api/users/${missing}`).expect(404);
    assert.equal(notFound.body.code, 'USER_NOT_FOUND');
  }

  await User.updateOne({ _id: mika.id }, { $set: { status: 'deactivated' } });
  assert.equal((await h.request(app).get('/api/users/mika_draws').expect(404)).body.code, 'USER_NOT_FOUND');
});

test('banned artists have no public profile until they are unbanned', async () => {
  const mika = await signUpAs('Mika', { username: 'mika_draws' });

  await User.updateOne({ _id: mika.id }, { $set: { status: 'banned', bannedAt: new Date() } });
  for (const handle of ['mika_draws', mika.id]) {
    const res = await h.request(app).get(`/api/users/${handle}`).expect(404);
    assert.equal(res.body.code, 'USER_NOT_FOUND');
  }

  await User.updateOne({ _id: mika.id }, { $set: { status: 'active', bannedAt: null } });
  await h.request(app).get('/api/users/mika_draws').expect(200);
});

test('profile privacy settings default sensibly, save, validate and stay private', async () => {
  const mika = await signUpAs('Mika', { username: 'mika_draws' });
  const me = (await mika.agent.get('/api/auth/me').expect(200)).body.user;
  assert.deepEqual(me.profilePrivacy, { showExchanges: true, showGifts: false });

  const saved = await mika.agent
    .patch('/api/profile')
    .send({ profilePrivacy: { showGifts: true } })
    .expect(200);
  assert.deepEqual(saved.body.user.profilePrivacy, { showExchanges: true, showGifts: true });

  const both = await mika.agent
    .patch('/api/profile')
    .send({ profilePrivacy: { showExchanges: false } })
    .expect(200);
  assert.deepEqual(both.body.user.profilePrivacy, { showExchanges: false, showGifts: true });

  for (const profilePrivacy of [{ showGifts: 'yes' }, { showExchanges: 1 }, 'on', ['showGifts']]) {
    const res = await mika.agent.patch('/api/profile').send({ profilePrivacy }).expect(400);
    assert.equal(res.body.code, 'VALIDATION');
  }
  // A rejected change leaves what was saved alone
  const after = (await mika.agent.get('/api/auth/me').expect(200)).body.user;
  assert.deepEqual(after.profilePrivacy, { showExchanges: false, showGifts: true });

  const exported = (await mika.agent.get('/api/profile/export').expect(200)).body;
  assert.deepEqual(exported.user.profilePrivacy, { showExchanges: false, showGifts: true });

  // Other people never see the settings themselves
  const publicView = (await h.request(app).get('/api/users/mika_draws').expect(200)).body;
  assert.equal(publicView.profile.profilePrivacy, undefined);
  const byId = (await h.request(app).get(`/api/profile/${mika.id}`).expect(200)).body;
  assert.equal(byId.profile.profilePrivacy, undefined);
});

test('the short public profile hides banned accounts too', async () => {
  const mika = await signUpAs('Mika', { username: 'mika_draws', status: 'banned' });
  for (const handle of ['mika_draws', mika.id]) {
    assert.equal((await h.request(app).get(`/api/profile/${handle}`).expect(404)).body.code, 'NOT_FOUND');
  }
});

test('exchanges joined: finished public exchanges they were accepted into, newest first', async () => {
  const mika = await signUpAs('Mika', { username: 'mika_draws' });
  const other = await signUpAs('Other');
  const done = (name, completedDaysAgo, extra = {}) =>
    makeEvent(other.id, { name, status: 'completed', completedAt: h.daysFromNow(-completedDaysAgo), ...extra });

  await signUpFor(await done('Older Swap', 30), mika.id);
  await signUpFor(await done('Newer Swap', 2), mika.id);
  await signUpFor(await done('Private Swap', 5, { publicity: 'private' }), mika.id);
  await signUpFor(await done('Pulled Swap', 6, { disabledAt: new Date() }), mika.id);
  await signUpFor(await done('Rejected Swap', 7), mika.id, 'rejected');
  await signUpFor(await done('Withdrawn Swap', 8), mika.id, 'withdrawn');
  await signUpFor(await makeEvent(other.id, { name: 'Running Swap', status: 'active' }), mika.id);
  await signUpFor(await makeEvent(other.id, { name: 'Called Off', status: 'cancelled' }), mika.id);
  await done('Not Joined', 1);

  const { body } = await h.request(app).get('/api/users/mika_draws').expect(200);
  assert.deepEqual(body.exchanges.map((e) => e.name), ['Newer Swap', 'Older Swap']);
  assert.equal(body.exchanges[0].viewer, null);
  assert.equal(body.exchanges[0].inviteCode, undefined);
  assert.equal(body.stats.exchangesCompleted, 2);
});

test('exchanges joined: at most 12, with the full count in the stats', async () => {
  const mika = await signUpAs('Mika', { username: 'mika_draws' });
  const other = await signUpAs('Other');
  for (let i = 0; i < 14; i++) {
    await signUpFor(await makeEvent(other.id, { name: `Swap ${i}`, status: 'completed', completedAt: h.daysFromNow(-i) }), mika.id);
  }
  const { body } = await h.request(app).get('/api/users/mika_draws').expect(200);
  assert.equal(body.exchanges.length, 12);
  assert.equal(body.exchanges[0].name, 'Swap 0');
  assert.equal(body.stats.exchangesCompleted, 14);
});

test('exchanges joined: hiding them leaves out the list and the count', async () => {
  const mika = await signUpAs('Mika', { username: 'mika_draws' });
  const other = await signUpAs('Other');
  await signUpFor(await makeEvent(other.id, { name: 'Done', status: 'completed' }), mika.id);
  await mika.agent.patch('/api/profile').send({ profilePrivacy: { showExchanges: false } }).expect(200);

  const { body } = await h.request(app).get('/api/users/mika_draws').expect(200);
  assert.equal(body.exchanges, undefined);
  assert.deepEqual(body.stats, { eventsOrganized: 0 });
});

test('profiles list at most 12 events', async () => {
  const busy = await signUpAs('Busy', { username: 'busy_bee' });
  for (let i = 0; i < 14; i++) await makeEvent(busy.id, { name: `Swap ${i}` });
  const { body } = await h.request(app).get('/api/users/busy_bee').expect(200);
  assert.equal(body.organizing.length, 12);
  assert.equal(body.stats.eventsOrganized, 14);
});

// ---------- Notifications ----------

test('notifications page backwards with before and say when there are more', async () => {
  const me = await signUpAs('Reader');
  const someoneElse = await signUpAs('Someone');
  const base = Date.now() - 60 * 60 * 1000;
  await Notification.insertMany(
    Array.from({ length: 5 }, (_, i) => ({
      user: me.id,
      type: 'test',
      title: `Note ${i}`,
      createdAt: new Date(base + i * 60 * 1000),
      readAt: i < 2 ? new Date() : null,
    }))
  );
  await Notification.create({ user: someoneElse.id, type: 'test', title: 'Not mine' });

  const first = (await me.agent.get('/api/notifications?limit=2').expect(200)).body;
  assert.deepEqual(first.items.map((n) => n.title), ['Note 4', 'Note 3']);
  assert.equal(first.hasMore, true);
  assert.equal(first.unreadCount, 3);

  const cursor = encodeURIComponent(first.items.at(-1).createdAt);
  const second = (await me.agent.get(`/api/notifications?limit=2&before=${cursor}`).expect(200)).body;
  assert.deepEqual(second.items.map((n) => n.title), ['Note 2', 'Note 1']);
  assert.equal(second.hasMore, true);

  const last = (await me.agent.get(`/api/notifications?limit=2&before=${encodeURIComponent(second.items[1].createdAt)}`)).body;
  assert.deepEqual(last.items.map((n) => n.title), ['Note 0']);
  assert.equal(last.hasMore, false);

  const all = (await me.agent.get('/api/notifications').expect(200)).body;
  assert.equal(all.items.length, 5);
  assert.equal(all.hasMore, false);

  const bad = await me.agent.get('/api/notifications?before=yesterday-ish').expect(400);
  assert.equal(bad.body.code, 'VALIDATION');
});

// ---------- Export ----------

test('export gives back everything stored about me and nothing about anyone else', async () => {
  await h.request(app).get('/api/profile/export').expect(401);

  const me = await signUpAs('Exporter');
  const them = await signUpAs('Organiser');
  const event = await makeEvent(them.id, { name: 'Autumn Trade', status: 'active' });
  const application = await signUpFor(event, me.id);
  await signUpFor(event, them.id);
  await Character.create({ owner: me.id, name: 'Old OC', archivedAt: new Date() });
  await Character.create({ owner: them.id, name: 'Their OC' });
  const match = await Match.create({ event: event._id, giver: me.id, recipient: them.id, published: true });
  await Submission.create({
    event: event._id, match: match._id, giver: me.id, recipient: them.id, title: 'My gift', links: [{ url: 'https://example.com/gift' }],
  });
  const theirMatch = await Match.create({ event: event._id, giver: them.id, recipient: me.id, published: true });
  await Submission.create({ event: event._id, match: theirMatch._id, giver: them.id, recipient: me.id, title: 'Their gift' });
  await Notification.create({ user: me.id, type: 'test', title: 'Hello' });
  await Notification.create({ user: them.id, type: 'test', title: 'Not for me' });

  const res = await me.agent.get('/api/profile/export').expect(200);
  assert.equal(res.headers['cache-control'], 'no-store');
  const data = res.body;
  assert.ok(!Number.isNaN(Date.parse(data.exportedAt)));
  assert.equal(data.user.id, me.id);
  assert.equal(data.user.email, me.user.email);
  assert.deepEqual(data.characters.map((c) => c.name).sort(), ['Old OC', 'Pip']);
  assert.equal(data.applications.length, 1);
  assert.equal(data.applications[0].id, application.id);
  assert.equal(data.applications[0].eventName, 'Autumn Trade');
  assert.equal(data.applications[0].offeredCharacters[0].name, 'Pip');
  assert.deepEqual(data.submissions.map((s) => [s.title, s.eventName]), [['My gift', 'Autumn Trade']]);
  assert.deepEqual(data.notifications.map((n) => n.title), ['Hello']);
  assert.equal(JSON.stringify(data).includes('passwordHash'), false);
});

// ---------- Deactivation ----------

test('deactivating withdraws sign-ups that are not matched yet and clears draft matches', async () => {
  const leaver = await signUpAs('Leaver');
  const organizer = await signUpAs('Olive');
  const others = await Promise.all(['Ada', 'Ben', 'Cleo'].map((n) => signUpAs(n)));

  const openEvent = await makeEvent(organizer.id, { name: 'Open Swap' });
  const pendingEvent = await makeEvent(organizer.id, { name: 'Reviewed Swap', requireApproval: true });
  const rejectedEvent = await makeEvent(organizer.id, { name: 'Said No Swap' });
  const matchingEvent = await makeEvent(organizer.id, {
    name: 'Matching Swap', status: 'matching', signupDeadline: h.daysFromNow(-1),
  });
  const activeEvent = await makeEvent(organizer.id, {
    name: 'Active Swap', status: 'active', signupDeadline: h.daysFromNow(-5),
  });

  const open = await signUpFor(openEvent, leaver.id);
  const pending = await signUpFor(pendingEvent, leaver.id, 'pending');
  const rejected = await signUpFor(rejectedEvent, leaver.id, 'rejected');
  const inMatching = await signUpFor(matchingEvent, leaver.id);
  const inActive = await signUpFor(activeEvent, leaver.id);
  for (const p of others) await signUpFor(matchingEvent, p.id);

  // Draft matches in the matching event, published ones in the active event
  await Match.create({ event: matchingEvent._id, giver: leaver.id, recipient: others[0].id });
  await Match.create({ event: matchingEvent._id, giver: others[0].id, recipient: leaver.id });
  await Match.create({ event: activeEvent._id, giver: leaver.id, recipient: organizer.id, published: true });

  await leaver.agent.post('/api/profile/deactivate').send({ password: PASSWORD }).expect(200);

  const statusOf = async (a) => (await Application.findById(a._id)).status;
  assert.equal(await statusOf(open), 'withdrawn');
  assert.equal(await statusOf(pending), 'withdrawn');
  assert.equal(await statusOf(rejected), 'rejected');
  assert.equal(await statusOf(inMatching), 'withdrawn');
  assert.equal(await statusOf(inActive), 'accepted');

  const rolesIn = async (event) => (await EventMember.findOne({ user: leaver.id, event: event._id }))?.roles || [];
  assert.deepEqual(await rolesIn(openEvent), []);
  assert.deepEqual(await rolesIn(matchingEvent), []);
  assert.deepEqual(await rolesIn(activeEvent), ['participant']);

  assert.equal(await Match.countDocuments({ event: matchingEvent._id }), 0);
  assert.equal(await Match.countDocuments({ event: activeEvent._id }), 1);

  const told = await Notification.find({ user: organizer.id, type: 'application_withdrawn' });
  assert.equal(told.length, 1);
  assert.equal(told[0].title, 'Leaver left Matching Swap');
  assert.equal(told[0].link, `/events/${matchingEvent.id}/manage?tab=matching`);

  // Coming back doesn't bring the sign-ups back
  await h.request(app).post('/api/auth/login').send({ email: leaver.user.email, password: PASSWORD }).expect(200);
  assert.equal(await statusOf(open), 'withdrawn');
});
