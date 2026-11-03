const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');
const User = require('../models/User.js');
const InviteCode = require('../models/InviteCode.js');
const mongoose = require('mongoose');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);

async function makeAdmin(app) {
  const { agent, user } = await h.signUp(app, { displayName: 'Admin' });
  await User.updateOne({ _id: user.id }, { role: 'admin' });
  return { agent, user };
}

const register = (app, inviteCode, email) =>
  h.request(app).post('/api/auth/register').send({ email, password: 'password123', displayName: 'New', inviteCode });

test('an admin can turn an invite code off and on again', async () => {
  const app = h.makeApp();
  const admin = await makeAdmin(app);
  const made = await admin.agent.post('/api/admin/invites').send({ code: 'SPRING-27', capacity: 5 }).expect(201);
  assert.equal(made.body.invite.disabled, false);
  const id = made.body.invite.id;

  // Off: nobody can sign up with it, and the message says why
  const off = await admin.agent.patch(`/api/admin/invites/${id}`).send({ disabled: true }).expect(200);
  assert.equal(off.body.invite.disabled, true);
  const refused = await register(app, 'SPRING-27', 'one@test.local').expect(409);
  assert.equal(refused.body.code, 'INVITE_DISABLED');
  assert.equal(await User.countDocuments({ email: 'one@test.local' }), 0);

  // The list shows it as off
  const list = await admin.agent.get('/api/admin/invites').expect(200);
  assert.equal(list.body.invites.find((i) => i.code === 'SPRING-27').disabled, true);

  // On again: sign-up works and uses one place
  await admin.agent.patch(`/api/admin/invites/${id}`).send({ disabled: false }).expect(200);
  await register(app, 'SPRING-27', 'two@test.local').expect(201);
  const after = await InviteCode.findById(id);
  assert.equal(after.signups.length, 1);
  assert.equal(Boolean(after.disabled), false);
});

test('turning a code off keeps its capacity and sign-ups', async () => {
  const app = h.makeApp();
  const admin = await makeAdmin(app);
  const made = await admin.agent.post('/api/admin/invites').send({ code: 'KEEP-ME', capacity: 3 }).expect(201);
  await register(app, 'KEEP-ME', 'a@test.local').expect(201);
  const res = await admin.agent.patch(`/api/admin/invites/${made.body.invite.id}`).send({ disabled: true }).expect(200);
  assert.equal(res.body.invite.capacity, 3);
  assert.equal(res.body.invite.used, 1);
});

test('a code that is off and full says it is off', async () => {
  const app = h.makeApp();
  await InviteCode.create({ code: 'OFF-AND-FULL', capacity: 1, disabled: true, signups: [{ email: 'x@test.local' }], createdBy: new mongoose.Types.ObjectId() });
  const res = await register(app, 'OFF-AND-FULL', 'late@test.local').expect(409);
  assert.equal(res.body.code, 'INVITE_DISABLED');
});

test('the switch checks what it is sent', async () => {
  const app = h.makeApp();
  const admin = await makeAdmin(app);
  const made = await admin.agent.post('/api/admin/invites').send({ code: 'CHECK-ME', capacity: 2 }).expect(201);
  const url = `/api/admin/invites/${made.body.invite.id}`;
  await admin.agent.patch(url).send({}).expect(400);
  await admin.agent.patch(url).send({ disabled: 'yes' }).expect(400);
  await admin.agent.patch('/api/admin/invites/000000000000000000000000').send({ disabled: true }).expect(404);
  // Capacity still works on its own
  const cap = await admin.agent.patch(url).send({ capacity: 9 }).expect(200);
  assert.equal(cap.body.invite.capacity, 9);
  assert.equal(cap.body.invite.disabled, false);
});

test('only admins can use the switch', async () => {
  const app = h.makeApp();
  const admin = await makeAdmin(app);
  const made = await admin.agent.post('/api/admin/invites').send({ code: 'ADMIN-ONLY', capacity: 2 }).expect(201);
  const someone = await h.signUp(app, { displayName: 'Someone' });
  await someone.agent.patch(`/api/admin/invites/${made.body.invite.id}`).send({ disabled: true }).expect(403);
  assert.equal(Boolean((await InviteCode.findById(made.body.invite.id)).disabled), false);
});

test('the invite code page can check a code without using it up', async () => {
  const app = h.makeApp();
  await InviteCode.create({ code: 'CHECK-OK', capacity: 1, signups: [], createdBy: new mongoose.Types.ObjectId() });
  const ok = await h.request(app).post('/api/auth/invite-check').send({ inviteCode: ' check-ok ' }).expect(200);
  assert.deepEqual(ok.body, { valid: true, inviteCode: 'CHECK-OK' });
  // Checking twice still works: nothing was used up, so the one place is still free
  await h.request(app).post('/api/auth/invite-check').send({ inviteCode: 'CHECK-OK' }).expect(200);
  assert.equal((await InviteCode.findOne({ code: 'CHECK-OK' })).signups.length, 0);
  await register(app, 'CHECK-OK', 'first@test.local').expect(201);
});

test('the invite code check says why a code does not work', async () => {
  const app = h.makeApp();
  const by = new mongoose.Types.ObjectId();
  await InviteCode.create({ code: 'IS-OFF', capacity: 3, disabled: true, signups: [], createdBy: by });
  await InviteCode.create({ code: 'IS-FULL', capacity: 1, signups: [{ email: 'x@test.local' }], createdBy: by });
  const check = (inviteCode) => h.request(app).post('/api/auth/invite-check').send({ inviteCode });
  assert.equal((await check('').expect(400)).body.code, 'INVITE_REQUIRED');
  assert.equal((await check('NOPE-NOPE').expect(409)).body.code, 'INVITE_INVALID');
  assert.equal((await check('IS-OFF').expect(409)).body.code, 'INVITE_DISABLED');
  assert.equal((await check('IS-FULL').expect(409)).body.code, 'INVITE_FULL');
  await h.request(app).post('/api/auth/invite-check').send({}).expect(400);
});
