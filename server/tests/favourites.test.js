// Saved art: saving gifts you can see, and only ever seeing ones you still may.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');
const fx = require('./exchange-fixture.js');
const Event = require('../models/Event.js');
const Favourite = require('../models/Favourite.js');
const Match = require('../models/Match.js');
const Submission = require('../models/Submission.js');
const User = require('../models/User.js');
const { anonymiseUser } = require('../services/accounts.js');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);
let app;
before(() => {
  app = fx.use(h.makeApp());
});

// A finished exchange where everyone made a gift
async function finishedExchange() {
  const ctx = await fx.setup({ count: 3 });
  await fx.publish(ctx);
  const subs = [];
  for (const m of await Match.find({ event: ctx.eventId })) {
    subs.push(
      await Submission.create({
        event: ctx.eventId,
        match: m._id,
        giver: m.giver,
        recipient: m.recipient,
        title: `Gift from ${fx.byId(ctx, m.giver.toString()).name}`,
        links: [{ url: 'https://example.com/gift' }],
      })
    );
  }
  await fx.forceStatus(ctx.eventId, 'completed', { completedAt: new Date() });
  return { ctx, subs };
}

test('members save gifts from their exchange; outsiders only ones in the public museum', async () => {
  const { ctx, subs } = await finishedExchange();
  const [ada] = ctx.people;
  const outsider = await h.signUp(app, { displayName: 'Out Sider' });
  const [gift] = subs;

  await h.request(app).put(`/api/favourites/${gift.id}`).expect(401);
  await ada.agent.put(`/api/favourites/${gift.id}`).expect(200);
  await ada.agent.put(`/api/favourites/${gift.id}`).expect(200); // saving twice is fine
  const mine = await ada.agent.get('/api/favourites').expect(200);
  assert.deepEqual(mine.body.ids, [gift.id]);
  assert.equal(mine.body.items[0].submission.title, gift.title);
  assert.equal(mine.body.items[0].event.name, 'Winter Swap');
  assert.equal(mine.body.items[0].submission.message, undefined); // never the private note

  // Not in the museum yet, so not for outsiders
  await outsider.agent.put(`/api/favourites/${gift.id}`).expect(404);
  await User.updateMany({ _id: { $in: [gift.giver, gift.recipient] } }, { $set: { 'profilePrivacy.showGifts': true } });
  await outsider.agent.put(`/api/favourites/${gift.id}`).expect(200);
  assert.equal((await outsider.agent.get('/api/favourites').expect(200)).body.items.length, 1);

  // If it comes down from the museum, it quietly drops out of their list (but not Ada's)
  await User.updateOne({ _id: gift.giver }, { $set: { 'profilePrivacy.showGifts': false } });
  assert.deepEqual((await outsider.agent.get('/api/favourites').expect(200)).body.items, []);
  assert.equal((await ada.agent.get('/api/favourites').expect(200)).body.items.length, 1);
  // Nor does a disabled event show
  await Event.updateOne({ _id: ctx.eventId }, { disabledAt: new Date() });
  assert.deepEqual((await ada.agent.get('/api/favourites').expect(200)).body.items, []);

  await ada.agent.delete(`/api/favourites/${gift.id}`).expect(200);
  assert.equal(await Favourite.countDocuments({ user: ada.id }), 0);
  await ada.agent.put('/api/favourites/not-an-id').expect(404);
});

test('gifts from unfinished exchanges cannot be saved, and deleting an account clears its list', async () => {
  const { ctx, subs } = await finishedExchange();
  const [ada] = ctx.people;
  await ada.agent.put(`/api/favourites/${subs[1].id}`).expect(200);
  await fx.forceStatus(ctx.eventId, 'active');
  await ada.agent.put(`/api/favourites/${subs[2].id}`).expect(404);

  await anonymiseUser(ada.id);
  assert.equal(await Favourite.countDocuments({ user: ada.id }), 0);
});
