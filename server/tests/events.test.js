const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');
const h = require('./helpers.js');
const Application = require('../models/Application.js');
const Event = require('../models/Event.js');
const EventMember = require('../models/EventMember.js');
const Match = require('../models/Match.js');
const Notification = require('../models/Notification.js');
const Submission = require('../models/Submission.js');
const User = require('../models/User.js');
const { LOCAL_UPLOAD_DIR } = require('../services/storage.js');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);

let app;
before(() => {
  app = h.makeApp();
});

const { ObjectId } = mongoose.Types;

function eventBody(overrides = {}) {
  return {
    name: 'Winter Swap',
    description: 'Cosy gifts for the cold months.',
    theme: 'Snowy cabins',
    season: 'winter',
    signupDeadline: h.daysFromNow(7).toISOString(),
    submissionDeadline: h.daysFromNow(30).toISOString(),
    minParticipants: 2,
    maxParticipants: 10,
    ...overrides,
  };
}

async function createEvent(agent, overrides) {
  const res = await agent.post('/api/events').send(eventBody(overrides)).expect(201);
  return res.body.event;
}

async function openEvent(agent, overrides) {
  const event = await createEvent(agent, overrides);
  const res = await agent.post(`/api/events/${event.id}/status`).send({ status: 'open' }).expect(200);
  return res.body.event;
}

// Skips the API for setup that would otherwise need matches, deadlines passing, etc.
const forceStatus = (eventId, status, extra = {}) => Event.updateOne({ _id: eventId }, { $set: { status, ...extra } });

async function addParticipant(eventId, userId, status = 'accepted') {
  const application = await Application.create({
    event: eventId,
    user: userId,
    status,
    communityUsername: `member_${userId}`,
    canCreate: ['art'],
    wantsTypes: ['art'],
    offeredCharacters: [new ObjectId()],
  });
  if (status === 'accepted') await EventMember.grant(userId, eventId, 'participant');
  return application;
}

// Sets profile fields directly so the tests don't depend on what register fills in
async function signUpAs(displayName, extra = {}) {
  const result = await h.signUp(app, extra.email ? { email: extra.email } : {});
  await User.updateOne({ _id: result.user.id }, { $set: { displayName, ...(extra.username ? { username: extra.username } : {}) } });
  return result;
}

// Accounts that never log in, just to fill events up
async function fakeUser(n) {
  return User.create({ email: `filler${n}-${Date.now()}@test.local`, displayName: `Filler ${n}` });
}

const notificationsFor = (userId, type) => Notification.find({ user: userId, ...(type ? { type } : {}) });

// ---------- Create and view ----------

test('creating an event: login required, starts as draft, creator becomes organiser', async () => {
  await h.request(app).post('/api/events').send(eventBody()).expect(401);

  const { agent, user } = await h.signUp(app);
  const res = await agent
    .post('/api/events')
    .send(
      eventBody({
        tags: 'cosy, Winter, cosy',
        allowedTypes: ['art', 'writing'],
        requireApproval: true,
        publicity: 'private',
        platform: 'discord',
        platformName: 'Cozy Critters',
        platformLink: 'https://discord.gg/cozy',
        status: 'open',
        createdBy: new ObjectId().toString(),
        inviteCode: 'mine',
        bannerUrl: 'https://evil.example/banner.png',
      })
    )
    .expect(201);

  const { event } = res.body;
  assert.equal(event.status, 'draft');
  assert.equal(event.name, 'Winter Swap');
  assert.deepEqual(event.tags, ['cosy', 'winter']);
  assert.deepEqual(event.allowedTypes, ['art', 'writing']);
  assert.equal(event.requireApproval, true);
  assert.equal(event.publicity, 'private');
  assert.equal(event.bannerUrl, null);
  assert.notEqual(event.inviteCode, 'mine');
  assert.ok(event.inviteCode);
  assert.equal(event.participantCount, 0);
  assert.deepEqual(event.organizers.map((o) => o.id), [user.id]);
  assert.deepEqual(event.viewer, { roles: ['organizer'], isOrganizer: true, applicationStatus: null });

  const stored = await Event.findById(event.id);
  assert.equal(stored.createdBy.toString(), user.id);
  assert.equal(stored.statusHistory.length, 1);
  assert.equal(stored.statusHistory[0].status, 'draft');
  assert.equal(stored.statusHistory[0].by.toString(), user.id);
});

test('creating an event validates its fields', async () => {
  const { agent } = await h.signUp(app);
  const cases = [
    [{ signupDeadline: h.daysFromNow(-1).toISOString() }, /future/],
    [{ signupDeadline: undefined }, /sign-up deadline/i],
    [{ signupDeadline: 'not a date' }, /valid date/],
    [{ submissionDeadline: h.daysFromNow(3).toISOString() }, /after sign-ups close/],
    [{ name: '   ' }, /name/i],
    [{ season: 'monsoon' }, /season/],
    [{ platform: 'myspace' }, /platform/],
    [{ publicity: 'secret' }, /public or private/],
    [{ minParticipants: 1 }, /Minimum participants/],
    [{ maxParticipants: 'lots' }, /Maximum participants/],
    [{ minParticipants: 8, maxParticipants: 4 }, /at least the minimum/],
    [{ allowedTypes: [] }, /at least one/],
    [{ allowedTypes: ['art', 'pottery'] }, /Creation types/],
    [{ platformLink: 'discord.gg/x' }, /http/],
    [{ requireApproval: 'sometimes' }, /true or false/],
  ];
  for (const [overrides, message] of cases) {
    const res = await agent.post('/api/events').send(eventBody(overrides)).expect(400);
    assert.equal(res.body.code, 'VALIDATION', JSON.stringify(overrides));
    assert.match(res.body.error, message, JSON.stringify(overrides));
  }
  assert.equal(await Event.countDocuments(), 0);
});

test('drafts are only visible to organisers', async () => {
  const org = await h.signUp(app);
  const other = await h.signUp(app);
  const event = await createEvent(org.agent);

  const guest = await h.request(app).get(`/api/events/${event.id}`).expect(404);
  assert.equal(guest.body.code, 'NOT_FOUND');
  await other.agent.get(`/api/events/${event.id}`).expect(404);
  await other.agent.get(`/api/events/${event.id}/organizers`).expect(404);
  // Org-only routes don't reveal that a draft exists either
  await other.agent.patch(`/api/events/${event.id}`).send({ name: 'x' }).expect(404);

  const own = await org.agent.get(`/api/events/${event.id}`).expect(200);
  assert.equal(own.body.event.status, 'draft');

  await h.request(app).get('/api/events/not-an-id').expect(404);
  await h.request(app).get(`/api/events/${new ObjectId()}`).expect(404);
});

test('public events are visible to everyone without the invite code', async () => {
  const org = await h.signUp(app);
  const event = await openEvent(org.agent);

  const guest = await h.request(app).get(`/api/events/${event.id}`).expect(200);
  assert.equal(guest.body.event.viewer, null);
  assert.equal(guest.body.event.inviteCode, undefined);

  const other = await h.signUp(app);
  const res = await other.agent.get(`/api/events/${event.id}`).expect(200);
  assert.deepEqual(res.body.event.viewer, { roles: [], isOrganizer: false, applicationStatus: null });
  assert.equal(res.body.event.inviteCode, undefined);

  const organizers = await h.request(app).get(`/api/events/${event.id}/organizers`).expect(200);
  assert.equal(organizers.body.organizers.length, 1);
});

test('private events need membership, an application or the invite code', async () => {
  const org = await h.signUp(app);
  const member = await h.signUp(app);
  const stranger = await h.signUp(app);
  const event = await openEvent(org.agent, { publicity: 'private' });

  await h.request(app).get(`/api/events/${event.id}`).expect(404);
  await stranger.agent.get(`/api/events/${event.id}`).expect(404);
  await stranger.agent.get(`/api/events/${event.id}?invite=wrong`).expect(404);

  const withCode = await stranger.agent.get(`/api/events/${event.id}?invite=${event.inviteCode}`).expect(200);
  assert.equal(withCode.body.event.inviteCode, undefined);
  await h.request(app).get(`/api/events/${event.id}/organizers?invite=${event.inviteCode}`).expect(200);

  await addParticipant(event.id, member.user.id);
  const asMember = await member.agent.get(`/api/events/${event.id}`).expect(200);
  assert.equal(asMember.body.event.viewer.applicationStatus, 'accepted');
  assert.deepEqual(asMember.body.event.viewer.roles, ['participant']);
});

// ---------- Listing ----------

test('listing shows public, non-draft events with filters, search and sorting', async () => {
  const mika = await signUpAs('Mika Draws');
  const juno = await signUpAs('Juno', { username: 'juno_paints' });

  const winter = await openEvent(mika.agent, { name: 'Winter Swap', season: 'winter', signupDeadline: h.daysFromNow(5).toISOString() });
  const spring = await openEvent(mika.agent, { name: 'Spring Fling', theme: 'Blossoms', season: 'spring', signupDeadline: h.daysFromNow(3).toISOString() });
  const valentine = await openEvent(juno.agent, { name: 'Heart Exchange', description: 'Lots of [love] (and cake)', season: 'valentine', signupDeadline: h.daysFromNow(9).toISOString(), submissionDeadline: h.daysFromNow(40).toISOString() });
  const done = await openEvent(juno.agent, { name: 'Last Year', season: 'christmas', signupDeadline: h.daysFromNow(1).toISOString() });
  const hidden = await openEvent(mika.agent, { name: 'Secret Club', publicity: 'private' });
  await createEvent(mika.agent, { name: 'Unfinished Draft' });

  await forceStatus(valentine.id, 'active');
  await forceStatus(done.id, 'completed');

  const fillers = await Promise.all([1, 2, 3].map(fakeUser));
  for (const f of fillers) await addParticipant(valentine.id, f._id);
  await addParticipant(spring.id, fillers[0]._id);
  await addParticipant(spring.id, fillers[1]._id, 'pending');
  await addParticipant(hidden.id, fillers[2]._id);

  const list = async (query, agent = h.request(app)) => (await agent.get(`/api/events${query}`).expect(200)).body;

  const all = await list('');
  assert.equal(all.total, 4);
  // Default sort: next deadline first, completed events last
  assert.deepEqual(all.events.map((e) => e.name), ['Spring Fling', 'Winter Swap', 'Heart Exchange', 'Last Year']);
  const heart = all.events.find((e) => e.id === valentine.id);
  assert.equal(heart.participantCount, 3);
  assert.deepEqual(heart.organizers.map((o) => o.id), [juno.user.id]);
  assert.equal(heart.viewer, null);
  assert.equal(heart.inviteCode, undefined);
  assert.equal(all.events.find((e) => e.id === spring.id).participantCount, 1);

  assert.deepEqual((await list('?status=open')).events.map((e) => e.name), ['Spring Fling', 'Winter Swap']);
  assert.deepEqual((await list('?status=active')).events.map((e) => e.id), [valentine.id]);
  assert.deepEqual((await list('?status=completed')).events.map((e) => e.id), [done.id]);
  assert.equal((await list('?status=upcoming')).total, 3);
  assert.deepEqual((await list('?season=spring')).events.map((e) => e.id), [spring.id]);

  assert.deepEqual((await list('?q=WINTER')).events.map((e) => e.id), [winter.id]);
  assert.deepEqual((await list('?q=blossom')).events.map((e) => e.id), [spring.id]);
  assert.deepEqual((await list('?q=%5Blove%5D')).events.map((e) => e.id), [valentine.id]);
  assert.equal((await list('?q=.*')).total, 0);
  // Organiser display name and username
  assert.deepEqual((await list('?q=mika%20draws&sort=newest')).events.map((e) => e.id), [spring.id, winter.id]);
  assert.deepEqual((await list('?q=juno_paints&status=upcoming')).events.map((e) => e.id), [valentine.id]);

  assert.deepEqual((await list('?minParticipants=2')).events.map((e) => e.id), [valentine.id]);
  assert.deepEqual((await list('?maxParticipants=0')).events.map((e) => e.name), ['Winter Swap', 'Last Year']);
  assert.deepEqual((await list('?minParticipants=1&maxParticipants=1')).events.map((e) => e.id), [spring.id]);

  assert.deepEqual((await list('?sort=popular')).events.map((e) => e.name).slice(0, 2), ['Heart Exchange', 'Spring Fling']);
  assert.deepEqual((await list('?sort=newest')).events.map((e) => e.name), ['Last Year', 'Heart Exchange', 'Spring Fling', 'Winter Swap']);

  const page2 = await list('?limit=3&page=2');
  assert.equal(page2.total, 4);
  assert.equal(page2.page, 2);
  assert.equal(page2.pages, 2);
  assert.deepEqual(page2.events.map((e) => e.name), ['Last Year']);
  const capped = await list('?limit=500');
  assert.equal(capped.pages, 1);
  const empty = await list('?q=nothing-matches-this');
  assert.deepEqual([empty.total, empty.events.length, empty.pages], [0, 0, 1]);

  for (const bad of ['?status=draft', '?sort=random', '?season=monsoon', '?minParticipants=-1']) {
    const res = await h.request(app).get(`/api/events${bad}`).expect(400);
    assert.equal(res.body.code, 'VALIDATION', bad);
  }

  // Logged in: viewer is filled in, and organisers see their invite code
  const mine = await list('?status=open', mika.agent);
  const winterRow = mine.events.find((e) => e.id === winter.id);
  assert.equal(winterRow.viewer.isOrganizer, true);
  assert.ok(winterRow.inviteCode);
  const participantView = await list('?status=active', mika.agent);
  assert.deepEqual(participantView.events[0].viewer, { roles: [], isOrganizer: false, applicationStatus: null });
});

// ---------- My events ----------

test('my events lists what I organise (with stats) and what I joined', async () => {
  const org = await h.signUp(app);
  const me = await h.signUp(app);

  const draft = await createEvent(org.agent, { name: 'Draft One' });
  const open = await openEvent(org.agent, { name: 'Open One' });
  const active = await openEvent(org.agent, { name: 'Active One' });
  await forceStatus(active.id, 'active');

  const fillers = await Promise.all([1, 2, 3].map(fakeUser));
  await addParticipant(open.id, me.user.id, 'pending');
  await addParticipant(open.id, fillers[0]._id, 'accepted');
  await addParticipant(open.id, fillers[1]._id, 'withdrawn');
  const giverApp = await addParticipant(active.id, me.user.id, 'accepted');
  await addParticipant(active.id, fillers[2]._id, 'accepted');
  const match = await Match.create({ event: active.id, giver: me.user.id, recipient: fillers[2]._id, giverApplication: giverApp._id, published: true });
  await Submission.create({ event: active.id, match: match._id, giver: me.user.id, recipient: fillers[2]._id, links: [{ url: 'https://example.com/gift' }] });

  const elsewhere = await openEvent(me.agent, { name: 'My Own Event' });
  await addParticipant(elsewhere.id, fillers[0]._id);
  const otherOrg = await h.signUp(app);
  const left = await openEvent(otherOrg.agent, { name: 'Left Event' });
  await addParticipant(left.id, me.user.id, 'withdrawn');

  await h.request(app).get('/api/events/mine').expect(401);

  const orgView = (await org.agent.get('/api/events/mine').expect(200)).body;
  assert.deepEqual(orgView.organizing.map((e) => e.name), ['Draft One', 'Open One', 'Active One']);
  assert.deepEqual(orgView.participating, []);
  const byName = Object.fromEntries(orgView.organizing.map((e) => [e.name, e]));
  assert.deepEqual(byName['Open One'].stats, { applications: 2, pending: 1, accepted: 1, submitted: 0 });
  assert.deepEqual(byName['Active One'].stats, { applications: 2, pending: 0, accepted: 2, submitted: 1 });
  assert.deepEqual(byName['Draft One'].stats, { applications: 0, pending: 0, accepted: 0, submitted: 0 });
  assert.equal(byName['Draft One'].id, draft.id);
  assert.ok(byName['Draft One'].inviteCode);

  const myView = (await me.agent.get('/api/events/mine').expect(200)).body;
  assert.deepEqual(myView.organizing.map((e) => e.name), ['My Own Event']);
  assert.deepEqual(myView.participating.map((e) => [e.name, e.viewer.applicationStatus]), [
    ['Open One', 'pending'],
    ['Active One', 'accepted'],
  ]);
  assert.equal(myView.participating[0].inviteCode, undefined);
  assert.equal(myView.participating[0].stats, undefined);
});

// ---------- Editing ----------

test('only organisers can edit, and only whitelisted fields change', async () => {
  const org = await h.signUp(app);
  const other = await h.signUp(app);
  const event = await openEvent(org.agent);

  await h.request(app).patch(`/api/events/${event.id}`).send({ name: 'Nope' }).expect(401);
  const denied = await other.agent.patch(`/api/events/${event.id}`).send({ name: 'Nope' }).expect(403);
  assert.equal(denied.body.code, 'ACCESS_DENIED');

  const res = await org.agent
    .patch(`/api/events/${event.id}`)
    .send({ name: 'Winter Swap 2026', rules: 'Be kind.', status: 'completed', inviteCode: 'abc', createdBy: other.user.id, maxParticipants: 20 })
    .expect(200);
  assert.equal(res.body.event.name, 'Winter Swap 2026');
  assert.equal(res.body.event.rules, 'Be kind.');
  assert.equal(res.body.event.status, 'open');
  assert.equal(res.body.event.maxParticipants, 20);
  assert.equal(res.body.event.inviteCode, event.inviteCode);

  const bad = await org.agent.patch(`/api/events/${event.id}`).send({ submissionDeadline: h.daysFromNow(2).toISOString() }).expect(400);
  assert.match(bad.body.error, /after sign-ups close/);
});

test('sign-up settings lock once sign-ups close, and completed events lock entirely', async () => {
  const org = await h.signUp(app);
  const event = await openEvent(org.agent, { maxParticipants: 5 });
  const fillers = await Promise.all([1, 2, 3].map(fakeUser));
  for (const f of fillers) await addParticipant(event.id, f._id);

  const tooLow = await org.agent.patch(`/api/events/${event.id}`).send({ maxParticipants: 2 }).expect(400);
  assert.match(tooLow.body.error, /3 people are already accepted/);
  await org.agent.patch(`/api/events/${event.id}`).send({ maxParticipants: 3 }).expect(200);

  const past = await org.agent.patch(`/api/events/${event.id}`).send({ signupDeadline: h.daysFromNow(-1).toISOString() }).expect(400);
  assert.match(past.body.error, /future/);

  await forceStatus(event.id, 'matching');
  for (const [field, value] of [
    ['allowedTypes', ['art']],
    ['requireApproval', true],
    ['minParticipants', 3],
    ['maxParticipants', 8],
    ['publicity', 'private'],
  ]) {
    const res = await org.agent.patch(`/api/events/${event.id}`).send({ [field]: value }).expect(409);
    assert.equal(res.body.code, 'FIELD_LOCKED', field);
  }
  // Sending back unchanged values (as the edit form does) is fine
  const same = await org.agent
    .patch(`/api/events/${event.id}`)
    .send({ allowedTypes: ['writing', 'adoptable', 'art'], requireApproval: false, maxParticipants: 3, publicity: 'public', description: 'Updated' })
    .expect(200);
  assert.equal(same.body.event.description, 'Updated');

  await forceStatus(event.id, 'completed');
  const locked = await org.agent.patch(`/api/events/${event.id}`).send({ name: 'Too late' }).expect(409);
  assert.equal(locked.body.code, 'EVENT_LOCKED');
});

test('changing deadlines after sign-ups open tells accepted participants', async () => {
  const org = await h.signUp(app);
  const draft = await createEvent(org.agent);
  const filler = await fakeUser(1);
  const pending = await fakeUser(2);

  // Drafts have nobody to tell
  await org.agent.patch(`/api/events/${draft.id}`).send({ submissionDeadline: h.daysFromNow(31).toISOString() }).expect(200);

  const event = await openEvent(org.agent);
  await addParticipant(event.id, filler._id);
  await addParticipant(event.id, pending._id, 'pending');
  await addParticipant(event.id, org.user.id);

  await org.agent.patch(`/api/events/${event.id}`).send({ description: 'No deadline change' }).expect(200);
  assert.equal((await Notification.countDocuments()), 0);

  await org.agent.patch(`/api/events/${event.id}`).send({ submissionDeadline: h.daysFromNow(45).toISOString() }).expect(200);
  const notes = await notificationsFor(filler._id, 'event_status');
  assert.equal(notes.length, 1);
  assert.match(notes[0].title, /New deadlines for Winter Swap/);
  assert.match(notes[0].message, /Gifts are now due/);
  assert.equal(notes[0].link, `/events/${event.id}`);
  assert.equal((await notificationsFor(pending._id)).length, 0);
  // Not the organiser who made the change
  assert.equal((await notificationsFor(org.user.id)).length, 0);
});

// ---------- Deleting ----------

test('deleting an event removes everything that belongs to it', async () => {
  const org = await h.signUp(app);
  const other = await h.signUp(app);
  const event = await openEvent(org.agent);
  const keep = await openEvent(org.agent, { name: 'Keep me' });
  const filler = await fakeUser(1);
  const app1 = await addParticipant(event.id, other.user.id);
  await addParticipant(event.id, filler._id);
  await addParticipant(keep.id, filler._id);
  const match = await Match.create({ event: event.id, giver: other.user.id, recipient: filler._id, giverApplication: app1._id });
  await Submission.create({ event: event.id, match: match._id, giver: other.user.id, recipient: filler._id });

  await h.request(app).delete(`/api/events/${event.id}`).expect(401);
  await other.agent.delete(`/api/events/${event.id}`).expect(403);

  const res = await org.agent.delete(`/api/events/${event.id}`).expect(200);
  assert.deepEqual(res.body, { ok: true });

  assert.equal(await Event.exists({ _id: event.id }), null);
  assert.equal(await Application.countDocuments({ event: event.id }), 0);
  assert.equal(await Match.countDocuments({ event: event.id }), 0);
  assert.equal(await Submission.countDocuments({ event: event.id }), 0);
  assert.equal(await EventMember.countDocuments({ event: event.id }), 0);
  assert.equal(await Application.countDocuments({ event: keep.id }), 1);
  assert.equal(await EventMember.countDocuments({ event: keep.id }), 2);

  const notes = await notificationsFor(other.user.id, 'event_status');
  assert.equal(notes.length, 1);
  assert.match(notes[0].title, /cancelled/);
  assert.equal(notes[0].link, '/my-events');

  await org.agent.get(`/api/events/${event.id}`).expect(404);
});

// ---------- Lifecycle ----------

test('status changes follow the lifecycle table', async () => {
  const org = await h.signUp(app);
  const other = await h.signUp(app);
  const event = await createEvent(org.agent);
  const post = (status, agent = org.agent) => agent.post(`/api/events/${event.id}/status`).send({ status });

  await h.request(app).post(`/api/events/${event.id}/status`).send({ status: 'open' }).expect(401);

  const skip = await post('matching').expect(400);
  assert.equal(skip.body.code, 'INVALID_TRANSITION');
  assert.match(skip.body.error, /open/);
  assert.equal((await post('banana').expect(400)).body.code, 'INVALID_TRANSITION');
  assert.equal((await post('draft').expect(400)).body.code, 'INVALID_TRANSITION');

  const opened = await post('open').expect(200);
  assert.equal(opened.body.event.status, 'open');
  await post('open', other.agent).expect(403);

  // open -> draft works while nobody has signed up (withdrawn applications don't count)
  const withdrawn = await fakeUser(9);
  await addParticipant(event.id, withdrawn._id, 'withdrawn');
  await post('draft').expect(200);
  await post('open').expect(200);

  const filler = await fakeUser(1);
  await addParticipant(event.id, filler._id);
  const back = await post('draft').expect(409);
  assert.equal(back.body.code, 'HAS_APPLICATIONS');

  const closed = await post('matching').expect(200);
  assert.equal(closed.body.event.status, 'matching');
  const closedNotes = await notificationsFor(filler._id, 'event_status');
  assert.equal(closedNotes.length, 1);
  assert.match(closedNotes[0].title, /Sign-ups closed for Winter Swap, matches are on the way/);

  const publish = await post('active').expect(400);
  assert.equal(publish.body.code, 'USE_PUBLISH');

  // Reopening throws away draft matches but never published ones
  await Match.create({ event: event.id, giver: filler._id, recipient: org.user.id });
  await post('open').expect(200);
  assert.equal(await Match.countDocuments({ event: event.id }), 0);

  await post('matching').expect(200);
  await forceStatus(event.id, 'active', { publishedAt: new Date() });
  assert.equal((await post('open').expect(400)).body.code, 'INVALID_TRANSITION');

  const completed = await post('completed').expect(200);
  assert.equal(completed.body.event.status, 'completed');
  assert.ok(completed.body.event.completedAt);
  const revealed = await notificationsFor(filler._id, 'gift_revealed');
  assert.equal(revealed.length, 1);
  assert.equal(revealed[0].title, 'Gifts for Winter Swap are revealed!');
  assert.equal(revealed[0].link, `/events/${event.id}/results`);

  const finished = await post('active').expect(400);
  assert.equal(finished.body.code, 'INVALID_TRANSITION');

  const stored = await Event.findById(event.id);
  assert.deepEqual(stored.statusHistory.map((s) => s.status), ['draft', 'open', 'draft', 'open', 'matching', 'open', 'matching', 'completed']);
  assert.equal(stored.statusHistory.at(-1).by.toString(), org.user.id);
});

test('opening sign-ups needs a sign-up deadline in the future', async () => {
  const org = await h.signUp(app);
  const event = await createEvent(org.agent);
  await Event.updateOne({ _id: event.id }, { $set: { signupDeadline: h.daysFromNow(-1) } });

  const res = await org.agent.post(`/api/events/${event.id}/status`).send({ status: 'open' }).expect(400);
  assert.equal(res.body.code, 'DEADLINE_PASSED');

  await org.agent.patch(`/api/events/${event.id}`).send({ signupDeadline: h.daysFromNow(2).toISOString() }).expect(200);
  await org.agent.post(`/api/events/${event.id}/status`).send({ status: 'open' }).expect(200);
});

// ---------- Invite code, banner ----------

test('organisers can regenerate the invite code, which retires the old one', async () => {
  const org = await h.signUp(app);
  const other = await h.signUp(app);
  const event = await openEvent(org.agent, { publicity: 'private' });

  await other.agent.post(`/api/events/${event.id}/invite/regenerate`).expect(404);
  const res = await org.agent.post(`/api/events/${event.id}/invite/regenerate`).expect(200);
  assert.ok(res.body.inviteCode);
  assert.notEqual(res.body.inviteCode, event.inviteCode);

  await other.agent.get(`/api/events/${event.id}?invite=${event.inviteCode}`).expect(404);
  await other.agent.get(`/api/events/${event.id}?invite=${res.body.inviteCode}`).expect(200);
  // Can see it now, but still can't manage it
  await other.agent.post(`/api/events/${event.id}/invite/regenerate?invite=${res.body.inviteCode}`).expect(403);
});

test('banner upload checks type and size, and can be removed', async () => {
  const org = await h.signUp(app);
  const other = await h.signUp(app);
  const event = await openEvent(org.agent);
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );

  await other.agent.post(`/api/events/${event.id}/banner`).attach('banner', png, 'b.png').expect(403);

  const wrongType = await org.agent
    .post(`/api/events/${event.id}/banner`)
    .attach('banner', Buffer.from('hello'), { filename: 'b.txt', contentType: 'text/plain' })
    .expect(400);
  assert.match(wrongType.body.error, /PNG, JPG/);

  const tooBig = await org.agent
    .post(`/api/events/${event.id}/banner`)
    .attach('banner', Buffer.alloc(5 * 1024 * 1024 + 1), { filename: 'big.png', contentType: 'image/png' })
    .expect(400);
  assert.equal(tooBig.body.error, 'Banner images must be 5 MB or smaller.');

  // Named and typed like a PNG, but it isn't one
  const fake = await org.agent
    .post(`/api/events/${event.id}/banner`)
    .attach('banner', Buffer.from('<html><script>alert(1)</script></html>'), { filename: 'b.png', contentType: 'image/png' })
    .expect(400);
  assert.match(fake.body.error, /PNG, JPG/);

  await org.agent.post(`/api/events/${event.id}/banner`).expect(400);

  const res = await org.agent
    .post(`/api/events/${event.id}/banner`)
    .attach('banner', png, { filename: 'banner.png', contentType: 'image/png' })
    .expect(200);
  const url = res.body.event.bannerUrl;
  assert.match(url, /^\/uploads\/banners\/.+\.png$/);
  await fs.rm(path.join(LOCAL_UPLOAD_DIR, url.replace(/^\/uploads\//, '')), { force: true });

  const removed = await org.agent.delete(`/api/events/${event.id}/banner`).expect(200);
  assert.equal(removed.body.event.bannerUrl, null);
});

// ---------- Organisers ----------

test('organisers can add co-organisers by email or username and remove them', async () => {
  const org = await signUpAs('Mika');
  const helper = await signUpAs('Helper', { email: 'Helper.Person@Test.local' });
  const third = await signUpAs('Third', { username: 'third_artist' });
  const event = await openEvent(org.agent);
  const add = (identifier, agent = org.agent) => agent.post(`/api/events/${event.id}/organizers`).send({ identifier });

  await add('helper.person@test.local', helper.agent).expect(403);
  assert.equal((await add('nobody@test.local').expect(404)).body.code, 'USER_NOT_FOUND');
  assert.equal((await add('').expect(400)).body.code, 'VALIDATION');

  const byEmail = await add('HELPER.person@test.local').expect(200);
  assert.deepEqual(byEmail.body.organizers.map((o) => o.id), [org.user.id, helper.user.id]);
  const notes = await notificationsFor(helper.user.id, 'organizer_added');
  assert.equal(notes.length, 1);
  assert.equal(notes[0].link, `/events/${event.id}/manage`);
  assert.match(notes[0].message, /Mika added you/);

  // Adding someone twice doesn't notify them again
  await add('helper.person@test.local').expect(200);
  assert.equal((await notificationsFor(helper.user.id, 'organizer_added')).length, 1);

  const byUsername = await add('@Third_Artist').expect(200);
  assert.equal(byUsername.body.organizers.length, 3);

  // The new organiser can manage the event straight away
  await helper.agent.patch(`/api/events/${event.id}`).send({ theme: 'Mittens' }).expect(200);

  const list = await h.request(app).get(`/api/events/${event.id}/organizers`).expect(200);
  assert.equal(list.body.organizers.length, 3);
  assert.equal(list.body.organizers[0].email, undefined);

  await third.agent.delete(`/api/events/${event.id}/organizers/${org.user.id}`).expect(200);
  await helper.agent.delete(`/api/events/${event.id}/organizers/${third.user.id}`).expect(200);
  await helper.agent.delete(`/api/events/${event.id}/organizers/${new ObjectId()}`).expect(404);
  const last = await helper.agent.delete(`/api/events/${event.id}/organizers/${helper.user.id}`).expect(400);
  assert.equal(last.body.code, 'LAST_ORGANIZER');

  await org.agent.patch(`/api/events/${event.id}`).send({ theme: 'x' }).expect(403);
  const final = await h.request(app).get(`/api/events/${event.id}/organizers`).expect(200);
  assert.deepEqual(final.body.organizers.map((o) => o.id), [helper.user.id]);
});

test('deadline sort uses each event\'s next relevant date, with completed events last', async () => {
  const app = h.makeApp();
  const owner = await User.create({ email: 'sorter@test.local', displayName: 'Sorter' });
  const make = (name, status, fields) =>
    Event.create({ name, status, publicity: 'public', createdBy: owner._id, ...fields });

  await make('Open later', 'open', { signupDeadline: h.daysFromNow(20), submissionDeadline: h.daysFromNow(50) });
  await make('Done long ago', 'completed', {
    signupDeadline: h.daysFromNow(-60), submissionDeadline: h.daysFromNow(-30), completedAt: h.daysFromNow(-5),
  });
  await make('Gifts due soon', 'active', { signupDeadline: h.daysFromNow(-10), submissionDeadline: h.daysFromNow(2) });
  await make('Open soon', 'open', { signupDeadline: h.daysFromNow(5), submissionDeadline: h.daysFromNow(30) });
  await make('Just finished', 'completed', {
    signupDeadline: h.daysFromNow(-40), submissionDeadline: h.daysFromNow(-3), completedAt: h.daysFromNow(-1),
  });
  await make('Being matched', 'matching', { signupDeadline: h.daysFromNow(-1), submissionDeadline: h.daysFromNow(10) });

  const res = await h.request(app).get('/api/events?sort=deadline').expect(200);
  assert.deepEqual(res.body.events.map((e) => e.name), [
    'Gifts due soon',
    'Open soon',
    'Being matched',
    'Open later',
    'Just finished',
    'Done long ago',
  ]);
});

// ---------- Duplicate ----------

test('duplicating an event copies the settings into a new draft owned by the caller', async () => {
  const { agent, user } = await h.signUp(app);
  const source = await openEvent(
    agent,
    {
      tags: 'cosy, winter',
      rules: 'Be kind.',
      allowedTypes: ['art', 'writing'],
      requireApproval: true,
      publicity: 'private',
      platform: 'discord',
      platformName: 'Cozy Critters',
      platformLink: 'https://discord.gg/cozy',
      signupDeadline: h.daysFromNow(3).toISOString(),
      submissionDeadline: h.daysFromNow(10).toISOString(),
    }
  );
  await addParticipant(source.id, (await fakeUser(1)).id);

  const before = Date.now();
  const res = await agent.post(`/api/events/${source.id}/duplicate`).send({}).expect(201);
  const copy = res.body.event;

  assert.notEqual(copy.id, source.id);
  assert.equal(copy.name, 'Copy of Winter Swap');
  assert.equal(copy.status, 'draft');
  assert.equal(copy.participantCount, 0);
  assert.equal(copy.description, source.description);
  assert.equal(copy.rules, 'Be kind.');
  assert.deepEqual(copy.tags, ['cosy', 'winter']);
  assert.deepEqual(copy.allowedTypes, ['art', 'writing']);
  assert.equal(copy.requireApproval, true);
  assert.equal(copy.publicity, 'private');
  assert.equal(copy.platformName, 'Cozy Critters');
  assert.equal(copy.platformLink, 'https://discord.gg/cozy');
  assert.equal(copy.minParticipants, 2);
  assert.equal(copy.maxParticipants, 10);
  assert.notEqual(copy.inviteCode, source.inviteCode);
  assert.deepEqual(copy.organizers.map((o) => o.id), [user.id]);

  // Sign-ups close two weeks from now; the time to make gifts stays what it was (7 days)
  const signup = new Date(copy.signupDeadline).getTime();
  const day = 24 * 60 * 60 * 1000;
  assert.ok(Math.abs(signup - (before + 14 * day)) < 60 * 1000);
  const gap = new Date(copy.submissionDeadline).getTime() - signup;
  assert.equal(gap, new Date(source.submissionDeadline).getTime() - new Date(source.signupDeadline).getTime());

  // Nothing about the people came along
  assert.equal(await Application.countDocuments({ event: copy.id }), 0);
  assert.equal(await EventMember.countDocuments({ event: copy.id, roles: 'participant' }), 0);
});

test('duplicating takes a name and dates, and checks them like creating does', async () => {
  const { agent } = await h.signUp(app);
  const source = await createEvent(agent);
  const url = `/api/events/${source.id}/duplicate`;

  const signupDeadline = h.daysFromNow(20).toISOString();
  const submissionDeadline = h.daysFromNow(40).toISOString();
  const res = await agent.post(url).send({ name: '  Spring Swap ', signupDeadline, submissionDeadline }).expect(201);
  assert.equal(res.body.event.name, 'Spring Swap');
  assert.equal(new Date(res.body.event.signupDeadline).toISOString(), signupDeadline);
  assert.equal(new Date(res.body.event.submissionDeadline).toISOString(), submissionDeadline);

  await agent.post(url).send({ signupDeadline: h.daysFromNow(-1).toISOString() }).expect(400);
  await agent.post(url).send({ signupDeadline: 'tomorrow-ish' }).expect(400);
  await agent.post(url).send({ name: 'x'.repeat(500) }).expect(400);
  // The new sign-up date lands after the old submission date, so the second date must follow it
  await agent
    .post(url)
    .send({ signupDeadline: h.daysFromNow(50).toISOString(), submissionDeadline: h.daysFromNow(45).toISOString() })
    .expect(400);
  assert.equal(await Event.countDocuments({}), 2);
});

test('only organisers can duplicate, and completed events can be duplicated too', async () => {
  const { agent: organizer } = await h.signUp(app);
  const { agent: other } = await h.signUp(app);
  const source = await openEvent(organizer);

  await h.request(app).post(`/api/events/${source.id}/duplicate`).send({}).expect(401);
  assert.equal((await other.post(`/api/events/${source.id}/duplicate`).send({}).expect(403)).body.code, 'ACCESS_DENIED');
  await organizer.post(`/api/events/${new ObjectId()}/duplicate`).send({}).expect(404);

  await forceStatus(source.id, 'completed', { completedAt: new Date() });
  const res = await organizer.post(`/api/events/${source.id}/duplicate`).send({}).expect(201);
  assert.equal(res.body.event.status, 'draft');
});
