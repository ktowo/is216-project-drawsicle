const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const h = require('./helpers.js');
const Application = require('../models/Application.js');
const Character = require('../models/Character.js');
const Event = require('../models/Event.js');
const EventMember = require('../models/EventMember.js');
const Match = require('../models/Match.js');
const Notification = require('../models/Notification.js');
const Submission = require('../models/Submission.js');
const User = require('../models/User.js');
const { seed, seedIfEmpty, demoDataAvailable } = require('../scripts/seed.js');
const { runReminders } = require('../services/reminders.js');
const { EVENT_STATUSES } = require('../../shared/constants.mjs');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);

// Demo artwork goes to a temporary folder instead of server/uploads
let artDir;
before(async () => {
  artDir = await fs.mkdtemp(path.join(os.tmpdir(), 'drawsicle-seed-'));
});
after(async () => {
  if (artDir) await fs.rm(artDir, { recursive: true, force: true });
});

let app;
before(() => {
  app = h.makeApp();
});

function demo() {
  return require('../../shared/demo-data.mjs');
}

// The art file behind an '/uploads/demo/<name>.svg' URL
const artFile = (url) => path.join(artDir, path.basename(url));

test('seed loads every kind of demo record, linked together', async (t) => {
  if (!demoDataAvailable()) return t.skip('shared/demo-data.mjs is missing');
  const now = new Date();
  const data = demo().buildDemoData(now);

  const summary = await seed({ artDir, now });
  assert.equal(summary.login.email, demo().DEMO_LOGIN_EMAIL);
  assert.equal(summary.login.password, demo().DEMO_PASSWORD);

  const models = { users: User, characters: Character, events: Event, applications: Application, matches: Match, submissions: Submission, notifications: Notification };
  for (const [key, Model] of Object.entries(models)) {
    const count = await Model.countDocuments();
    assert.ok(count > 0, `${key} should not be empty`);
    assert.equal(count, data[key].length, `${key} count`);
    assert.equal(summary[key], count);
  }

  // Every lifecycle status is there to click through
  const statuses = new Set(await Event.distinct('status'));
  for (const status of EVENT_STATUSES) assert.ok(statuses.has(status), `no ${status} event`);

  // Each event has a history ending at its current status, and organisers from the data
  const events = await Event.find();
  for (const event of events) {
    const source = data.events.find((e) => e.name === event.name);
    assert.equal(event.statusHistory.at(-1).status, event.status);
    assert.equal(event.statusHistory.length, EVENT_STATUSES.indexOf(event.status) + 1);
    assert.equal(event.inviteCode, source.inviteCode);
    const organizers = await EventMember.countDocuments({ event: event._id, roles: 'organizer' });
    assert.equal(organizers, new Set([source.createdBy, ...source.organizers]).size);
    if (source.banner) {
      assert.match(event.bannerUrl, /^\/uploads\/demo\/[a-z0-9-]+\.svg$/);
      const svg = await fs.readFile(artFile(event.bannerUrl), 'utf8');
      assert.match(svg, /<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    } else {
      assert.equal(event.bannerUrl, '');
    }
  }

  // Accepted applications are participants; matches point at both applications
  const accepted = await Application.find({ status: 'accepted' });
  for (const application of accepted) {
    const member = await EventMember.findOne({ user: application.user, event: application.event });
    assert.ok(member?.roles.includes('participant'));
  }
  for (const match of await Match.find()) {
    assert.ok(match.giverApplication, 'giverApplication');
    assert.ok(match.recipientApplication, 'recipientApplication');
    assert.ok(!match.giver.equals(match.recipient));
  }

  // Submissions use the generated artwork and mark their match as submitted
  for (const submission of await Submission.find()) {
    const match = await Match.findById(submission.match);
    assert.equal(match.status, 'submitted');
    assert.ok(submission.giver.equals(match.giver));
    for (const url of submission.images) await fs.access(artFile(url));
  }

  // Notification links use the real event ids, and keep their dates
  const eventIds = new Set(events.map((e) => e._id.toString()));
  const notes = await Notification.find();
  for (const note of notes) {
    const linked = note.link.match(/^\/events\/([a-f0-9]{24})/);
    if (linked) assert.ok(eventIds.has(linked[1]), `unknown event in ${note.link}`);
  }
  const oldest = data.notifications.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
  assert.ok(await Notification.exists({ title: oldest.title, createdAt: oldest.createdAt }));

  const archived = data.characters.filter((c) => c.archived).length;
  assert.equal(await Character.countDocuments({ archivedAt: { $ne: null } }), archived);
});

test('the demo login works through the API and sees a full dashboard', async (t) => {
  if (!demoDataAvailable()) return t.skip('shared/demo-data.mjs is missing');
  await seed({ artDir });
  const agent = h.request.agent(app);

  const login = await agent
    .post('/api/auth/login')
    .send({ email: demo().DEMO_LOGIN_EMAIL, password: demo().DEMO_PASSWORD })
    .expect(200);
  assert.equal(login.body.user.email, demo().DEMO_LOGIN_EMAIL);
  assert.ok(login.body.user.username);

  const dashboard = await agent.get('/api/dashboard').expect(200);
  assert.ok(dashboard.body.organizing.length > 0);
  const mine = await agent.get('/api/events/mine').expect(200);
  assert.ok(mine.body.organizing.length + mine.body.participating.length > 0);
  const characters = await agent.get('/api/characters?archived=all').expect(200);
  assert.ok(characters.body.characters.length > 0);
  const notifications = await agent.get('/api/notifications').expect(200);
  assert.ok(notifications.body.items.length > 0);

  // The public listing hides drafts and private events
  const listing = await h.request(app).get('/api/events?limit=50').expect(200);
  const expected = await Event.countDocuments({ publicity: 'public', status: { $ne: 'draft' } });
  assert.equal(listing.body.total, expected);

  // Every other demo account can log in with the same password
  const others = await User.find({ email: { $ne: demo().DEMO_LOGIN_EMAIL } }).limit(2);
  for (const user of others) {
    await h.request(app).post('/api/auth/login').send({ email: user.email, password: demo().DEMO_PASSWORD }).expect(200);
  }

  // The reminder job can run over the demo data without tripping on it
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args.join(' '));
  try {
    await runReminders(new Date());
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(errors, []);
});

test('seeding twice needs --reset, which starts over cleanly', async (t) => {
  if (!demoDataAvailable()) return t.skip('shared/demo-data.mjs is missing');
  await seed({ artDir });
  const firstIds = (await User.find().select('_id')).map((u) => u._id.toString());

  await assert.rejects(seed({ artDir }), (err) => err.code === 'ALREADY_SEEDED');

  // Something extra that a reset should sweep away
  const stray = path.join(artDir, 'stray.svg');
  await fs.writeFile(stray, '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await User.create({ email: 'extra@test.local', displayName: 'Extra' });

  const summary = await seed({ artDir, reset: true });
  assert.equal(await User.countDocuments(), summary.users);
  assert.equal(await User.exists({ email: 'extra@test.local' }), null);
  const secondIds = (await User.find().select('_id')).map((u) => u._id.toString());
  assert.ok(secondIds.every((id) => !firstIds.includes(id)));
  await assert.rejects(fs.access(stray));
});

test('seedIfEmpty only fills an empty database', async (t) => {
  if (!demoDataAvailable()) return t.skip('shared/demo-data.mjs is missing');
  await User.create({ email: 'someone@test.local', displayName: 'Someone' });
  assert.equal(await seedIfEmpty({ artDir }), null);
  assert.equal(await User.countDocuments(), 1);

  await h.clearDb();
  const originalLog = console.log;
  const lines = [];
  console.log = (...args) => lines.push(args.join(' '));
  let summary;
  try {
    summary = await seedIfEmpty({ artDir });
  } finally {
    console.log = originalLog;
  }
  assert.ok(summary.users > 0);
  assert.deepEqual(lines, [`Loaded demo data: log in as ${demo().DEMO_LOGIN_EMAIL} / ${demo().DEMO_PASSWORD}`]);
});

test('every demo artist has a profile worth visiting', async (t) => {
  if (!demoDataAvailable()) return t.skip('shared/demo-data.mjs is missing');
  await seed({ artDir });
  const users = await User.find();
  assert.ok(users.length >= 8);

  for (const user of users) {
    const res = await h.request(app).get(`/api/users/${user.username}`).expect(200);
    const { profile } = res.body;
    assert.ok(profile.bio.length > 40, `${user.username} needs a bio`);
    const socials = Object.values(profile.socials).filter(Boolean);
    assert.ok(socials.length >= 2 && socials.length <= 3, `${user.username} should have 2-3 socials`);
    // The seed keeps the handles in the format the profile form saves them in
    assert.ok(socials.every((s) => /^[A-Za-z0-9_.-]{1,50}$/.test(s)));
  }

  // Besides Mika, Kit and Juniper each organise a public event
  for (const username of ['kit', 'juniper']) {
    const { body } = await h.request(app).get(`/api/users/${username}`).expect(200);
    assert.ok(body.stats.eventsOrganized >= 1, `${username} should organise a public event`);
    assert.ok(body.organizing.every((e) => e.status !== 'draft'));
  }
  const mika = await h.request(app).get('/api/users/mika').expect(200);
  assert.ok(mika.body.stats.eventsOrganized >= 3);
  assert.ok(mika.body.stats.exchangesCompleted >= 1);
});
