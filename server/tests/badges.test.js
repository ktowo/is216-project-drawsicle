// Profile badges: the rules in shared/badges.mjs, and what a public profile shows.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');
const fx = require('./exchange-fixture.js');
const Match = require('../models/Match.js');
const Submission = require('../models/Submission.js');
const User = require('../models/User.js');
const { earnedBadges } = require('../../shared/badges.mjs');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);
let app;
before(() => {
  app = fx.use(h.makeApp());
});

const keys = (input) => earnedBadges(input).map((b) => b.key);
const gift = (event, extra = {}) => ({ event, late: false, type: 'art', thanked: false, asBackup: false, ...extra });

test('badge rules only ever celebrate, and tiers replace each other', () => {
  assert.deepEqual(keys({}), []);
  assert.deepEqual(keys({ gifts: null, eventsRun: 0 }), []);
  assert.deepEqual(keys({ gifts: [gift('a')] }), ['first_exchange']);
  // Three on time, one of them for a second kind of gift
  assert.deepEqual(keys({ gifts: [gift('a'), gift('b'), gift('c', { type: 'writing' })] }), [
    'first_exchange',
    'on_time',
    'versatile',
  ]);
  // One late gift just means no on-time badge, nothing else
  assert.deepEqual(keys({ gifts: [gift('a'), gift('b'), gift('c', { late: true })] }), ['first_exchange']);
  const five = ['a', 'b', 'c', 'd', 'e'].map((e) => gift(e, { thanked: true }));
  assert.deepEqual(keys({ gifts: five }), ['exchanges_5', 'on_time', 'much_loved']);
  const ten = Array.from({ length: 10 }, (_, i) => gift(`e${i}`, { asBackup: i === 0 }));
  assert.deepEqual(keys({ gifts: ten }), ['exchanges_10', 'on_time', 'backup_hero']);
  assert.deepEqual(keys({ eventsRun: 1 }), ['organiser']);
  assert.deepEqual(keys({ eventsRun: 4 }), ['community_pillar']);
});

test('profiles show badges from finished public exchanges, unless exchanges are hidden', async () => {
  const ctx = await fx.setup({ count: 2 });
  await fx.publish(ctx);
  const [ada] = ctx.people;
  const match = await Match.findOne({ event: ctx.eventId, giver: ada.id });
  await Submission.create({
    event: ctx.eventId,
    match: match._id,
    giver: ada.id,
    recipient: match.recipient,
    links: [{ url: 'https://example.com/gift' }],
  });

  // Not finished yet: nothing to show, so nothing gives the match away
  const during = await h.request(app).get(`/api/users/${ada.id}`).expect(200);
  assert.deepEqual(during.body.badges, []);

  await fx.forceStatus(ctx.eventId, 'completed', { completedAt: new Date() });
  const finished = await h.request(app).get(`/api/users/${ada.id}`).expect(200);
  assert.deepEqual(finished.body.badges.map((b) => b.key), ['first_exchange']);
  const organiser = await h.request(app).get(`/api/users/${ctx.organizer.id}`).expect(200);
  assert.deepEqual(organiser.body.badges.map((b) => b.key), ['organiser']);

  await User.updateOne({ _id: ada.id }, { $set: { 'profilePrivacy.showExchanges': false } });
  const hidden = await h.request(app).get(`/api/users/${ada.id}`).expect(200);
  assert.deepEqual(hidden.body.badges, []);
});
