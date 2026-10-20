// Matching at random, and events that match themselves once sign-ups close.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');
const fx = require('./exchange-fixture.js');
const Event = require('../models/Event.js');
const Match = require('../models/Match.js');
const Notification = require('../models/Notification.js');
const { runReminders } = require('../services/reminders.js');
const { RANDOM_REASON } = require('../../shared/matching.mjs');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);
let app;
before(() => {
  app = fx.use(h.makeApp());
});

// An open exchange whose sign-ups closed yesterday, set to match itself
const closedYesterday = (autoMatch = {}, count = 4) =>
  fx.setup({ count, status: 'open', event: { signupDeadline: h.daysFromNow(-1), autoMatch: { enabled: true, ...autoMatch } } });

test('organisers can draw matches at random, still within the hard rules', async () => {
  const ctx = await fx.setup({ count: 5 });
  const url = `/api/events/${ctx.eventId}/matches/generate`;
  await ctx.organizer.agent.post(url).send({ mode: 'lottery' }).expect(400);

  const { body } = await ctx.organizer.agent.post(url).send({ mode: 'random', seed: 3 }).expect(200);
  assert.equal(body.result.stats.mode, 'random');
  assert.equal(body.matches.length, 5);
  for (const m of body.matches) {
    assert.notEqual(m.giver.id, m.recipient.id);
    assert.equal(m.reasons[0], RANDOM_REASON);
  }
  // Everyone gives once and receives once
  assert.equal(new Set(body.matches.map((m) => m.giver.id)).size, 5);
  assert.equal(new Set(body.matches.map((m) => m.recipient.id)).size, 5);

  // Different seeds give different draws
  const draws = new Set();
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const again = await ctx.organizer.agent.post(url).send({ mode: 'random', seed }).expect(200);
    draws.add(again.body.matches.map((m) => `${m.giver.id}>${m.recipient.id}`).sort().join());
  }
  assert.ok(draws.size > 1);
});

test('only organisers change automatic matching, and only before matches are out', async () => {
  const ctx = await fx.setup({ count: 3, status: 'open' });
  const url = `/api/events/${ctx.eventId}/auto-match`;
  await ctx.people[0].agent.put(url).send({ enabled: true }).expect(403);
  await ctx.organizer.agent.put(url).send({ enabled: 'yes' }).expect(400);
  await ctx.organizer.agent.put(url).send({ mode: 'lottery' }).expect(400);
  const { body } = await ctx.organizer.agent.put(url).send({ enabled: true, mode: 'random', publish: false }).expect(200);
  assert.deepEqual(body.event.autoMatch, { enabled: true, mode: 'random', publish: false, lastRun: null });

  await fx.forceStatus(ctx.eventId, 'active');
  await ctx.organizer.agent.put(url).send({ enabled: false }).expect(409);
});

test('once sign-ups close, the event matches itself and tells everyone', async () => {
  const ctx = await closedYesterday({ mode: 'best', publish: true });
  const summary = await runReminders(new Date());
  assert.equal(summary.autoClosed, 1);
  assert.equal(summary.autoMatched, 1);

  const event = await Event.findById(ctx.eventId);
  assert.equal(event.status, 'active');
  assert.equal(event.autoMatch.lastRun.outcome, 'published');
  assert.equal(await Match.countDocuments({ event: ctx.eventId, published: true }), 4);
  assert.equal(await Notification.countDocuments({ type: 'match_assigned' }), 4);
  const told = await Notification.findOne({ user: ctx.organizer.id, title: /matched itself/ });
  assert.ok(told, 'the organiser hears it happened');

  // Only once
  assert.equal((await runReminders(new Date())).autoMatched, 0);
});

test('it can leave the matches for the organisers to check first', async () => {
  const ctx = await closedYesterday({ mode: 'random', publish: false });
  await runReminders(new Date());
  const event = await Event.findById(ctx.eventId);
  assert.equal(event.status, 'matching');
  assert.equal(event.autoMatch.lastRun.outcome, 'drafted');
  const drafts = await Match.find({ event: ctx.eventId, published: false });
  assert.equal(drafts.length, 4);
  assert.ok(drafts.every((m) => m.reasons[0] === RANDOM_REASON));
  assert.ok(await Notification.exists({ user: ctx.organizer.id, title: /ready to check/ }));
  // Nobody has been told about a match yet
  assert.equal(await Notification.countDocuments({ type: 'match_assigned' }), 0);
});

test('when it cannot match, it says why; organisers can run it again by hand', async () => {
  const ctx = await closedYesterday({ publish: true }, 1);
  await Event.updateOne({ _id: ctx.eventId }, { minParticipants: 2 });
  await runReminders(new Date());
  let event = await Event.findById(ctx.eventId);
  assert.equal(event.autoMatch.lastRun.outcome, 'failed');
  assert.match(event.autoMatch.lastRun.message, /at least 2 accepted participants/);
  assert.ok(await Notification.exists({ user: ctx.organizer.id, title: /needs you/ }));

  // More people join; the organiser runs it now instead of waiting
  await fx.addParticipant(event, 'Bo Artist');
  await fx.addParticipant(event, 'Cy Artist');
  const run = await ctx.organizer.agent.post(`/api/events/${ctx.eventId}/auto-match/run`).expect(200);
  assert.equal(run.body.run.outcome, 'published');
  assert.equal(run.body.event.status, 'active');
  event = await Event.findById(ctx.eventId);
  assert.equal(event.autoMatch.lastRun.outcome, 'published');
});

test('when art styles count, it checks them before matching', async () => {
  const ctx = await closedYesterday({ publish: true });
  await Event.updateOne({ _id: ctx.eventId }, { 'matchingRules.style': 'similar' });
  await runReminders(new Date());
  const event = await Event.findById(ctx.eventId);
  assert.equal(event.styleScan.status, 'done');
  assert.equal(event.styleScan.done, 4);
  assert.match(event.autoMatch.lastRun.message, /Art styles were checked for 4 of 4 people/);
  assert.equal(event.status, 'active');
});

test('organisers can turn it on while creating or editing the event', async () => {
  const { agent } = await h.signUp(app, { displayName: 'Olive' });
  const body = {
    name: 'Self-matching Swap',
    signupDeadline: h.daysFromNow(5),
    submissionDeadline: h.daysFromNow(30),
    autoMatch: { enabled: true, mode: 'random', publish: false },
  };
  await agent.post('/api/events').send({ ...body, autoMatch: { mode: 'lottery' } }).expect(400);
  const created = await agent.post('/api/events').send(body).expect(201);
  assert.deepEqual(created.body.event.autoMatch, { enabled: true, mode: 'random', publish: false, lastRun: null });
  const edited = await agent.patch(`/api/events/${created.body.event.id}`).send({ autoMatch: { publish: true } }).expect(200);
  assert.equal(edited.body.event.autoMatch.publish, true);
  assert.equal(edited.body.event.autoMatch.mode, 'random');
});

test("organisers see each participant's art style, but not their pictures", async () => {
  const ctx = await fx.setup({ count: 3 });
  const url = `/api/events/${ctx.eventId}/matches/style-profiles`;
  await ctx.people[0].agent.get(url).expect(403);
  const before = await ctx.organizer.agent.get(url).expect(200);
  assert.equal(before.body.people.length, 3);
  assert.ok(before.body.people.every((p) => p.style === null && p.preference === 'any'));

  // After a scan (nobody has pictures yet, so there is nothing to describe)
  await ctx.organizer.agent.post(`/api/events/${ctx.eventId}/matches/style-scan`).send({}).expect(202);
  const after = await ctx.organizer.agent.get(url).expect(200);
  assert.equal(after.body.people.length, 3);
  assert.ok(after.body.people.every((p) => !('styleSamples' in p.user)));
});
