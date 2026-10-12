const { test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const h = require('./helpers.js');
const { LOCAL_UPLOAD_DIR } = require('../services/storage.js');
const User = require('../models/User.js');
const Event = require('../models/Event.js');
const EventMember = require('../models/EventMember.js');
const Notification = require('../models/Notification.js');
const { notify } = require('../services/notify.js');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);

const PASSWORD = 'password123';

async function login(app, email, password = PASSWORD) {
  const agent = h.request.agent(app);
  const res = await agent.post('/api/auth/login').send({ email, password });
  return { agent, res };
}

test('register generates a username and keeps the display name', async () => {
  const app = h.makeApp();

  const first = await h.signUp(app, { email: 'mika@example.com', displayName: '  Mika Draws  ' });
  assert.equal(first.user.displayName, 'Mika Draws');
  assert.equal(first.user.username, 'mika_draws');
  assert.equal(first.user.status, 'active');

  const second = await h.signUp(app, { email: 'other@example.com', displayName: 'Mika Draws' });
  assert.equal(second.user.username, 'mika_draws2');

  // No display name: both come from the email
  const third = await h.signUp(app, { email: 'Pixel.Fox@Example.com' });
  assert.equal(third.user.email, 'pixel.fox@example.com');
  assert.equal(third.user.displayName, 'pixel.fox');
  assert.equal(third.user.username, 'pixel_fox');

  const tooLong = await h.request(app)
    .post('/api/auth/register')
    .send({ email: 'long@example.com', password: PASSWORD, displayName: 'x'.repeat(61) })
    .expect(400);
  assert.equal(tooLong.body.code, 'VALIDATION');

  const shortPw = await h.request(app)
    .post('/api/auth/register')
    .send({ email: 'short@example.com', password: 'short' })
    .expect(400);
  assert.equal(shortPw.body.code, 'VALIDATION');
});

test('registering the same email twice answers 409 EMAIL_TAKEN', async () => {
  const app = h.makeApp();
  await h.signUp(app, { email: 'dup@example.com' });
  const res = await h.request(app)
    .post('/api/auth/register')
    .send({ email: 'DUP@example.com ', password: PASSWORD })
    .expect(409);
  assert.equal(res.body.code, 'EMAIL_TAKEN');
});

test('login with a wrong password or unknown email answers 401', async () => {
  const app = h.makeApp();
  await h.signUp(app, { email: 'login@example.com' });

  const wrong = await login(app, 'login@example.com', 'not-the-password');
  assert.equal(wrong.res.status, 401);
  assert.equal(wrong.res.body.code, 'WRONG_CREDENTIALS');

  const unknown = await login(app, 'nobody@example.com');
  assert.equal(unknown.res.status, 401);
  assert.equal(unknown.res.body.code, 'WRONG_CREDENTIALS');

  const ok = await login(app, 'LOGIN@example.com');
  assert.equal(ok.res.status, 200);
  assert.equal(ok.res.body.reactivated, undefined);
  await ok.agent.get('/api/auth/me').expect(200);
});

test('broken JSON bodies get a JSON error', async () => {
  const app = h.makeApp();
  const res = await h.request(app)
    .post('/api/auth/login')
    .set('Content-Type', 'application/json')
    .send('{"email": ')
    .expect(400);
  assert.equal(res.body.code, 'VALIDATION');
  assert.ok(res.body.error);
});

test('providers reflect which OAuth apps are configured', async (t) => {
  const keys = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  t.after(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
  const app = h.makeApp();

  for (const k of keys) delete process.env[k];
  let res = await h.request(app).get('/api/auth/providers').expect(200);
  assert.deepEqual(res.body, { google: false, discord: false });

  process.env.DISCORD_CLIENT_ID = 'id';
  res = await h.request(app).get('/api/auth/providers').expect(200);
  assert.deepEqual(res.body, { google: false, discord: false }, 'needs the secret too');

  process.env.DISCORD_CLIENT_SECRET = 'secret';
  process.env.GOOGLE_CLIENT_ID = 'gid';
  process.env.GOOGLE_CLIENT_SECRET = 'gsecret';
  res = await h.request(app).get('/api/auth/providers').expect(200);
  assert.deepEqual(res.body, { google: true, discord: true });

  delete process.env.DISCORD_CLIENT_SECRET;
  const redirect = await h.request(app).get('/api/auth/discord').expect(302);
  assert.match(redirect.headers.location, /\/login\?error=discord_not_configured$/);
});

test('change-password checks the current password and logs out other devices', async () => {
  const app = h.makeApp();
  const { agent } = await h.signUp(app, { email: 'change@example.com' });
  const { agent: otherDevice } = await login(app, 'change@example.com');
  await otherDevice.get('/api/auth/me').expect(200);

  const wrong = await agent
    .post('/api/auth/change-password')
    .send({ currentPassword: 'nope-nope', newPassword: 'brand-new-pass' })
    .expect(401);
  assert.equal(wrong.body.code, 'WRONG_PASSWORD');

  const missing = await agent.post('/api/auth/change-password').send({ newPassword: 'brand-new-pass' }).expect(401);
  assert.equal(missing.body.code, 'WRONG_PASSWORD');

  const weak = await agent
    .post('/api/auth/change-password')
    .send({ currentPassword: PASSWORD, newPassword: 'short' })
    .expect(400);
  assert.equal(weak.body.code, 'VALIDATION');

  const ok = await agent
    .post('/api/auth/change-password')
    .send({ currentPassword: PASSWORD, newPassword: 'brand-new-pass' })
    .expect(200);
  assert.equal(ok.body.user.email, 'change@example.com');

  // This device got a fresh cookie, the other one is logged out
  await agent.get('/api/auth/me').expect(200);
  const stale = await otherDevice.get('/api/auth/me').expect(401);
  assert.equal(stale.body.code, 'SESSION_EXPIRED');

  assert.equal((await login(app, 'change@example.com')).res.status, 401);
  assert.equal((await login(app, 'change@example.com', 'brand-new-pass')).res.status, 200);

  await h.request(app).post('/api/auth/change-password').send({}).expect(401);
});

test('accounts without a password can set one', async () => {
  const app = h.makeApp();
  const user = await User.create({ email: 'oauth@example.com', googleId: 'g-1', displayName: 'OAuth', username: 'oauth_user' });

  const noPw = await login(app, 'oauth@example.com');
  assert.equal(noPw.res.status, 400);
  assert.equal(noPw.res.body.code, 'USE_OAUTH');

  // Logged in the way the OAuth callback would be, with the same kind of cookie
  const jwt = require('jsonwebtoken');
  const cookie = `drawisicle_token=${jwt.sign({ sub: user._id.toString(), v: 0 }, process.env.JWT_SECRET)}`;
  await h.request(app).get('/api/auth/me').set('Cookie', cookie).expect(200);

  await h.request(app)
    .post('/api/auth/change-password')
    .set('Cookie', cookie)
    .send({ newPassword: 'first-password' })
    .expect(200);
  assert.equal((await login(app, 'oauth@example.com', 'first-password')).res.status, 200);
  await h.request(app).get('/api/auth/me').set('Cookie', cookie).expect(401);
});

test('deactivating logs out, hides the profile, and logging in reactivates', async () => {
  const app = h.makeApp();
  const { agent, user } = await h.signUp(app, { email: 'leaving@example.com', displayName: 'Leaving Soon' });
  const { agent: otherDevice } = await login(app, 'leaving@example.com');
  const viewer = (await h.signUp(app)).agent;

  await viewer.get(`/api/profile/${user.id}`).expect(200);
  await viewer.get('/api/profile/leaving_soon').expect(200);

  const wrong = await agent.post('/api/profile/deactivate').send({ password: 'wrong-password' }).expect(401);
  assert.equal(wrong.body.code, 'WRONG_PASSWORD');
  await agent.post('/api/profile/deactivate').send({}).expect(401);

  const res = await agent.post('/api/profile/deactivate').send({ password: PASSWORD }).expect(200);
  assert.deepEqual(res.body, { ok: true });

  await agent.get('/api/auth/me').expect(401);
  await otherDevice.get('/api/auth/me').expect(401);
  await viewer.get(`/api/profile/${user.id}`).expect(404);

  const stored = await User.findById(user.id);
  assert.equal(stored.status, 'deactivated');
  assert.ok(stored.deactivatedAt instanceof Date);

  const back = await login(app, 'leaving@example.com');
  assert.equal(back.res.status, 200);
  assert.equal(back.res.body.reactivated, true);
  assert.equal(back.res.body.user.status, 'active');
  await back.agent.get('/api/auth/me').expect(200);
  assert.equal((await User.findById(user.id)).deactivatedAt, null);

  const again = await login(app, 'leaving@example.com');
  assert.equal(again.res.body.reactivated, undefined);
});

test('profile PATCH validates username, socials, defaultForm and notification settings', async () => {
  const app = h.makeApp();
  await h.signUp(app, { email: 'taken@example.com', displayName: 'Taken Name' });
  const { agent } = await h.signUp(app, { email: 'me@example.com', displayName: 'Me' });

  const taken = await agent.patch('/api/profile').send({ username: 'taken_name' }).expect(409);
  assert.equal(taken.body.code, 'USERNAME_TAKEN');

  for (const bad of ['ab', 'has space', 'dash-name', 'x'.repeat(31), 42]) {
    const res = await agent.patch('/api/profile').send({ username: bad }).expect(400);
    assert.equal(res.body.code, 'VALIDATION', `username ${bad}`);
  }

  let res = await agent.patch('/api/profile').send({ username: '  New_Handle ' }).expect(200);
  assert.equal(res.body.user.username, 'new_handle');

  // Socials: every key, handles cleaned, '.', '-' and '_' allowed
  res = await agent
    .patch('/api/profile')
    .send({
      socials: {
        twitter: '@mika_art',
        instagram: 'mika.art',
        bluesky: 'mika.bsky.social',
        discord: 'mika-draws',
        deviantart: 'MikaArt',
        toyhouse: 'mika',
        tumblr: '@@mika',
        myspace: 'ignored',
      },
    })
    .expect(200);
  assert.deepEqual(res.body.user.socials, {
    twitter: 'mika_art',
    instagram: 'mika.art',
    bluesky: 'mika.bsky.social',
    discord: 'mika-draws',
    deviantart: 'MikaArt',
    toyhouse: 'mika',
    tumblr: 'mika',
  });
  const badHandle = await agent.patch('/api/profile').send({ socials: { tumblr: 'not a handle!' } }).expect(400);
  assert.equal(badHandle.body.code, 'VALIDATION');
  await agent.patch('/api/profile').send({ socials: 'mika' }).expect(400);

  // Default form answers
  res = await agent
    .patch('/api/profile')
    .send({
      defaultForm: {
        communityUsername: ' mika#1234 ',
        canCreate: ['art', 'writing', 'art'],
        wantsTypes: ['adoptable'],
        likes: 'Cosy scenes',
        avoid: 'Horror',
        cannotDraw: 'Mecha,  feral , mecha',
      },
    })
    .expect(200);
  assert.deepEqual(res.body.user.defaultForm, {
    communityUsername: 'mika#1234',
    canCreate: ['art', 'writing'],
    wantsTypes: ['adoptable'],
    likes: 'Cosy scenes',
    avoid: 'Horror',
    cannotDraw: ['mecha', 'feral'],
  });
  await agent.patch('/api/profile').send({ defaultForm: { canCreate: ['art', 'sculpture'] } }).expect(400);
  await agent.patch('/api/profile').send({ defaultForm: { wantsTypes: 'art' } }).expect(400);
  await agent.patch('/api/profile').send({ defaultForm: { likes: 'x'.repeat(1001) } }).expect(400);
  await agent.patch('/api/profile').send({ defaultForm: { communityUsername: 'x'.repeat(101) } }).expect(400);

  // Partial update keeps the rest
  res = await agent.patch('/api/profile').send({ defaultForm: { likes: 'Plants' } }).expect(200);
  assert.equal(res.body.user.defaultForm.likes, 'Plants');
  assert.deepEqual(res.body.user.defaultForm.canCreate, ['art', 'writing']);

  // Notification settings
  await agent.patch('/api/profile').send({ notificationPrefs: { emailMatches: 'no' } }).expect(400);
  res = await agent
    .patch('/api/profile')
    .send({ notificationPrefs: { emailReminders: false, emailEventUpdates: true } })
    .expect(200);
  assert.deepEqual(res.body.user.notificationPrefs, { emailReminders: false, emailMatches: true, emailEventUpdates: true });

  // Unknown or protected fields are ignored
  res = await agent.patch('/api/profile').send({ role: 'admin', email: 'x@y.z', status: 'deactivated' }).expect(200);
  assert.equal(res.body.user.role, 'user');
  assert.equal(res.body.user.email, 'me@example.com');
  assert.equal(res.body.user.status, 'active');

  // A failed request changes nothing
  await agent.patch('/api/profile').send({ bio: 'Hello', username: 'taken_name' }).expect(409);
  const me = await agent.get('/api/auth/me').expect(200);
  assert.equal(me.body.user.bio, '');

  await h.request(app).patch('/api/profile').send({ bio: 'x' }).expect(401);
});

test('avatar upload checks the file really is an image, and can be removed', async () => {
  const app = h.makeApp();
  const { agent } = await h.signUp(app);
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  );

  await h.request(app).post('/api/profile/avatar').attach('avatar', png, 'me.png').expect(401);
  await agent.post('/api/profile/avatar').expect(400);

  const wrongType = await agent
    .post('/api/profile/avatar')
    .attach('avatar', Buffer.from('hello'), { filename: 'me.txt', contentType: 'text/plain' })
    .expect(400);
  assert.equal(wrongType.body.code, 'UPLOAD_INVALID');

  // Named and typed like a PNG, but it isn't one
  const fake = await agent
    .post('/api/profile/avatar')
    .attach('avatar', Buffer.from('<svg onload="alert(1)"></svg>'), { filename: 'me.png', contentType: 'image/png' })
    .expect(400);
  assert.equal(fake.body.code, 'UPLOAD_INVALID');

  const tooBig = await agent
    .post('/api/profile/avatar')
    .attach('avatar', Buffer.alloc(2 * 1024 * 1024 + 1), { filename: 'big.png', contentType: 'image/png' })
    .expect(400);
  assert.equal(tooBig.body.code, 'FILE_TOO_LARGE');

  const res = await agent
    .post('/api/profile/avatar')
    .attach('avatar', png, { filename: 'me.png', contentType: 'image/png' })
    .expect(200);
  const url = res.body.user.avatarUrl;
  assert.match(url, /^\/uploads\/avatars\/.+\.png$/);
  await fs.rm(path.join(LOCAL_UPLOAD_DIR, url.replace(/^\/uploads\//, '')), { force: true });

  const removed = await agent.delete('/api/profile/avatar').expect(200);
  assert.equal(removed.body.user.avatarUrl, null);
});

test('notifications can only be deleted by their owner', async () => {
  const app = h.makeApp();
  const alice = await h.signUp(app);
  const bob = await h.signUp(app);

  const mine = await notify(alice.user.id, { type: 'test', title: 'For Alice' });
  const theirs = await notify(bob.user.id, { type: 'test', title: 'For Bob' });

  const denied = await alice.agent.delete(`/api/notifications/${theirs.id}`).expect(404);
  assert.equal(denied.body.code, 'NOT_FOUND');
  assert.ok(await Notification.exists({ _id: theirs._id }));

  await alice.agent.delete('/api/notifications/not-an-id').expect(404);

  const ok = await alice.agent.delete(`/api/notifications/${mine.id}`).expect(200);
  assert.deepEqual(ok.body, { ok: true });
  assert.equal(await Notification.exists({ _id: mine._id }), null);
  await alice.agent.delete(`/api/notifications/${mine.id}`).expect(404);

  const list = await bob.agent.get('/api/notifications').expect(200);
  assert.equal(list.body.items.length, 1);
  assert.equal(list.body.unreadCount, 1);
});

test('membership roles: helpers can be set, organiser and participant cannot', async () => {
  const app = h.makeApp();
  const org = await h.signUp(app);
  const helper = await h.signUp(app);
  const event = await Event.create({
    name: 'Roles test',
    createdBy: org.user.id,
    signupDeadline: h.daysFromNow(5),
    submissionDeadline: h.daysFromNow(20),
  });
  await EventMember.grant(org.user.id, event._id, 'organizer');

  const url = `/api/memberships/events/${event.id}/users/${helper.user.id}`;
  await helper.agent.put(url).send({ roles: ['helper'] }).expect(403);

  const res = await org.agent.put(url).send({ roles: ['helper', 'approver'] }).expect(200);
  assert.deepEqual(res.body.membership.roles, ['helper', 'approver']);
  assert.equal(await Notification.countDocuments({ user: helper.user.id, type: 'role_changed' }), 1);

  const managed = await org.agent.put(url).send({ roles: ['participant'] }).expect(400);
  assert.equal(managed.body.code, 'ROLE_MANAGED_ELSEWHERE');
  await org.agent.put(`/api/memberships/events/${event.id}/users/${org.user.id}`).send({ roles: ['helper'] }).expect(400);

  const members = await helper.agent.get(`/api/memberships/events/${event.id}`).expect(200);
  assert.ok(members.body.members.every((m) => m.email === undefined), 'approvers do not see emails');

  const mine = await helper.agent.get('/api/memberships/mine').expect(200);
  assert.deepEqual(mine.body.memberships, [
    { eventId: event.id, eventName: 'Roles test', eventStatus: 'draft', roles: ['helper', 'approver'] },
  ]);
});

test('Discord sign-in creates, links and reactivates accounts', async (t) => {
  const saved = {
    id: process.env.DISCORD_CLIENT_ID,
    secret: process.env.DISCORD_CLIENT_SECRET,
    fetch: globalThis.fetch,
  };
  process.env.DISCORD_CLIENT_ID = 'discord-client';
  process.env.DISCORD_CLIENT_SECRET = 'discord-secret';
  t.after(() => {
    globalThis.fetch = saved.fetch;
    if (saved.id === undefined) delete process.env.DISCORD_CLIENT_ID;
    else process.env.DISCORD_CLIENT_ID = saved.id;
    if (saved.secret === undefined) delete process.env.DISCORD_CLIENT_SECRET;
    else process.env.DISCORD_CLIENT_SECRET = saved.secret;
  });

  let profile = null;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const json = (body, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => body });
    if (String(url) === 'https://discord.com/api/oauth2/token') {
      const body = new URLSearchParams(options.body);
      assert.equal(body.get('grant_type'), 'authorization_code');
      assert.equal(body.get('client_secret'), 'discord-secret');
      return json({ access_token: 'access-123', token_type: 'Bearer' });
    }
    if (String(url) === 'https://discord.com/api/users/@me') {
      assert.equal(options.headers.Authorization, 'Bearer access-123');
      return json(profile);
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const app = h.makeApp();

  async function signIn(agent) {
    const start = await agent.get('/api/auth/discord').expect(302);
    const location = new URL(start.headers.location);
    assert.equal(location.origin + location.pathname, 'https://discord.com/oauth2/authorize');
    assert.equal(location.searchParams.get('scope'), 'identify email');
    assert.equal(location.searchParams.get('prompt'), 'none');
    const state = location.searchParams.get('state');
    return agent.get(`/api/auth/discord/callback?code=abc&state=${state}`).expect(302);
  }

  // Wrong state never reaches Discord
  const forged = h.request.agent(app);
  await forged.get('/api/auth/discord').expect(302);
  const bad = await forged.get('/api/auth/discord/callback?code=abc&state=forged').expect(302);
  assert.match(bad.headers.location, /\/login\?error=discord_failed$/);
  assert.equal(calls.length, 0);

  const cancelled = await h.request(app).get('/api/auth/discord/callback?error=access_denied').expect(302);
  assert.match(cancelled.headers.location, /error=discord_cancelled$/);

  // Unverified email
  profile = { id: '111', username: 'pixelpup', global_name: 'Pixel Pup', avatar: null, email: 'pup@example.com', verified: false };
  const unverified = await signIn(h.request.agent(app));
  assert.match(unverified.headers.location, /error=discord_unverified$/);

  // New account
  profile = { ...profile, verified: true, avatar: 'abc123' };
  const agent = h.request.agent(app);
  const created = await signIn(agent);
  assert.match(created.headers.location, /\/dashboard$/);
  const me = await agent.get('/api/auth/me').expect(200);
  assert.equal(me.body.user.email, 'pup@example.com');
  assert.equal(me.body.user.displayName, 'Pixel Pup');
  assert.equal(me.body.user.username, 'pixel_pup');
  assert.equal(me.body.user.avatarUrl, 'https://cdn.discordapp.com/avatars/111/abc123.png');
  assert.equal(me.body.user.socials.discord, 'pixelpup');
  assert.equal(me.body.user.providers.discord, true);
  assert.ok(!JSON.stringify(me.body).includes('access-123'));

  // Existing email account gets linked, and a deactivated one comes back
  const existing = await h.signUp(app, { email: 'linked@example.com', displayName: 'Linked' });
  await existing.agent.post('/api/profile/deactivate').send({ password: PASSWORD }).expect(200);
  profile = { id: '222', username: 'linked', global_name: null, avatar: null, email: 'Linked@example.com', verified: true };
  const linkedAgent = h.request.agent(app);
  const linked = await signIn(linkedAgent);
  assert.match(linked.headers.location, /\/dashboard\?reactivated=1$/);
  const linkedMe = await linkedAgent.get('/api/auth/me').expect(200);
  assert.equal(linkedMe.body.user.id, existing.user.id);
  assert.equal(linkedMe.body.user.status, 'active');
  assert.equal(linkedMe.body.user.providers.discord, true);
  assert.equal(await User.countDocuments({ email: 'linked@example.com' }), 1);
});
