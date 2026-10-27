// Organiser ratings: artists rate the organiser once the gifts are revealed, and the average
// shows on the organiser's profile and on the event.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const h = require('./helpers.js');
const fx = require('./exchange-fixture.js');
const Notification = require('../models/Notification.js');
const Rating = require('../models/Rating.js');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);
before(() => fx.use(h.makeApp()));

const ratingUrl = (ctx) => `/api/events/${ctx.eventId}/rating`;

// A finished exchange with an organiser and three artists
async function finishedExchange() {
  const ctx = await fx.setup({ count: 3, status: 'completed' });
  await fx.forceStatus(ctx.eventId, 'completed', { completedAt: new Date() });
  return ctx;
}

test('artists can rate the organiser once the gifts are revealed', async () => {
  const ctx = await fx.setup({ count: 3, status: 'open' });
  const [ada] = ctx.people;

  // Not before the exchange is finished
  const early = await ada.agent.put(ratingUrl(ctx)).send({ stars: 5 }).expect(409);
  assert.equal(early.body.code, 'NOT_COMPLETED');

  await fx.forceStatus(ctx.eventId, 'completed', { completedAt: new Date() });
  const saved = await ada.agent.put(ratingUrl(ctx)).send({ stars: 4, comment: '  Clear updates, kind host  ' }).expect(200);
  assert.equal(saved.body.rating.stars, 4);
  assert.equal(saved.body.rating.comment, 'Clear updates, kind host');
  assert.deepEqual(saved.body.summary, { average: 4, count: 1 });
});

test('only people who took part can rate, and never themselves', async () => {
  const ctx = await finishedExchange();
  const outsider = await fx.signUpAs('Nora Nobody');

  const notIn = await outsider.agent.put(ratingUrl(ctx)).send({ stars: 5 }).expect(403);
  assert.equal(notIn.body.code, 'FORBIDDEN');
  const self = await ctx.organizer.agent.put(ratingUrl(ctx)).send({ stars: 5 }).expect(403);
  assert.equal(self.body.code, 'FORBIDDEN');

  // Logged-out visitors are turned away too
  await request(h.makeApp()).put(ratingUrl(ctx)).send({ stars: 5 }).expect(401);
  assert.equal(await Rating.countDocuments(), 0);
});

test('stars must be a whole number from 1 to 5, and comments have a length limit', async () => {
  const ctx = await finishedExchange();
  const [ada] = ctx.people;

  for (const stars of [0, 6, 2.5, 'lots', null, undefined]) {
    const res = await ada.agent.put(ratingUrl(ctx)).send({ stars }).expect(400);
    assert.equal(res.body.code, 'VALIDATION');
  }
  await ada.agent.put(ratingUrl(ctx)).send({ stars: 5, comment: 'x'.repeat(501) }).expect(400);
  await ada.agent.put(ratingUrl(ctx)).send({ stars: '3' }).expect(200); // "3" is fine: it is a whole number
});

test('rating again changes your rating instead of adding another', async () => {
  const ctx = await finishedExchange();
  const [ada, ben, cleo] = ctx.people;

  await ada.agent.put(ratingUrl(ctx)).send({ stars: 2 }).expect(200);
  await ada.agent.put(ratingUrl(ctx)).send({ stars: 5, comment: 'Changed my mind' }).expect(200);
  await ben.agent.put(ratingUrl(ctx)).send({ stars: 4 }).expect(200);
  const last = await cleo.agent.put(ratingUrl(ctx)).send({ stars: 4 }).expect(200);

  assert.equal(await Rating.countDocuments(), 3);
  // (5 + 4 + 4) / 3 = 4.33, shown to one decimal
  assert.deepEqual(last.body.summary, { average: 4.3, count: 3 });

  // The organiser got one notification per artist, not per change
  assert.equal(await Notification.countDocuments({ user: ctx.organizer.id, type: 'organiser_rated' }), 3);
});

test('you can read and take back your own rating', async () => {
  const ctx = await finishedExchange();
  const [ada, ben] = ctx.people;

  const before = await ada.agent.get(ratingUrl(ctx)).expect(200);
  assert.equal(before.body.canRate, true);
  assert.equal(before.body.rating, null);
  assert.deepEqual(before.body.summary, { average: null, count: 0 });
  assert.equal(before.body.organiser.displayName, 'Olive Organiser');

  await ada.agent.put(ratingUrl(ctx)).send({ stars: 3 }).expect(200);
  await ben.agent.put(ratingUrl(ctx)).send({ stars: 5 }).expect(200);
  const mine = await ada.agent.get(ratingUrl(ctx)).expect(200);
  assert.equal(mine.body.rating.stars, 3);

  const removed = await ada.agent.delete(ratingUrl(ctx)).expect(200);
  assert.equal(removed.body.rating, null);
  assert.deepEqual(removed.body.summary, { average: 5, count: 1 });

  // Visitors can see the score but cannot rate
  const visitor = await request(h.makeApp()).get(ratingUrl(ctx)).expect(200);
  assert.equal(visitor.body.canRate, false);
  assert.equal(visitor.body.rating, null);
  assert.equal(visitor.body.summary.count, 1);
});

test('the average and anonymous comments show on the organiser profile', async () => {
  const ctx = await finishedExchange();
  const [ada, ben] = ctx.people;
  await ada.agent.put(ratingUrl(ctx)).send({ stars: 5, comment: 'Wonderful host' }).expect(200);
  await ben.agent.put(ratingUrl(ctx)).send({ stars: 4 }).expect(200);

  const profile = await request(h.makeApp()).get(`/api/users/${ctx.organizer.user.username}`).expect(200);
  const { average, count, recent } = profile.body.organiserRating;
  assert.equal(average, 4.5);
  assert.equal(count, 2);

  // Only written comments are listed, and they never say who wrote them
  assert.equal(recent.length, 1);
  assert.equal(recent[0].comment, 'Wonderful host');
  assert.equal(recent[0].stars, 5);
  assert.equal(recent[0].eventName, 'Winter Swap');
  assert.ok(!('rater' in recent[0]) && !('user' in recent[0]));

  // Someone nobody has rated yet
  const quiet = await request(h.makeApp()).get(`/api/users/${ada.user.username}`).expect(200);
  assert.deepEqual(quiet.body.organiserRating, { average: null, count: 0, recent: [] });
});
