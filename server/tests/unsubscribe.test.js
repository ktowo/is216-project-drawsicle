// One-click unsubscribe (ticket 10): a signed link per email type that works without logging in,
// the List-Unsubscribe headers Gmail uses, and Undo.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');
const User = require('../models/User.js');
const { notify } = require('../services/notify.js');
const { outbox } = require('../services/mailer.js');
const { sendDigests } = require('../services/digest.js');
const { unsubscribeToken, readUnsubscribeToken } = require('../services/unsubscribe.js');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(async () => {
  await h.clearDb();
  outbox.length = 0;
});

const settle = () => new Promise((r) => setTimeout(r, 50));
const person = (name, modes = {}) =>
  User.create({ email: `${name}@example.com`, displayName: name, username: name, notificationPrefs: { emailModes: modes } });
const modesOf = async (user) => (await User.findById(user._id)).toPublic().emailModes;

test('links are signed: they name one person and one email type, and tampering breaks them', async () => {
  const mika = await person('mika');
  const token = unsubscribeToken(mika._id, 'matches');
  assert.deepEqual(readUnsubscribeToken(token), { userId: mika._id.toString(), type: 'matches' });

  const [payload, sig] = token.split('.');
  const other = Buffer.from(`${mika._id}:reminders`).toString('base64url');
  assert.equal(readUnsubscribeToken(`${other}.${sig}`), null);
  assert.equal(readUnsubscribeToken(`${payload}.${sig.slice(0, -2)}xx`), null);
  assert.equal(readUnsubscribeToken('nonsense'), null);
});

test('one click turns that email type off without logging in, and Undo puts it back', async () => {
  const mika = await person('mika', { matches: 'digest' });
  const app = h.makeApp();
  const token = unsubscribeToken(mika._id, 'matches');

  const res = await h.request(app).post('/api/unsubscribe').send({ token }).expect(200);
  assert.deepEqual(res.body, { type: 'matches', label: 'Matches', previous: { matches: 'digest' } });
  assert.equal((await modesOf(mika)).matches, 'off');
  assert.equal((await modesOf(mika)).reminders, 'instant'); // nothing else touched

  await h.request(app).post('/api/unsubscribe/undo').send({ token, previous: res.body.previous }).expect(200);
  assert.equal((await modesOf(mika)).matches, 'digest');
});

test('Gmail\'s one-click POST works too, and bad links are refused', async () => {
  const mika = await person('mika');
  const app = h.makeApp();
  const token = unsubscribeToken(mika._id, 'reminders');

  await h.request(app).post(`/api/unsubscribe?t=${token}`).type('form').send('List-Unsubscribe=One-Click').expect(200);
  assert.equal((await modesOf(mika)).reminders, 'off');

  assert.equal((await h.request(app).post('/api/unsubscribe').send({ token: 'forged.token' }).expect(400)).body.code, 'BAD_LINK');
  // Undo can only set real modes, only for the link's own type
  await h.request(app).post('/api/unsubscribe/undo').send({ token, previous: { reminders: 'weekly' } }).expect(400);
  await h.request(app).post('/api/unsubscribe/undo').send({ token, previous: { matches: 'off' } }).expect(400);
});

test('the digest link stops the digest: every type set to Daily turns off', async () => {
  const mika = await person('mika', { matches: 'digest', eventUpdates: 'digest' });
  const app = h.makeApp();
  const token = unsubscribeToken(mika._id, 'digest');

  const res = await h.request(app).post('/api/unsubscribe').send({ token }).expect(200);
  assert.deepEqual(res.body.previous, { matches: 'digest', eventUpdates: 'digest' });
  assert.deepEqual(await modesOf(mika), { reminders: 'instant', matches: 'off', eventUpdates: 'off' });

  await h.request(app).post('/api/unsubscribe/undo').send({ token, previous: res.body.previous }).expect(200);
  assert.deepEqual(await modesOf(mika), { reminders: 'instant', matches: 'digest', eventUpdates: 'digest' });
});

test('notification and digest emails carry the link and headers; must-arrive emails do not', async () => {
  const mika = await person('mika', { eventUpdates: 'digest' });
  await notify(mika._id, { type: 'match_assigned', title: 'Matched', email: 'matches' });
  await notify(mika._id, { type: 'event_updated', title: 'Dates moved', email: 'eventUpdates' });
  await notify(mika._id, { type: 'account', title: 'Security notice', email: true });
  await settle();
  await sendDigests();

  const matched = outbox.find((m) => m.subject === 'Matched');
  assert.match(matched.headers['List-Unsubscribe'], /^<https?:\/\/\S+\/api\/unsubscribe\?t=[\w-]+\.[\w-]+>$/);
  assert.equal(matched.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.match(matched.text, /Unsubscribe from Matches: \S+\/unsubscribe\?t=/);

  const digest = outbox.find((m) => /Your Drawsicle day/.test(m.subject));
  const t = /t=([\w.-]+)/.exec(digest.headers['List-Unsubscribe'])[1];
  assert.equal(readUnsubscribeToken(t).type, 'digest');

  const security = outbox.find((m) => m.subject === 'Security notice');
  assert.equal(security.headers, undefined);
  assert.doesNotMatch(security.text, /Unsubscribe/);
});
