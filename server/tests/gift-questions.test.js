// Secret artists asking the person they're making a gift for, who answers without learning who asked.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');
const fx = require('./exchange-fixture.js');
const Match = require('../models/Match.js');
const Notification = require('../models/Notification.js');
const { GIFT_QUESTIONS } = require('../../shared/gift-questions.mjs');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);
let app;
before(() => {
  app = fx.use(h.makeApp());
});

// An exchange with its matches out: who makes whose gift
async function underway() {
  const ctx = await fx.setup({ count: 3 });
  await fx.publish(ctx);
  const pairs = await fx.pairsOf(ctx.eventId);
  const giver = ctx.people[0];
  const recipient = fx.byId(ctx, pairs.get(giver.id));
  const base = `/api/events/${ctx.eventId}`;
  return { ctx, giver, recipient, base };
}

test('ask, answer, and the asker stays secret', async () => {
  const { giver, recipient, base } = await underway();

  await giver.agent.post(`${base}/my-match/questions`).send({ text: 'Hi' }).expect(400);
  const asked = await giver.agent.post(`${base}/my-match/questions`).send({ text: '  Warm or cool colours?  ' }).expect(201);
  assert.equal(asked.body.question.text, 'Warm or cool colours?');
  assert.equal(asked.body.question.answer, '');

  // The recipient hears about it, without being told who asked
  const note = await Notification.findOne({ user: recipient.id, type: 'gift_question' });
  assert.match(note.message, /Warm or cool colours/);
  assert.doesNotMatch(`${note.title} ${note.message}`, new RegExp(giver.name));

  const mine = await recipient.agent.get(`${base}/questions-for-me`).expect(200);
  assert.equal(mine.body.canAnswer, true);
  assert.equal(mine.body.questions.length, 1);
  const [q] = mine.body.questions;
  assert.deepEqual(Object.keys(q).sort(), ['answer', 'answeredAt', 'askedAt', 'id', 'text']);

  // Only the recipient can answer it
  await giver.agent.post(`${base}/questions-for-me/${q.id}/answer`).send({ answer: 'Warm!' }).expect(404);
  await recipient.agent.post(`${base}/questions-for-me/${q.id}/answer`).send({ answer: ' ' }).expect(400);
  const answered = await recipient.agent.post(`${base}/questions-for-me/${q.id}/answer`).send({ answer: 'Warm, please! Oranges and pinks.' }).expect(200);
  assert.equal(answered.body.question.answer, 'Warm, please! Oranges and pinks.');
  assert.equal(await Notification.countDocuments({ user: giver.id, type: 'gift_answer' }), 1);
  // Changing an answer doesn't notify again
  await recipient.agent.post(`${base}/questions-for-me/${q.id}/answer`).send({ answer: 'Warm. Oranges!' }).expect(200);
  assert.equal(await Notification.countDocuments({ user: giver.id, type: 'gift_answer' }), 1);

  const { body } = await giver.agent.get(`${base}/my-match`).expect(200);
  assert.deepEqual(body.match.questions.map((x) => [x.text, x.answer]), [['Warm or cool colours?', 'Warm. Oranges!']]);
});

test('a few questions at a time, only while gifts are being made', async () => {
  const { ctx, giver, recipient, base } = await underway();
  const ask = (text) => giver.agent.post(`${base}/my-match/questions`).send({ text });

  for (let i = 0; i < GIFT_QUESTIONS.waiting; i++) await ask(`Question number ${i + 1}?`).expect(201);
  const waiting = await ask('One more?').expect(409);
  assert.equal(waiting.body.code, 'TOO_MANY_QUESTIONS');

  // Answering one makes room for another
  const [first] = (await recipient.agent.get(`${base}/questions-for-me`).expect(200)).body.questions;
  await recipient.agent.post(`${base}/questions-for-me/${first.id}/answer`).send({ answer: 'Yes' }).expect(200);
  await ask('One more?').expect(201);

  // Never more than perMatch in all
  const match = await Match.findOne({ event: ctx.eventId, giver: giver.id });
  for (const q of match.questions) q.answer = 'ok';
  while (match.questions.length < GIFT_QUESTIONS.perMatch) match.questions.push({ text: 'Filler?', askedBy: giver.id, answer: 'ok' });
  await match.save();
  await ask('Too many?').expect(409);

  // Other people can't see the questions; after the event they're read-only
  await ctx.people.find((p) => p.id !== recipient.id && p.id !== giver.id).agent.get(`${base}/questions-for-me`).expect(200);
  await fx.forceStatus(ctx.eventId, 'completed');
  const after = await recipient.agent.get(`${base}/questions-for-me`).expect(200);
  assert.equal(after.body.canAnswer, false);
  assert.equal(after.body.questions.length, GIFT_QUESTIONS.perMatch);
  await recipient.agent.post(`${base}/questions-for-me/${first.id}/answer`).send({ answer: 'Late' }).expect(409);
});
