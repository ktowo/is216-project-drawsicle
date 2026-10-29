// Signing in through Supabase: the browser sends its Supabase access token to
// POST /api/auth/supabase and gets the app's own session (docs/adr/0001). The Supabase check is
// replaced with a fake: tokens here are just keys into the IDENTITIES table.
const { test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');
const User = require('../models/User.js');
const { setIdentityVerifier } = require('../services/supabase-identity.js');
const { setSettingsFetcher } = require('../services/supabase-settings.js');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(async () => {
  await h.clearDb();
  process.env.AUTH_PROVIDER = 'supabase';
  setIdentityVerifier(async (token) => IDENTITIES[token] || null);
});
afterEach(() => {
  delete process.env.AUTH_PROVIDER;
  setIdentityVerifier();
});

const IDENTITIES = {
  'new-person': { id: 'sb-new', email: 'new@example.com', emailVerified: true, name: 'New Person', avatarUrl: '' },
};

function exchange(app, accessToken, extra = {}) {
  const agent = h.request.agent(app);
  return { agent, res: agent.post('/api/auth/supabase').send({ accessToken, ...extra }) };
}

test('a first Supabase sign-in makes a new account and signs it in', async () => {
  const app = h.makeApp();
  const { agent, res } = exchange(app, 'new-person');
  const body = (await res.expect(201)).body;
  assert.equal(body.user.displayName, 'New Person');
  assert.equal(body.user.email, 'new@example.com');
  assert.ok(body.user.username);

  const me = await agent.get('/api/auth/me').expect(200);
  assert.equal(me.body.user.id, body.user.id);
  assert.equal((await User.findById(body.user.id)).supabaseId, 'sb-new');
});

Object.assign(IDENTITIES, {
  'mika-google': { id: 'sb-mika', email: 'mika@example.com', emailVerified: true, name: 'Mika G', avatarUrl: '' },
  'mika-unverified': { id: 'sb-intruder', email: 'mika@example.com', emailVerified: false, name: 'Not Mika', avatarUrl: '' },
  'mika-other': { id: 'sb-other', email: 'mika@example.com', emailVerified: true, name: 'Mika again', avatarUrl: '' },
  'no-email': { id: 'sb-noemail', email: '', emailVerified: false, name: 'Ghost', avatarUrl: '' },
});

test('a verified email links to the existing account, which keeps everything', async () => {
  const app = h.makeApp();
  const { user: mika } = await h.signUp(app, { email: 'mika@example.com', displayName: 'Mika' });

  const { agent, res } = exchange(app, 'mika-google');
  const body = (await res.expect(200)).body;
  assert.equal(body.user.id, mika.id);
  assert.equal(body.user.displayName, 'Mika'); // the account's own name wins
  assert.equal((await User.findById(mika.id)).supabaseId, 'sb-mika');
  await agent.get('/api/auth/me').expect(200);

  // Next time it's found by the link alone
  assert.equal((await exchange(app, 'mika-google').res.expect(200)).body.user.id, mika.id);
  assert.equal(await User.countDocuments({ email: 'mika@example.com' }), 1);
});

test('an unverified email can never take over an existing account', async () => {
  const app = h.makeApp();
  const { user: mika } = await h.signUp(app, { email: 'mika@example.com', displayName: 'Mika' });

  const { agent, res } = exchange(app, 'mika-unverified');
  assert.equal((await res.expect(409)).body.code, 'EMAIL_NOT_VERIFIED');
  await agent.get('/api/auth/me').expect(401);
  assert.equal((await User.findById(mika.id)).supabaseId, undefined);
});

test('an account already linked to another Supabase user is not relinked', async () => {
  const app = h.makeApp();
  await h.signUp(app, { email: 'mika@example.com' });
  await exchange(app, 'mika-google').res.expect(200);

  assert.equal((await exchange(app, 'mika-other').res.expect(409)).body.code, 'ACCOUNT_LINKED_ELSEWHERE');
  assert.equal((await User.findOne({ email: 'mika@example.com' })).supabaseId, 'sb-mika');
});

test('banned accounts are refused; deactivated ones come back, as with a password', async () => {
  const app = h.makeApp();
  const { user } = await h.signUp(app, { email: 'mika@example.com' });

  await User.updateOne({ _id: user.id }, { status: 'banned', banReason: 'spam' });
  const banned = (await exchange(app, 'mika-google').res.expect(403)).body;
  assert.equal(banned.code, 'ACCOUNT_BANNED');
  assert.match(banned.error, /spam/);

  await User.updateOne({ _id: user.id }, { status: 'deactivated', deactivatedAt: new Date() });
  const back = (await exchange(app, 'mika-google').res.expect(200)).body;
  assert.equal(back.reactivated, true);
  assert.equal((await User.findById(user.id)).status, 'active');
});

test('bad or missing tokens and sign-ins without an email are refused', async () => {
  const app = h.makeApp();
  assert.equal((await exchange(app, 'made-up').res.expect(401)).body.code, 'INVALID_TOKEN');
  assert.equal((await exchange(app, '').res.expect(401)).body.code, 'INVALID_TOKEN');
  assert.equal((await exchange(app, 'no-email').res.expect(400)).body.code, 'EMAIL_REQUIRED');
  assert.equal(await User.countDocuments({}), 0);
});

test('the session follows remember me and "log out everywhere", like any other', async () => {
  const app = h.makeApp();
  const remembered = await exchange(app, 'new-person', { remember: true }).res.expect(201);
  assert.match(remembered.headers['set-cookie'][0], /Max-Age=2592000/); // 30 days

  const browserOnly = await exchange(app, 'new-person', { remember: false }).res.expect(200);
  assert.doesNotMatch(browserOnly.headers['set-cookie'][0], /Max-Age/);

  // Bumping the session version (log out everywhere, bans) ends it
  const { agent, res } = exchange(app, 'new-person');
  await res.expect(200);
  await User.updateOne({ supabaseId: 'sb-new' }, { $inc: { sessionVersion: 1 } });
  await agent.get('/api/auth/me').expect(401);
});

test('is switched off while the app uses its own sign-in', async () => {
  process.env.AUTH_PROVIDER = 'local';
  const app = h.makeApp();
  assert.equal((await exchange(app, 'new-person').res.expect(404)).body.code, 'NOT_ENABLED');
});

test('the providers list tells the browser how to sign in, with only public Supabase settings', async () => {
  process.env.SUPABASE_URL = 'https://abc.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'public-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'very-secret';
  process.env.SUPABASE_OAUTH_PROVIDERS = 'google';
  // Supabase can't be reached here: the setting is the fallback
  setSettingsFetcher(async () => {
    throw new Error('offline');
  });
  try {
    const app = h.makeApp();
    const body = (await h.request(app).get('/api/auth/providers').expect(200)).body;
    assert.deepEqual(body, {
      provider: 'supabase',
      google: true,
      discord: false,
      supabaseUrl: 'https://abc.supabase.co',
      supabaseAnonKey: 'public-anon-key',
    });
    assert.doesNotMatch(JSON.stringify(body), /very-secret/);

    process.env.AUTH_PROVIDER = 'local';
    assert.equal((await h.request(app).get('/api/auth/providers').expect(200)).body.provider, undefined);
  } finally {
    for (const k of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_OAUTH_PROVIDERS']) delete process.env[k];
    setSettingsFetcher();
  }
});

test('only offers the sign-in buttons Supabase actually has switched on', async () => {
  process.env.SUPABASE_URL = 'https://abc.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'public-anon-key';
  let asked = 0;
  setSettingsFetcher(async () => {
    asked++;
    return { external: { google: false, discord: true, email: true } };
  });
  try {
    const app = h.makeApp();
    const body = (await h.request(app).get('/api/auth/providers').expect(200)).body;
    assert.equal(body.google, false); // the button would only lead to "provider is not enabled"
    assert.equal(body.discord, true);
    await h.request(app).get('/api/auth/providers').expect(200);
    assert.equal(asked, 1); // remembered for a few minutes
  } finally {
    for (const k of ['SUPABASE_URL', 'SUPABASE_ANON_KEY']) delete process.env[k];
    setSettingsFetcher();
  }
});

test('after a Supabase password reset, other devices are logged out (as with the app\'s own reset)', async () => {
  const app = h.makeApp();
  const { agent: otherDevice, res: first } = exchange(app, 'new-person');
  await first.expect(201);
  await otherDevice.get('/api/auth/me').expect(200);

  const { agent: thisDevice, res } = exchange(app, 'new-person', { passwordReset: true });
  await res.expect(200);
  await thisDevice.get('/api/auth/me').expect(200);
  await otherDevice.get('/api/auth/me').expect(401);
});
