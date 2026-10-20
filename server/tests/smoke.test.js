const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);

test('health check and register/me round trip', async () => {
  const app = h.makeApp();
  const health = await h.request(app).get('/api/health').expect(200);
  assert.equal(health.body.ok, true);

  const { agent, user } = await h.signUp(app);
  assert.ok(user.id);
  const me = await agent.get('/api/auth/me').expect(200);
  assert.equal(me.body.user.id, user.id);
});

test('unknown API routes return JSON 404', async () => {
  const app = h.makeApp();
  const res = await h.request(app).get('/api/nope').expect(404);
  assert.equal(res.body.code, 'NOT_FOUND');
});
