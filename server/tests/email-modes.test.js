// Each email type can be Instant, Daily digest or Off (ticket 08, docs/specs/supabase-auth-email.md).
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');
const User = require('../models/User.js');
const Notification = require('../models/Notification.js');
const { notify, notifyMany } = require('../services/notify.js');
const { outbox } = require('../services/mailer.js');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(async () => {
  await h.clearDb();
  outbox.length = 0;
});

const settle = () => new Promise((r) => setTimeout(r, 50)); // emails go out without waiting
const person = (name, prefs = {}) =>
  User.create({ email: `${name}@example.com`, displayName: name, username: name, notificationPrefs: prefs });

test('new accounts: reminders and matches are instant, event updates go in the daily digest', async () => {
  const mika = await person('mika');
  assert.deepEqual(mika.toPublic().emailModes, { reminders: 'instant', matches: 'instant', eventUpdates: 'digest' });
});

test('instant emails now, digest waits for the daily email, off sends nothing', async () => {
  const mika = await person('mika', { emailModes: { reminders: 'instant', matches: 'off', eventUpdates: 'digest' } });

  await notify(mika._id, { type: 'deadline_reminder', title: 'Due soon', email: 'reminders' });
  await notify(mika._id, { type: 'match_assigned', title: 'Matched', email: 'matches' });
  await notify(mika._id, { type: 'event_updated', title: 'Event changed', email: 'eventUpdates' });
  await settle();

  assert.deepEqual(outbox.map((m) => m.subject), ['Due soon']);
  const rows = await Notification.find({ user: mika._id }).sort({ createdAt: 1 });
  assert.deepEqual(rows.map((r) => [r.title, Boolean(r.digestPending)]), [
    ['Due soon', false],
    ['Matched', false],
    ['Event changed', true],
  ]);
});

test('an account made with only the older switches still has them respected', async () => {
  const quiet = await person('quiet', { emailReminders: false });
  await notify(quiet._id, { type: 'deadline_reminder', title: 'Due soon', email: 'reminders' });
  await settle();
  assert.equal(outbox.length, 0);
});

test('everyone in a group email gets their own choice', async () => {
  const instant = await person('instant', { emailModes: { eventUpdates: 'instant' } });
  const digest = await person('digest', { emailModes: { eventUpdates: 'digest' } });
  const off = await person('off', { emailModes: { eventUpdates: 'off' } });
  const gone = await person('gone', { emailModes: { eventUpdates: 'instant' } });
  await User.updateOne({ _id: gone._id }, { status: 'deactivated' });

  await notifyMany([instant._id, digest._id, off._id, gone._id], { type: 'event_updated', title: 'Dates moved', email: 'eventUpdates' });
  await settle();

  assert.deepEqual(outbox.map((m) => m.to), ['instant@example.com']);
  const pending = await Notification.find({ digestPending: true }).populate('user', 'email');
  assert.deepEqual(pending.map((n) => n.user.email), ['digest@example.com']);
});

test('emails that must always arrive ignore the settings', async () => {
  const mika = await person('mika', { emailModes: { reminders: 'off', matches: 'off', eventUpdates: 'off' } });
  await notify(mika._id, { type: 'account', title: 'Security notice', email: true });
  await settle();
  assert.deepEqual(outbox.map((m) => m.subject), ['Security notice']);
});

test('older accounts keep their choices without any data being rewritten: on is the usual mode, off stays off', async () => {
  const { insertedId } = await User.collection.insertOne({
    email: 'old@example.com',
    displayName: 'Old',
    username: 'old',
    notificationPrefs: { emailReminders: true, emailMatches: false, emailEventUpdates: true },
  });
  const optedOut = await User.collection.insertOne({
    email: 'quiet@example.com',
    displayName: 'Quiet',
    username: 'quiet',
    notificationPrefs: { emailReminders: false, emailMatches: true, emailEventUpdates: false },
  });

  const old = await User.findById(insertedId);
  assert.deepEqual(old.toPublic().emailModes, { reminders: 'instant', matches: 'off', eventUpdates: 'digest' });
  const quiet = await User.findById(optedOut.insertedId);
  assert.deepEqual(quiet.toPublic().emailModes, { reminders: 'off', matches: 'instant', eventUpdates: 'off' });
});

test('settings can be changed from the profile, and the old on/off switches still work', async () => {
  const app = h.makeApp();
  const { agent } = await h.signUp(app, { email: 'pat@example.com' });

  let res = await agent.patch('/api/profile').send({ notificationPrefs: { emailModes: { matches: 'digest' } } }).expect(200);
  assert.equal(res.body.user.emailModes.matches, 'digest');
  assert.equal(res.body.user.notificationPrefs.emailMatches, true); // derived: anything but off

  res = await agent.patch('/api/profile').send({ notificationPrefs: { emailReminders: false } }).expect(200);
  assert.equal(res.body.user.emailModes.reminders, 'off');
  res = await agent.patch('/api/profile').send({ notificationPrefs: { emailReminders: true } }).expect(200);
  assert.equal(res.body.user.emailModes.reminders, 'instant');

  const bad = await agent.patch('/api/profile').send({ notificationPrefs: { emailModes: { matches: 'weekly' } } }).expect(400);
  assert.match(bad.body.error, /instant.*digest.*off/);
});
