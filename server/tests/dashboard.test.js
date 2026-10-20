const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const h = require('./helpers.js');
const Application = require('../models/Application.js');
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

const { ObjectId } = mongoose.Types;

async function signUpAs(displayName) {
  const result = await h.signUp(app);
  await User.updateOne({ _id: result.user.id }, { $set: { displayName } });
  return { ...result, id: result.user.id, name: displayName };
}

// Accounts that never log in, just to fill events
let fillerCount = 0;
function filler(displayName) {
  fillerCount += 1;
  return User.create({ email: `filler${fillerCount}-${Date.now()}@test.local`, displayName });
}

// signupDays / submissionDays: deadlines relative to now
async function makeEvent(organizerId, { name, status, signupDays = -5, submissionDays = 10, ...extra }) {
  const event = await Event.create({
    name,
    status,
    signupDeadline: h.daysFromNow(signupDays),
    submissionDeadline: h.daysFromNow(submissionDays),
    minParticipants: 2,
    createdBy: organizerId,
    ...extra,
  });
  await EventMember.grant(organizerId, event._id, 'organizer');
  return event;
}

function apply(eventId, userId, status = 'accepted') {
  return Application.create({
    event: eventId,
    user: userId,
    status,
    communityUsername: `member_${userId}`,
    canCreate: ['art'],
    wantsTypes: ['art'],
    offeredCharacters: [new ObjectId()],
  });
}

function match(eventId, giver, recipient, published = true) {
  return Match.create({ event: eventId, giver, recipient, published, score: 80 });
}

function submit(m, { late = false } = {}) {
  return Submission.create({
    event: m.event,
    match: m._id,
    giver: m.giver,
    recipient: m.recipient,
    links: [{ url: 'https://example.com/gift' }],
    late,
  });
}

// Olive organises several events and takes part in someone else's
async function buildWorld() {
  const olive = await signUpAs('Olive Organiser');
  const host = await signUpAs('Hana Host');
  const [ada, ben, cleo, dev] = await Promise.all(['Ada', 'Ben', 'Cleo', 'Dev'].map((n) => filler(n)));

  // Active, deadline passed: 3 matches, 1 gift in
  const overdue = await makeEvent(olive.id, { name: 'Overdue Swap', status: 'active', signupDays: -20, submissionDays: -1 });
  for (const u of [ada, ben, cleo]) await apply(overdue._id, u._id);
  await apply(overdue._id, dev._id, 'withdrawn');
  const m1 = await match(overdue._id, ada._id, ben._id);
  await match(overdue._id, ben._id, cleo._id);
  await match(overdue._id, cleo._id, ada._id);
  await submit(m1, { late: false });

  // Open: one accepted, one pending, one withdrawn
  const open = await makeEvent(olive.id, { name: 'Spring Swap', status: 'open', signupDays: 5, submissionDays: 30 });
  await apply(open._id, ada._id, 'accepted');
  await apply(open._id, ben._id, 'pending');
  await apply(open._id, cleo._id, 'withdrawn');

  const draft = await makeEvent(olive.id, { name: 'Draft Swap', status: 'draft', signupDays: 9, submissionDays: 40 });
  const recent = await makeEvent(olive.id, {
    name: 'Recent Swap',
    status: 'completed',
    signupDays: -60,
    submissionDays: -20,
    completedAt: h.daysFromNow(-10),
  });
  await makeEvent(olive.id, {
    name: 'Old Swap',
    status: 'completed',
    signupDays: -90,
    submissionDays: -60,
    completedAt: h.daysFromNow(-40),
  });

  // Hana's events: Olive makes a gift for Ben in one, applied to another, was rejected from a third
  const hosted = await makeEvent(host.id, { name: 'Hana Winter Swap', status: 'active', signupDays: -3, submissionDays: 12 });
  await apply(hosted._id, olive.id, 'accepted');
  await apply(hosted._id, ben._id, 'accepted');
  await EventMember.grant(olive.id, hosted._id, 'participant');
  const myMatch = await match(hosted._id, olive.id, ben._id);
  await match(hosted._id, ben._id, olive.id);

  const applied = await makeEvent(host.id, { name: 'Hana Autumn Swap', status: 'open', signupDays: 3, submissionDays: 20 });
  await apply(applied._id, olive.id, 'pending');
  const rejected = await makeEvent(host.id, { name: 'Hana Summer Swap', status: 'open', signupDays: 2, submissionDays: 20 });
  await apply(rejected._id, olive.id, 'rejected');

  // Hana's own event Olive has nothing to do with
  await makeEvent(host.id, { name: 'Unrelated Swap', status: 'open', signupDays: 1, submissionDays: 20 });

  await Notification.create([
    { user: olive.id, type: 'test', title: 'Unread' },
    { user: olive.id, type: 'test', title: 'Read', readAt: new Date() },
    { user: host.id, type: 'test', title: 'Not Olive' },
  ]);

  return { olive, host, overdue, open, draft, recent, hosted, applied, rejected, myMatch, ben };
}

test('dashboard: login required', async () => {
  const res = await h.request(app).get('/api/dashboard').expect(401);
  assert.equal(res.body.code, 'AUTH_REQUIRED');
});

test('dashboard: a brand-new account gets empty lists', async () => {
  const { agent, id } = await signUpAs('New Person');
  const res = await agent.get('/api/dashboard').expect(200);
  assert.deepEqual(res.body.assignments, []);
  assert.deepEqual(res.body.organizing, []);
  assert.deepEqual(res.body.upcoming, []);
  assert.deepEqual(res.body.counts, {
    organizing: 0,
    participating: 0,
    unreadNotifications: await Notification.countDocuments({ user: id, readAt: null }),
  });
});

test('dashboard: organising events, with stats for each', async () => {
  const world = await buildWorld();
  const res = await world.olive.agent.get('/api/dashboard').expect(200);
  const { organizing } = res.body;

  // Running events by their next deadline (one already passed comes first), then the recently
  // completed one; the one completed 40 days ago is gone
  assert.deepEqual(organizing.map((o) => o.event.name), ['Overdue Swap', 'Spring Swap', 'Draft Swap', 'Recent Swap']);
  const byName = Object.fromEntries(organizing.map((o) => [o.event.name, o]));

  const overdue = byName['Overdue Swap'];
  assert.deepEqual(Object.keys(overdue.event).sort(), ['bannerUrl', 'id', 'name', 'signupDeadline', 'status', 'submissionDeadline']);
  assert.equal(overdue.event.id, world.overdue._id.toString());
  assert.deepEqual(overdue.stats, { applications: 3, pending: 0, accepted: 3, matched: 3, submitted: 1, missing: 2, overdue: 2 });

  assert.deepEqual(byName['Spring Swap'].stats, {
    applications: 2,
    pending: 1,
    accepted: 1,
    matched: 0,
    submitted: 0,
    missing: 0,
    overdue: 0,
  });
  assert.equal(byName['Draft Swap'].event.status, 'draft');
  assert.equal(byName['Recent Swap'].event.status, 'completed');
  assert.ok(!organizing.some((o) => o.event.name.startsWith('Hana')));

  assert.equal(res.body.counts.organizing, 3);
  assert.equal(res.body.counts.participating, 1);
  assert.equal(res.body.counts.unreadNotifications, 1);
});

test('dashboard: unpublished matches count as matched but not as missing', async () => {
  const olive = await signUpAs('Olive Organiser');
  const [a, b] = await Promise.all([filler('A'), filler('B')]);
  const event = await makeEvent(olive.id, { name: 'Matching Swap', status: 'matching' });
  await apply(event._id, a._id);
  await apply(event._id, b._id);
  await match(event._id, a._id, b._id, false);
  await match(event._id, b._id, a._id, false);

  const res = await olive.agent.get('/api/dashboard').expect(200);
  assert.deepEqual(res.body.organizing[0].stats, {
    applications: 2,
    pending: 0,
    accepted: 2,
    matched: 2,
    submitted: 0,
    missing: 0,
    overdue: 0,
  });
});

test('dashboard: my assignments are published matches in active events', async () => {
  const world = await buildWorld();
  // A published match in a completed event isn't an assignment any more
  await Match.create({ event: world.recent._id, giver: world.olive.id, recipient: world.ben._id, published: true });

  const res = await world.olive.agent.get('/api/dashboard').expect(200);
  assert.equal(res.body.assignments.length, 1);
  const [assignment] = res.body.assignments;
  assert.equal(assignment.event.id, world.hosted._id.toString());
  assert.equal(assignment.event.name, 'Hana Winter Swap');
  assert.equal(assignment.recipientName, 'Ben');
  assert.equal(assignment.submitted, false);
  assert.equal(assignment.late, false);

  await submit(world.myMatch, { late: true });
  const done = await world.olive.agent.get('/api/dashboard').expect(200);
  assert.equal(done.body.assignments[0].submitted, true);
  assert.equal(done.body.assignments[0].late, true);

  // Not handed in and past the deadline counts as late too
  await Submission.deleteMany({ match: world.myMatch._id });
  await Event.updateOne({ _id: world.hosted._id }, { $set: { submissionDeadline: h.daysFromNow(-1), signupDeadline: h.daysFromNow(-4) } });
  const overdue = await world.olive.agent.get('/api/dashboard').expect(200);
  assert.equal(overdue.body.assignments[0].submitted, false);
  assert.equal(overdue.body.assignments[0].late, true);

  // Unpublished matches are never shown
  await Match.updateOne({ _id: world.myMatch._id }, { $set: { published: false } });
  const hidden = await world.olive.agent.get('/api/dashboard').expect(200);
  assert.deepEqual(hidden.body.assignments, []);

  // Hana runs that event but isn't making a gift in it, so she has no assignments
  const hana = await world.host.agent.get('/api/dashboard').expect(200);
  assert.deepEqual(hana.body.assignments, []);
});

test('dashboard: upcoming deadlines, soonest first', async () => {
  const world = await buildWorld();
  const res = await world.olive.agent.get('/api/dashboard').expect(200);
  const { upcoming } = res.body;

  assert.deepEqual(
    upcoming.map((u) => [u.eventName, u.kind]),
    [
      ['Hana Autumn Swap', 'signup'],
      ['Spring Swap', 'signup'],
      ['Hana Winter Swap', 'submission'],
    ]
  );
  assert.equal(upcoming[0].eventId, world.applied._id.toString());
  assert.equal(new Date(upcoming[2].at).getTime(), world.hosted.submissionDeadline.getTime());
  for (let i = 1; i < upcoming.length; i++) assert.ok(new Date(upcoming[i - 1].at) <= new Date(upcoming[i].at));
});

test('dashboard: at most 10 upcoming deadlines', async () => {
  const olive = await signUpAs('Olive Organiser');
  for (let i = 0; i < 12; i++) {
    await makeEvent(olive.id, { name: `Swap ${i}`, status: 'open', signupDays: 12 - i, submissionDays: 30 });
  }
  const res = await olive.agent.get('/api/dashboard').expect(200);
  assert.equal(res.body.upcoming.length, 10);
  assert.equal(res.body.upcoming[0].eventName, 'Swap 11');
  assert.equal(res.body.organizing.length, 12);
  assert.equal(res.body.counts.organizing, 12);
});

test("dashboard: the number of queries doesn't grow with the number of events", async () => {
  const olive = await signUpAs('Olive Organiser');
  const people = await Promise.all(['A', 'B', 'C'].map((n) => filler(n)));
  const addActiveEvent = async (i) => {
    const event = await makeEvent(olive.id, { name: `Active ${i}`, status: 'active' });
    for (const p of people) await apply(event._id, p._id);
    await match(event._id, people[0]._id, people[1]._id);
    await match(event._id, people[1]._id, people[2]._id);
    await match(event._id, people[2]._id, people[0]._id);
  };

  let queries = 0;
  const countQueries = async () => {
    queries = 0;
    mongoose.set('debug', () => {
      queries += 1;
    });
    try {
      await olive.agent.get('/api/dashboard').expect(200);
    } finally {
      mongoose.set('debug', false);
    }
    return queries;
  };

  await addActiveEvent(0);
  const few = await countQueries();
  for (let i = 1; i < 6; i++) await addActiveEvent(i);
  const many = await countQueries();
  assert.equal(many, few);
  assert.ok(many <= 12, `${many} queries`);
});
