// Art style matching: colour analysis, the optional Ollama vision model, and matching on styles.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const sharp = require('sharp');
const h = require('./helpers.js');
const fx = require('./exchange-fixture.js');
const Application = require('../models/Application.js');
const Event = require('../models/Event.js');
const StyleProfile = require('../models/StyleProfile.js');
const User = require('../models/User.js');
const { colourFeatures, analyseUser, visionStatus } = require('../services/vision.js');
const { featureWords, styleSimilarity, styleFit } = require('../../shared/style.mjs');
const { scorePair } = require('../../shared/matching.mjs');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);
let app;
before(() => {
  app = fx.use(h.makeApp());
});
after(fx.cleanUploads);

// Test pictures: soft pastel blocks, and loud high-contrast stripes
const pastel = () =>
  sharp({ create: { width: 120, height: 120, channels: 3, background: '#f7d6e4' } })
    .composite([{ input: { create: { width: 60, height: 120, channels: 3, background: '#d9e8f7' } }, left: 60, top: 0 }])
    .png()
    .toBuffer();
async function vivid() {
  const stripes = [];
  for (let x = 0; x < 120; x += 10) {
    stripes.push({
      input: { create: { width: 5, height: 120, channels: 3, background: x % 20 ? '#ff1e00' : '#0020ff' } },
      left: x,
      top: 0,
    });
  }
  return sharp({ create: { width: 120, height: 120, channels: 3, background: '#111111' } }).composite(stripes).png().toBuffer();
}

test('colour analysis tells pastel art from loud, detailed art', async () => {
  const soft = (await colourFeatures(await pastel())).features;
  const loud = (await colourFeatures(await vivid())).features;
  assert.ok(featureWords(soft).includes('pastel'));
  assert.ok(featureWords(soft).includes('soft'));
  assert.ok(featureWords(loud).includes('vivid'));
  assert.ok(featureWords(loud).includes('detailed'));
  assert.ok(soft.hist.reduce((a, b) => a + b, 0) > 0.99);

  const sameSame = styleSimilarity({ features: soft }, { features: soft });
  const apart = styleSimilarity({ features: soft }, { features: loud });
  assert.ok(sameSame > 0.95, `same style ${sameSame}`);
  assert.ok(apart < 0.6, `different styles ${apart}`);
  assert.equal(styleSimilarity({ features: soft }, null), null);

  const similar = styleFit({ features: soft }, { features: soft }, 'similar');
  const different = styleFit({ features: soft }, { features: loud }, 'different');
  assert.ok(similar.points >= 18 && similar.reason.startsWith('Similar art styles'));
  assert.ok(different.points >= 8 && different.reason.startsWith('Contrasting styles'));
  assert.equal(styleFit({ features: soft }, { features: soft }, undefined), null);
});

test('matching adds style points only for people who asked', () => {
  const base = (id, extra = {}) => ({ id, canCreate: ['art'], wantsTypes: ['art'], characters: [], ...extra });
  const style = { features: { hist: Array(12).fill(1 / 12), saturation: 0.3, brightness: 0.8, contrast: 0.1, colourfulness: 0.3, warmth: 0.5, detail: 0.05 }, tags: [], vector: [] };
  const plain = scorePair(base('a', { style }), base('b', { style }));
  const wished = scorePair(base('a', { style }), base('b', { style, styleWish: 'similar' }));
  assert.ok(wished.score > plain.score);
  assert.ok(wished.reasons.some((r) => r.startsWith('Similar art styles')));
  assert.ok(!plain.reasons.some((r) => r.includes('art styles')));
});

test('people add style samples and get a style profile', async () => {
  const ada = await h.signUp(app, { displayName: 'Ada' });
  const empty = await ada.agent.get('/api/profile/style').expect(200);
  assert.deepEqual(empty.body.samples, []);
  assert.equal(empty.body.profile, null);
  assert.equal(empty.body.vision.configured, false);
  assert.equal((await ada.agent.post('/api/profile/style/analyse').expect(400)).body.code, 'NO_PICTURES');

  const added = await ada.agent.post('/api/profile/style-samples').attach('image', await pastel(), { filename: 'mine.png', contentType: 'image/png' }).expect(201);
  assert.equal(added.body.samples.length, 1);
  fx.remember({ images: added.body.samples });
  const analysed = await ada.agent.post('/api/profile/style/analyse').expect(200);
  assert.equal(analysed.body.profile.imageCount, 1);
  assert.equal(analysed.body.profile.usedVision, false);
  assert.ok(analysed.body.profile.features.brightness > 0.7);

  for (let i = 0; i < 2; i++) {
    const more = await ada.agent.post('/api/profile/style-samples').attach('image', await pastel(), { filename: `m${i}.png`, contentType: 'image/png' }).expect(201);
    fx.remember({ images: more.body.samples });
  }
  await ada.agent.post('/api/profile/style-samples').attach('image', await pastel(), { filename: 'x.png', contentType: 'image/png' }).expect(400);
  const removed = await ada.agent.delete('/api/profile/style-samples').send({ url: added.body.samples[0] }).expect(200);
  assert.equal(removed.body.samples.length, 2);
});

test('with an Ollama vision server, styles get tags and an embedding (sent with the Cloudflare Access token)', async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push({ path: req.url, id: req.headers['cf-access-client-id'], secret: req.headers['cf-access-client-secret'] });
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'qwen2.5vl:3b' }, { name: 'nomic-embed-text:latest' }] }));
      if (req.url === '/api/generate') {
        const { images, format } = JSON.parse(body);
        assert.equal(format, 'json');
        assert.ok(images[0].length > 100);
        return res.end(JSON.stringify({ response: JSON.stringify({ medium: 'Digital painting', palette: 'pastel', tags: ['soft shading', 'cosy'], subjects: ['cats'], summary: 'Soft pastel cats.' }) }));
      }
      if (req.url === '/api/embed') return res.end(JSON.stringify({ embeddings: [[0.1, 0.2, 0.3]] }));
      res.statusCode = 404;
      res.end('{}');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  Object.assign(process.env, {
    OLLAMA_URL: `http://127.0.0.1:${server.address().port}`,
    CF_ACCESS_CLIENT_ID: 'id.access',
    CF_ACCESS_CLIENT_SECRET: 'shh',
  });
  try {
    const status = await visionStatus({ fresh: true });
    assert.deepEqual([status.reachable, status.vision, status.embeddings], [true, true, true]);

    const ada = await h.signUp(app, { displayName: 'Ada' });
    const added = await ada.agent.post('/api/profile/style-samples').attach('image', await pastel(), { filename: 'mine.png', contentType: 'image/png' }).expect(201);
    fx.remember({ images: added.body.samples });
    const profile = await analyseUser(ada.user.id, { force: true });
    assert.ok(profile.tags.includes('soft shading'));
    assert.ok(profile.tags.includes('cats'));
    assert.equal(profile.summary, 'Soft pastel cats.');
    assert.deepEqual(profile.vector, [0.1, 0.2, 0.3]);
    assert.equal(profile.visionModel, 'qwen2.5vl:3b');
    assert.ok(seen.every((s) => s.id === 'id.access' && s.secret === 'shh'));
  } finally {
    for (const k of ['OLLAMA_URL', 'CF_ACCESS_CLIENT_ID', 'CF_ACCESS_CLIENT_SECRET']) delete process.env[k];
    await visionStatus({ fresh: true });
    server.close();
  }
});

test('organisers scan everyone\'s style and match on it', async () => {
  const ctx = await fx.setup({ count: 3 });
  const url = `/api/events/${ctx.eventId}/matches/style-scan`;
  await ctx.people[0].agent.get(url).expect(403);

  for (const p of ctx.people) {
    const added = await p.agent.post('/api/profile/style-samples').attach('image', await pastel(), { filename: 'mine.png', contentType: 'image/png' }).expect(201);
    fx.remember({ images: added.body.samples });
  }
  const started = await ctx.organizer.agent.post(url).send({}).expect(202);
  assert.equal(started.body.scan.total, 3);
  // Wait for the background scan
  for (let i = 0; i < 50; i++) {
    const { body } = await ctx.organizer.agent.get(url).expect(200);
    if (body.scan.status === 'done') {
      assert.deepEqual(body.profiles, { withStyle: 3, total: 3 });
      break;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(await StyleProfile.countDocuments(), 3);

  await ctx.organizer.agent.put(`/api/events/${ctx.eventId}/matching-rules`).send({ style: 'sideways' }).expect(400);
  await ctx.organizer.agent.put(`/api/events/${ctx.eventId}/matching-rules`).send({ style: 'similar' }).expect(200);
  const generated = await fx.generate(ctx);
  assert.ok(generated.matches.every((m) => m.reasons.some((r) => r.startsWith('Similar art styles'))));

  // Someone's own wish wins over the event's
  await Application.updateOne({ user: ctx.people[0].id }, { stylePreference: 'different' });
  const again = await fx.generate(ctx, 9);
  const forAda = again.matches.find((m) => m.recipient.id === ctx.people[0].id);
  assert.ok(forAda.reasons.some((r) => r.startsWith('Contrasting styles')));
  assert.equal((await Event.findById(ctx.eventId)).matchingRules.style, 'similar');
  assert.ok(await User.exists({ _id: ctx.people[0].id }));
});
