// The public museum: wings for finished public exchanges, hung only with gifts both people agreed to show.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');
const fx = require('./exchange-fixture.js');
const Event = require('../models/Event.js');
const Match = require('../models/Match.js');
const Submission = require('../models/Submission.js');
const User = require('../models/User.js');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);
let app;
before(() => {
  app = fx.use(h.makeApp());
});

const showGifts = (ids, value = true) =>
  User.updateMany({ _id: { $in: ids } }, { $set: { 'profilePrivacy.showGifts': value } });

// A finished exchange where everyone made a gift
async function finishedExchange() {
  const ctx = await fx.setup({ count: 3 });
  await fx.publish(ctx);
  const matches = await Match.find({ event: ctx.eventId });
  for (const m of matches) {
    await Submission.create({
      event: ctx.eventId,
      match: m._id,
      giver: m.giver,
      recipient: m.recipient,
      title: `Gift from ${fx.byId(ctx, m.giver.toString()).name}`,
      message: 'A private note just for you',
      links: [{ url: 'https://example.com/gift' }],
    });
  }
  await fx.forceStatus(ctx.eventId, 'completed', { completedAt: new Date() });
  return { ctx, matches };
}

test('wings open only for finished public exchanges, with the gifts both people agreed to show', async () => {
  const { ctx, matches } = await finishedExchange();
  // Nobody has said yes yet
  assert.deepEqual((await h.request(app).get('/api/museum').expect(200)).body.wings, []);
  await h.request(app).get(`/api/museum/${ctx.eventId}`).expect(404);

  // Everyone but the first match's recipient shares their gifts
  const holdout = matches[0].recipient.toString();
  await showGifts(ctx.people.map((p) => p.id).filter((id) => id !== holdout));

  const lobby = await h.request(app).get('/api/museum').expect(200);
  assert.equal(lobby.body.wings.length, 1);
  assert.equal(lobby.body.wings[0].event.name, 'Winter Swap');
  // Two of the three gifts involve the holdout (one made for them, one made by them)
  assert.equal(lobby.body.wings[0].count, 1);

  const wing = await h.request(app).get(`/api/museum/${ctx.eventId}`).expect(200);
  assert.equal(wing.body.artworks.length, 1);
  const [art] = wing.body.artworks;
  assert.notEqual(art.giver.id, holdout);
  assert.notEqual(art.recipient.id, holdout);
  assert.equal(art.submission.message, undefined); // the note to the recipient stays private
  assert.equal(art.event.name, 'Winter Swap');
});

test('private, unfinished and unknown exchanges have no wing', async () => {
  const { ctx } = await finishedExchange();
  await showGifts(ctx.people.map((p) => p.id));
  await h.request(app).get(`/api/museum/${ctx.eventId}`).expect(200);

  await Event.updateOne({ _id: ctx.eventId }, { $set: { publicity: 'private' } });
  await h.request(app).get(`/api/museum/${ctx.eventId}`).expect(404);
  assert.deepEqual((await h.request(app).get('/api/museum').expect(200)).body.wings, []);

  await Event.updateOne({ _id: ctx.eventId }, { $set: { publicity: 'public', status: 'active' } });
  await h.request(app).get(`/api/museum/${ctx.eventId}`).expect(404);
  await h.request(app).get('/api/museum/not-an-id').expect(404);
  await h.request(app).get('/api/museum/0123456789abcdef01234567').expect(404);
});
