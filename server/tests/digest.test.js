// The daily digest (ticket 09): one email a day with everything set to "digest", grouped by event.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');
const User = require('../models/User.js');
const Event = require('../models/Event.js');
const Notification = require('../models/Notification.js');
const { notify } = require('../services/notify.js');
const { outbox } = require('../services/mailer.js');
const { sendDigests, runDailyDigestIfDue } = require('../services/digest.js');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(async () => {
  await h.clearDb();
  outbox.length = 0;
});

const NOW = new Date('2026-10-21T08:00:00Z');
const HOUR = 60 * 60 * 1000;
const person = (name, modes = { eventUpdates: 'digest' }) =>
  User.create({ email: `${name}@example.com`, displayName: name, username: name, notificationPrefs: { emailModes: modes } });
const makeEvent = (organizer, name) =>
  Event.create({
    name,
    createdBy: organizer._id,
    status: 'open',
    signupDeadline: new Date(NOW.getTime() + 48 * HOUR),
    submissionDeadline: new Date(NOW.getTime() + 30 * 24 * HOUR),
  });
const update = (user, title, link) => notify(user._id, { type: 'event_updated', title, link, email: 'eventUpdates' });

test('one email per person, grouped by event, newest first, and never sent twice', async () => {
  const mika = await person('mika');
  const moth = await makeEvent(mika, 'Moth Swap');
  const winter = await makeEvent(mika, 'Winter Santa');
  await update(mika, 'Moth dates moved', `/events/${moth._id}`);
  await update(mika, 'Winter is open', `/events/${winter._id}`);
  await update(mika, 'Moth theme added', `/events/${moth._id}/edit`);
  await update(mika, 'Site news', '/');

  const first = await sendDigests(NOW);
  assert.equal(first.digestsSent, 1);
  assert.equal(outbox.length, 1);
  const [mail] = outbox;
  assert.equal(mail.to, 'mika@example.com');
  assert.match(mail.subject, /4 updates/);
  // Each event once, its own updates under it, newest first
  const order = ['Moth Swap', 'Moth theme added', 'Moth dates moved', 'Winter Santa', 'Winter is open', 'Site news'].map((s) => mail.text.indexOf(s));
  assert.ok(order.every((i) => i >= 0), mail.text);
  assert.deepEqual([...order].sort((a, b) => a - b), order, mail.text);
  assert.match(mail.html, />drawsicle</);

  assert.equal(await Notification.countDocuments({ digestPending: true }), 0);
  assert.equal((await sendDigests(NOW)).digestsSent, 0);
  assert.equal(outbox.length, 1);
});

test('nobody gets an empty digest, and deactivated accounts get none', async () => {
  const quiet = await person('quiet');
  const gone = await person('gone');
  await update(gone, 'Something happened', '/');
  await User.updateOne({ _id: gone._id }, { status: 'deactivated' });

  assert.equal((await sendDigests(NOW)).digestsSent, 0);
  assert.equal(outbox.length, 0);
  assert.ok(quiet);
});

test('switching a type off before the digest goes out drops it from the email', async () => {
  const mika = await person('mika');
  await update(mika, 'Dates moved', '/');
  await User.updateOne({ _id: mika._id }, { 'notificationPrefs.emailModes.eventUpdates': 'off' });

  assert.equal((await sendDigests(NOW)).digestsSent, 0);
  assert.equal(await Notification.countDocuments({ digestPending: true }), 0);
});

test('runs at most once a day, however often the job wakes up', async () => {
  const mika = await person('mika');
  await update(mika, 'First', '/');
  assert.equal((await runDailyDigestIfDue(NOW)).digestsSent, 1);

  await update(mika, 'Second', '/');
  assert.equal(await runDailyDigestIfDue(new Date(NOW.getTime() + 2 * HOUR)), null); // not due yet
  assert.equal((await runDailyDigestIfDue(new Date(NOW.getTime() + 24 * HOUR))).digestsSent, 1);
  assert.equal(outbox.length, 2);
});

test('the reminder job sends the digest too, without changing what it reports', async () => {
  const { runRemindersIfDue } = require('../services/reminders.js');
  const before = process.env.REMINDER_INTERVAL_MINUTES;
  process.env.REMINDER_INTERVAL_MINUTES = '60';
  try {
    const mika = await person('mika');
    await update(mika, 'Dates moved', '/');
    const summary = await runRemindersIfDue(NOW);
    assert.ok(summary && !('digestsSent' in summary));
    assert.equal(outbox.length, 1);
  } finally {
    process.env.REMINDER_INTERVAL_MINUTES = before;
  }
});
