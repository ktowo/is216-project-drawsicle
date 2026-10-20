// The pieces that let the API run on Vercel: uploads kept in the database, the cron route,
// the shared reminder schedule and the connection string names.
const { test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');
const User = require('../models/User.js');
const JobRun = require('../models/JobRun.js');
const { seed } = require('../scripts/seed.js');
const { runRemindersIfDue } = require('../services/reminders.js');
const { storageMode } = require('../services/storage.js');
const { connectionString } = require('../db.js');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

// Sets environment variables for one test and puts them back afterwards
const saved = new Map();
function setEnv(values) {
  for (const [key, value] of Object.entries(values)) {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  saved.clear();
});

let app;
before(() => {
  app = h.makeApp();
});

test('the connection string can come from DB_MONGODB_URI, MONGODB_URI or DB', () => {
  setEnv({ DB_MONGODB_URI: undefined, MONGODB_URI: undefined, DB: '[MongoDB Connection String]' });
  assert.equal(connectionString(), '');
  setEnv({ DB: 'mongodb://db-name' });
  assert.equal(connectionString(), 'mongodb://db-name');
  setEnv({ MONGODB_URI: ' mongodb://mongodb-uri ' });
  assert.equal(connectionString(), 'mongodb://mongodb-uri');
  setEnv({ DB_MONGODB_URI: 'mongodb+srv://vercel' });
  assert.equal(connectionString(), 'mongodb+srv://vercel');
});

test('uploads go to the database when the database is a shared one', () => {
  setEnv({ UPLOAD_STORAGE: undefined, AZURE_STORAGE_CONNECTION_STRING: undefined, DB_MONGODB_URI: undefined, MONGODB_URI: undefined, DB: undefined });
  assert.equal(storageMode(), 'local');
  setEnv({ DB_MONGODB_URI: 'mongodb+srv://example' });
  assert.equal(storageMode(), 'mongodb');
  setEnv({ UPLOAD_STORAGE: 'local' });
  assert.equal(storageMode(), 'local');
});

test('an image kept in the database is served back at /api/files', async () => {
  setEnv({ UPLOAD_STORAGE: 'mongodb' });
  const { agent } = await h.signUp(app);
  const res = await agent
    .post('/api/profile/avatar')
    .attach('avatar', png, { filename: 'me.png', contentType: 'image/png' })
    .expect(200);
  const url = res.body.user.avatarUrl;
  assert.match(url, /^\/api\/files\/[a-f0-9]{24}\.png$/);

  // Anyone can load it (avatars show on public pages), and it can be cached for good
  const file = await h.request(app).get(url).buffer(true).expect(200);
  assert.equal(file.headers['content-type'], 'image/png');
  assert.match(file.headers['cache-control'], /immutable/);
  assert.equal(file.headers['x-content-type-options'], 'nosniff');
  assert.deepEqual(Buffer.from(file.body), png);

  await h.request(app).get('/api/files/0123456789abcdef01234567.png').expect(404);
  await h.request(app).get('/api/files/not-a-file').expect(404);
  await h.request(app).get('/api/files/../../server.js').expect(404);
});

test('the demo artwork is saved to the database when uploads are', async () => {
  setEnv({ UPLOAD_STORAGE: 'mongodb' });
  await seed({ now: new Date() });
  const withArt = await h.request(app).get('/api/users/mika').expect(200);
  assert.ok(withArt.body.profile);

  const Submission = require('../models/Submission.js');
  const gift = await Submission.findOne({ 'images.0': { $exists: true } });
  assert.ok(gift, 'the demo data has gifts with artwork');
  assert.match(gift.images[0], /^\/api\/files\/[a-f0-9]{24}\.svg$/);
  const art = await h.request(app).get(gift.images[0]).buffer(true).expect(200);
  assert.equal(art.headers['content-type'], 'image/svg+xml');
  assert.match(art.headers['content-security-policy'], /default-src 'none'/);
  assert.match(Buffer.from(art.body).toString('utf8'), /^<svg/);
});

test('the cron route needs CRON_SECRET', async () => {
  setEnv({ CRON_SECRET: undefined });
  await h.request(app).get('/api/cron/reminders').expect(401);

  setEnv({ CRON_SECRET: 'cron-secret-for-tests' });
  await h.request(app).get('/api/cron/reminders').expect(401);
  await h.request(app).get('/api/cron/reminders').set('Authorization', 'Bearer wrong').expect(401);
  const res = await h.request(app)
    .get('/api/cron/reminders')
    .set('Authorization', 'Bearer cron-secret-for-tests')
    .expect(200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.ran, true);
  assert.equal(typeof res.body.summary.autoClosed, 'number');
});

test('reminders started by requests run at most once per interval', async () => {
  setEnv({ REMINDER_INTERVAL_MINUTES: '30' });
  const now = new Date();
  assert.ok(await runRemindersIfDue(now), 'the first request runs it');
  assert.equal(await runRemindersIfDue(new Date(now.getTime() + 60 * 1000)), null, 'a minute later it is not due');

  // Two instances asking at the same time: only one runs it
  const later = new Date(now.getTime() + 31 * 60 * 1000);
  const results = await Promise.all([runRemindersIfDue(later), runRemindersIfDue(later)]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal((await JobRun.findById('reminders')).lastRunAt.getTime(), later.getTime());

  setEnv({ REMINDER_INTERVAL_MINUTES: '0' });
  assert.equal(await runRemindersIfDue(new Date(now.getTime() + 24 * 60 * 60 * 1000)), null, '0 turns it off');
});

test('server.js exports the app without listening', async () => {
  // Vercel imports server.js; the module must hand back an app and leave listening to Vercel.
  // Point it at the test database (it would otherwise start the local one).
  setEnv({ DB_MONGODB_URI: h.testDbUri() });
  const exported = require('../server.js');
  assert.equal(typeof exported, 'function');
  assert.equal(typeof exported.listen, 'function');
  await h.request(exported).get('/api/health').expect(200);
  assert.equal(await User.countDocuments(), 0, 'no demo data was loaded into a shared database');
});
