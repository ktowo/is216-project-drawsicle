// Personal block lists and the organisers' matching rules.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');
const fx = require('./exchange-fixture.js');
const Event = require('../models/Event.js');
const EventMember = require('../models/EventMember.js');
const Match = require('../models/Match.js');
const { scorePair } = require('../../shared/matching.mjs');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);
before(() => fx.use(h.makeApp()));

const person = (id, extra = {}) => ({ id, canCreate: ['art'], wantsTypes: ['art'], characters: [], ...extra });

test('the matching rules: blocks are hard, repeats are just discouraged', () => {
  const fresh = scorePair(person('a'), person('b'));
  assert.equal(fresh.ok, true);

  const blocked = scorePair(person('a', { blockedIds: ['b'] }), person('b'));
  assert.equal(blocked.ok, false);
  assert.equal(scorePair(person('a'), person('b', { blockedIds: ['a'] })).ok, false, 'blocks work both ways');

  const repeat = scorePair(person('a', { previousRecipients: ['b'] }), person('b'));
  assert.equal(repeat.ok, true);
  assert.ok(repeat.score < fresh.score);
  assert.ok(repeat.reasons.some((r) => /earlier exchange/.test(r)));
});

test('people manage a private list of who they will not be matched with', async () => {
  const ctx = await fx.setup({ count: 3 });
  const [ada, ben] = ctx.people;
  const benProfile = await ben.agent.get('/api/auth/me').expect(200);
  const benName = benProfile.body.user.username;

  await ada.agent.post('/api/profile/blocks').send({ username: 'nobody_here' }).expect(404);
  await ada.agent.post('/api/profile/blocks').send({ userId: ada.id }).expect(400);
  const added = await ada.agent.post('/api/profile/blocks').send({ username: `@${benName}` }).expect(200);
  assert.deepEqual(added.body.blocks.map((b) => b.id), [ben.id]);

  // Ben's public profile tells Ada (and only Ada) that he's on her list
  const seen = await ada.agent.get(`/api/users/${benName}`).expect(200);
  assert.equal(seen.body.viewer.blocked, true);
  const anon = await h.request(fx.use(h.makeApp())).get(`/api/users/${benName}`).expect(200);
  assert.equal(anon.body.viewer, undefined);

  // Matching never pairs them, in either direction
  for (const seed of [1, 2, 3, 4, 5]) {
    await fx.generate(ctx, seed);
    const pairs = await fx.pairsOf(ctx.eventId);
    assert.notEqual(pairs.get(ada.id), ben.id);
    assert.notEqual(pairs.get(ben.id), ada.id);
  }

  const removed = await ada.agent.delete(`/api/profile/blocks/${ben.id}`).expect(200);
  assert.deepEqual(removed.body.blocks, []);
});

test('a swap can never put two people together if one of them blocked the other', async () => {
  const ctx = await fx.setup({ count: 4 });
  await fx.generate(ctx, 3);
  const matches = await Match.find({ event: ctx.eventId });
  // Pick two matches and have one giver block the recipient the swap would give them
  const [m1, m2] = matches;
  const giver = fx.byId(ctx, m1.giver.toString());
  await giver.agent.post('/api/profile/blocks').send({ userId: m2.recipient.toString() }).expect(200);
  const res = await ctx.organizer.agent
    .post(`/api/events/${ctx.eventId}/matches/swap`)
    .send({ matchIdA: m1.id, matchIdB: m2.id })
    .expect(409);
  assert.equal(res.body.code, 'BLOCKED_PAIR');
  assert.doesNotMatch(res.body.error, new RegExp(giver.name));
});

test('organisers keep pairs apart and avoid last time\'s pairings', async () => {
  const ctx = await fx.setup({ count: 3 });
  const [ada, ben, cleo] = ctx.people;
  const url = `/api/events/${ctx.eventId}/matching-rules`;

  await ada.agent.put(url).send({ avoidPairs: [] }).expect(403);
  await ctx.organizer.agent.put(url).send({ avoidPairs: [{ a: ada.id, b: ada.id }] }).expect(400);
  await ctx.organizer.agent.put(url).send({ avoidPairs: [{ a: ada.id, b: ctx.organizer.id }] }).expect(400);
  const saved = await ctx.organizer.agent.put(url).send({ avoidPairs: [{ a: ada.id, b: ben.id }], avoidRepeats: true }).expect(200);
  assert.deepEqual(saved.body.event.matchingRules.avoidPairs, [{ a: ada.id, b: ben.id }]);

  // With three people in one loop and Ada/Ben kept apart, no valid loop exists
  const res = await ctx.organizer.agent.post(`/api/events/${ctx.eventId}/matches/generate`).send({ seed: 1 }).expect(200);
  const pairs = await fx.pairsOf(ctx.eventId);
  assert.notEqual(pairs.get(ada.id), ben.id);
  assert.notEqual(pairs.get(ben.id), ada.id);
  assert.ok(res.body.result.unmatched.length > 0 || pairs.size < 3);

  // Repeats: same organiser, an earlier exchange where Ada made a gift for Cleo
  await ctx.organizer.agent.put(url).send({ avoidPairs: [] }).expect(200);
  const earlier = await Event.create({
    name: 'Last Year',
    signupDeadline: h.daysFromNow(-300),
    submissionDeadline: h.daysFromNow(-280),
    status: 'completed',
    createdBy: ctx.organizer.id,
  });
  await EventMember.grant(ctx.organizer.id, earlier._id, 'organizer');
  await Match.create({ event: earlier._id, giver: ada.id, recipient: cleo.id, published: true });
  const again = await ctx.organizer.agent.post(`/api/events/${ctx.eventId}/matches/generate`).send({ seed: 1 }).expect(200);
  const adaMatch = again.body.matches.find((m) => m.giver.id === ada.id);
  if (adaMatch.recipient.id === cleo.id) {
    assert.ok(adaMatch.reasons.some((r) => /earlier exchange/.test(r)), 'a repeat is flagged when it cannot be avoided');
  }
});
