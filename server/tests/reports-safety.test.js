// Keeping people safe: reports to the site admins, adults-only events and content warnings on characters.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');
const fx = require('./exchange-fixture.js');
const AuditLog = require('../models/AuditLog.js');
const Notification = require('../models/Notification.js');
const Report = require('../models/Report.js');
const User = require('../models/User.js');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);
let app;
before(() => {
  app = fx.use(h.makeApp());
});

async function makeAdmin() {
  const admin = await h.signUp(app, { displayName: 'Ada Admin' });
  await User.updateOne({ _id: admin.user.id }, { role: 'admin' });
  return admin;
}

test('anyone signed in can report a character, and the admins are told', async () => {
  const admin = await makeAdmin();
  const ctx = await fx.setup({ count: 2, status: 'open' });
  const [ada, ben] = ctx.people;
  const body = { targetType: 'character', targetId: ben.character.id, reason: 'stolen_art', details: 'Traced from a well-known artist.' };

  await h.request(app).post('/api/reports').send(body).expect(401);
  await ada.agent.post('/api/reports').send({ ...body, targetType: 'planet' }).expect(400);
  await ada.agent.post('/api/reports').send({ ...body, reason: 'meh' }).expect(400);
  await ada.agent.post('/api/reports').send({ ...body, reason: 'other', details: '' }).expect(400);
  await ada.agent.post('/api/reports').send({ ...body, targetId: '0123456789abcdef01234567' }).expect(404);
  // Your own things can't be reported
  await ben.agent.post('/api/reports').send(body).expect(400);

  const sent = await ada.agent.post('/api/reports').send(body).expect(201);
  assert.equal(sent.body.report.status, 'open');
  const saved = await Report.findById(sent.body.report.id);
  assert.equal(saved.targetLabel, "Ben Artist's OC (fox)");
  assert.equal(String(saved.targetOwner), ben.id);
  assert.equal(await Notification.countDocuments({ user: admin.user.id, type: 'report_received' }), 1);

  // The same open report twice is refused
  const again = await ada.agent.post('/api/reports').send(body).expect(409);
  assert.equal(again.body.code, 'ALREADY_REPORTED');
});

test('admins work through reports and the reporter hears back once', async () => {
  const admin = await makeAdmin();
  const ctx = await fx.setup({ count: 2, status: 'open' });
  const [ada, ben] = ctx.people;
  await ada.agent
    .post('/api/reports')
    .send({ targetType: 'user', targetId: ben.id, reason: 'harassment', details: 'Rude messages in the Discord.' })
    .expect(201);
  await ada.agent.post('/api/reports').send({ targetType: 'event', targetId: ctx.eventId, reason: 'spam' }).expect(201);

  // Not for everyone
  await ada.agent.get('/api/admin/reports').expect(403);

  const open = await admin.agent.get('/api/admin/reports').expect(200);
  assert.deepEqual(open.body.counts, { open: 2, resolved: 0, dismissed: 0 });
  // Oldest first
  const [aboutBen, aboutEvent] = open.body.reports;
  assert.equal(aboutBen.targetType, 'user');
  assert.equal(aboutBen.reporter.displayName, 'Ada Artist');
  assert.equal(aboutBen.owner.id, ben.id);
  assert.equal(aboutBen.details, 'Rude messages in the Discord.');
  assert.equal(aboutEvent.targetLabel, 'Winter Swap');
  assert.equal(aboutEvent.link, `/events/${ctx.eventId}`);

  const stats = await admin.agent.get('/api/admin/stats').expect(200);
  assert.equal(stats.body.openReports, 2);

  await admin.agent.patch(`/api/admin/reports/${aboutBen.id}`).send({ status: 'closed' }).expect(400);
  const done = await admin.agent
    .patch(`/api/admin/reports/${aboutBen.id}`)
    .send({ status: 'resolved', resolution: 'Banned for a week.' })
    .expect(200);
  assert.equal(done.body.report.status, 'resolved');
  assert.equal(done.body.report.handledBy.displayName, 'Ada Admin');
  assert.equal(await Notification.countDocuments({ user: ada.id, type: 'report_handled' }), 1);
  assert.equal(await AuditLog.countDocuments({ action: 'report.resolve', targetType: 'report' }), 1);

  // Reopening and closing again doesn't notify twice
  await admin.agent.patch(`/api/admin/reports/${aboutBen.id}`).send({ status: 'open' }).expect(200);
  await admin.agent.patch(`/api/admin/reports/${aboutBen.id}`).send({ status: 'dismissed' }).expect(200);
  assert.equal(await Notification.countDocuments({ user: ada.id, type: 'report_handled' }), 2);

  const dismissed = await admin.agent.get('/api/admin/reports?status=dismissed').expect(200);
  assert.equal(dismissed.body.reports.length, 1);
  assert.equal(dismissed.body.counts.open, 1);
});

test('an adults-only event asks people to confirm they are 18 or older', async () => {
  const org = await h.signUp(app, { displayName: 'Organiser' });
  const created = await org.agent
    .post('/api/events')
    .send({
      name: 'After Dark Swap',
      signupDeadline: h.daysFromNow(10),
      submissionDeadline: h.daysFromNow(30),
      allowedTypes: ['art'],
      adultOnly: true,
    })
    .expect(201);
  assert.equal(created.body.event.adultOnly, true);
  const eventId = created.body.event.id;
  await org.agent.post(`/api/events/${eventId}/status`).send({ status: 'open' }).expect(200);

  const person = await h.signUp(app, { displayName: 'Pip' });
  const character = (await person.agent.post('/api/characters').send({ name: 'Moth' }).expect(201)).body.character;
  const form = {
    communityUsername: 'pip#0001',
    canCreate: ['art'],
    wantsTypes: ['art'],
    offeredCharacterIds: [character.id],
  };
  const refused = await person.agent.put(`/api/events/${eventId}/application`).send(form).expect(400);
  assert.equal(refused.body.code, 'AGE_CONFIRM');
  await person.agent.put(`/api/events/${eventId}/application`).send({ ...form, confirmAdult: true }).expect(201);
  // Editing the sign-up later doesn't ask again
  await person.agent.put(`/api/events/${eventId}/application`).send({ ...form, likes: 'Moody lighting' }).expect(200);

  // Copies keep the setting
  const copy = await org.agent.post(`/api/events/${eventId}/duplicate`).send({}).expect(201);
  assert.equal(copy.body.event.adultOnly, true);
});

test('characters carry content warnings from a fixed list', async () => {
  const person = await h.signUp(app, { displayName: 'Pip' });
  await person.agent.post('/api/characters').send({ name: 'Gash', contentWarnings: ['gore-ish'] }).expect(400);
  const made = await person.agent
    .post('/api/characters')
    .send({ name: 'Gash', contentWarnings: ['blood', 'blood', 'horror'] })
    .expect(201);
  assert.deepEqual(made.body.character.contentWarnings, ['blood', 'horror']);
  const edited = await person.agent
    .patch(`/api/characters/${made.body.character.id}`)
    .send({ contentWarnings: [] })
    .expect(200);
  assert.deepEqual(edited.body.character.contentWarnings, []);
});
