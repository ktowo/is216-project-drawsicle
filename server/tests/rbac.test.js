// Site roles: what members, moderators and admins can reach (shared/permissions.mjs).
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');
const User = require('../models/User.js');
const Event = require('../models/Event.js');
const AuditLog = require('../models/AuditLog.js');
const { can, rolesWith, permissionsFor } = require('../../shared/permissions.mjs');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);
let app;
before(() => {
  app = h.makeApp();
});

async function withRole(displayName, role) {
  const person = await h.signUp(app, { displayName });
  await User.updateOne({ _id: person.user.id }, { role });
  return person;
}

test('the permission table gives moderators a subset of what admins have', () => {
  assert.equal(can(null, 'admin.access'), false);
  assert.equal(can({ role: 'user' }, 'admin.access'), false);
  assert.equal(can({ role: 'moderator' }, 'chat.logs'), true);
  assert.equal(can({ role: 'moderator' }, 'users.manage'), false);
  assert.equal(can({ role: 'admin' }, 'users.manage'), true);
  for (const p of permissionsFor('moderator')) assert.ok(permissionsFor('admin').includes(p), p);
  assert.deepEqual(rolesWith('reports.review'), ['moderator', 'admin']);
});

test('members are kept out, moderators see reports and accounts, only admins change things', async () => {
  const admin = await withRole('Ada Admin', 'admin');
  const mod = await withRole('Mo Moderator', 'moderator');
  const member = await h.signUp(app, { displayName: 'Mel Member' });
  const event = await Event.create({
    name: 'Swap',
    signupDeadline: h.daysFromNow(3),
    submissionDeadline: h.daysFromNow(9),
    status: 'open',
    createdBy: member.user.id,
  });

  // Who am I: the app gets the permissions with the user
  const me = await mod.agent.get('/api/auth/me').expect(200);
  assert.equal(me.body.user.role, 'moderator');
  assert.ok(me.body.user.permissions.includes('reports.review'));

  for (const url of ['/api/admin/stats', '/api/admin/reports', '/api/admin/users', '/api/admin/audit']) {
    await member.agent.get(url).expect(403);
    await mod.agent.get(url).expect(200);
    await admin.agent.get(url).expect(200);
  }
  // Moderators can't moderate events or accounts
  await mod.agent.get('/api/admin/events').expect(403);
  await mod.agent.post(`/api/admin/events/${event.id}/disable`).send({ reason: 'x' }).expect(403);
  await mod.agent.post(`/api/admin/users/${member.user.id}/ban`).send({ reason: 'x' }).expect(403);
  await mod.agent.patch(`/api/admin/users/${member.user.id}`).send({ role: 'moderator' }).expect(403);

  // Admins can hand out the moderator role, and it's audited
  await admin.agent.patch(`/api/admin/users/${member.user.id}`).send({ role: 'moderator' }).expect(200);
  const log = await AuditLog.findOne({ action: 'user.promote' });
  assert.equal(log.reason, 'user → moderator');
  await member.agent.get('/api/admin/reports').expect(200);
  // Someone with a site role has to lose it before they can be banned
  await admin.agent.post(`/api/admin/users/${member.user.id}/ban`).send({ reason: 'x' }).expect(400);
  await admin.agent.patch(`/api/admin/users/${member.user.id}`).send({ role: 'user' }).expect(200);
  assert.equal((await AuditLog.findOne({ action: 'user.demote' })).reason, 'moderator → user');
  await member.agent.get('/api/admin/reports').expect(403);
});
