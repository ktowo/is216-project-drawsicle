// Every email goes out in the Drawsicle layout, as HTML with a plain-text twin (ticket 07).
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');
const User = require('../models/User.js');
const { notify } = require('../services/notify.js');
const { outbox } = require('../services/mailer.js');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(async () => {
  await h.clearDb();
  outbox.length = 0;
});

const settle = () => new Promise((r) => setTimeout(r, 50)); // notification emails are sent without waiting

test('notification emails use the layout, with the link and settings in both versions', async () => {
  const user = await User.create({ email: 'mika@example.com', displayName: 'Mika', username: 'mika' });
  await notify(user._id, { type: 'match_assigned', title: 'You have been matched!', message: 'See who you are making a gift for.', link: '/events/1/matches', email: 'matches' });
  await settle();

  assert.equal(outbox.length, 1);
  const [mail] = outbox;
  assert.equal(mail.subject, 'You have been matched!');
  assert.match(mail.html, />drawsicle</);
  assert.match(mail.html, /class="button" href="[^"]*\/events\/1\/matches"/);
  assert.match(mail.text, /^You have been matched!\n\nSee who you are making a gift for\./);
  assert.match(mail.text, /Open Drawsicle: \S+\/events\/1\/matches/);
  assert.match(mail.text, /Notification settings: \S+\/notifications/);
});

test('the password reset email uses the layout too', async () => {
  const app = h.makeApp();
  await h.signUp(app, { email: 'sol@example.com' });
  await h.request(app).post('/api/auth/forgot-password').send({ email: 'sol@example.com' }).expect(200);

  const mail = outbox.find((m) => m.to === 'sol@example.com');
  assert.match(mail.html, />drawsicle</);
  assert.match(mail.html, />Reset your password</);
  assert.match(mail.text, /Reset your password: \S+reset-password\?token=/);
  assert.match(mail.text, /ignore this email/);
});
