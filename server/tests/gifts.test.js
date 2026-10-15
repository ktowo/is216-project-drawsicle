// Gift extras: image descriptions (alt text), content warnings and thank-you notes after the reveal.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');
const fx = require('./exchange-fixture.js');
const Match = require('../models/Match.js');
const Notification = require('../models/Notification.js');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);
before(() => fx.use(h.makeApp()));
after(fx.cleanUploads);

// A published exchange; returns the context plus the first giver and their match
async function activeExchange() {
  const ctx = await fx.setup({ count: 3 });
  await fx.publish(ctx);
  const match = await Match.findOne({ event: ctx.eventId, giver: ctx.people[0].id });
  const recipient = fx.byId(ctx, match.recipient.toString());
  return { ctx, giver: ctx.people[0], recipient, url: `/api/events/${ctx.eventId}/submission` };
}

test('image descriptions follow their pictures through reordering', async () => {
  const { giver, url } = await activeExchange();

  const first = await giver.agent
    .put(url)
    .field('imageDescriptions', JSON.stringify({ 'new:0': '  A fox in the snow  ', 'new:1': 'Close-up of the fox' }))
    .attach('images', ...fx.png('one.png'))
    .attach('images', ...fx.png('two.png'))
    .expect(201);
  const a = fx.remember(first.body.submission);
  assert.deepEqual(a.imageDescriptions, ['A fox in the snow', 'Close-up of the fox']);

  // Swap them without resending the descriptions: each keeps its own
  const swapped = await giver.agent
    .put(url)
    .send({ keepImages: a.images, imageOrder: [a.images[1], a.images[0]] })
    .expect(200);
  assert.deepEqual(swapped.body.submission.images, [a.images[1], a.images[0]]);
  assert.deepEqual(swapped.body.submission.imageDescriptions, ['Close-up of the fox', 'A fox in the snow']);

  // Change one description
  const edited = await giver.agent
    .put(url)
    .send({ imageDescriptions: { [a.images[0]]: 'A red fox in deep snow' } })
    .expect(200);
  assert.equal(edited.body.submission.imageDescriptions[1], 'A red fox in deep snow');
  assert.equal(edited.body.submission.imageDescriptions[0], 'Close-up of the fox');

  const tooLong = await giver.agent.put(url).send({ imageDescriptions: { [a.images[0]]: 'x'.repeat(301) } }).expect(400);
  assert.equal(tooLong.body.code, 'VALIDATION');
});

test('content warnings are kept and checked', async () => {
  const { giver, url } = await activeExchange();
  await giver.agent.put(url).send({ links: [{ url: 'https://example.com/story' }], contentWarnings: ['blood', 'blood'] }).expect(201);
  const saved = await giver.agent.get(url).expect(200);
  assert.deepEqual(saved.body.submission.contentWarnings, ['blood']);

  // Leaving them out keeps them; an unknown one is refused
  const kept = await giver.agent.put(url).send({ title: 'Story' }).expect(200);
  assert.deepEqual(kept.body.submission.contentWarnings, ['blood']);
  const bad = await giver.agent.put(url).send({ contentWarnings: ['spiders'] }).expect(400);
  assert.equal(bad.body.code, 'VALIDATION');
});

test('recipients can thank their giver once the gifts are revealed', async () => {
  const { ctx, giver, recipient, url } = await activeExchange();
  await giver.agent.put(url).send({ links: [{ url: 'https://example.com/gift' }] }).expect(201);
  const thanksUrl = `/api/events/${ctx.eventId}/thanks`;

  // Not before the reveal
  const early = await recipient.agent.put(thanksUrl).send({ reaction: 'heart' }).expect(409);
  assert.equal(early.body.code, 'NOT_COMPLETED');

  await fx.forceStatus(ctx.eventId, 'completed', { completedAt: new Date() });

  // Only the person the gift was for has something to thank
  const someoneElse = ctx.people.find((p) => p.id !== recipient.id && p.id !== giver.id) || ctx.organizer;
  const notMine = await someoneElse.agent.put(thanksUrl).send({ reaction: 'heart' }).expect(404);
  assert.equal(notMine.body.code, 'NOT_FOUND');

  await recipient.agent.put(thanksUrl).send({}).expect(400);
  await recipient.agent.put(thanksUrl).send({ reaction: 'thumbs' }).expect(400);

  const saved = await recipient.agent.put(thanksUrl).send({ reaction: 'teary', message: 'I love it so much!' }).expect(200);
  assert.equal(saved.body.submission.thanks.reaction, 'teary');
  assert.equal(saved.body.submission.thanks.message, 'I love it so much!');

  // The giver hears about it once, and everyone in the event sees it in the results
  await recipient.agent.put(thanksUrl).send({ reaction: 'heart', message: 'Still love it' }).expect(200);
  assert.equal(await Notification.countDocuments({ user: giver.id, type: 'gift_thanked' }), 1);
  const results = await giver.agent.get(`/api/events/${ctx.eventId}/results`).expect(200);
  assert.equal(results.body.given.submission.thanks.message, 'Still love it');

  const removed = await recipient.agent.delete(thanksUrl).expect(200);
  assert.equal(removed.body.submission.thanks, null);
});
