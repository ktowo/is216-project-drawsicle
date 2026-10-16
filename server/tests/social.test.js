// Following people, friends (people who follow each other) and the friend list.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');
const Follow = require('../models/Follow.js');
const Notification = require('../models/Notification.js');
const Presence = require('../models/Presence.js');
const User = require('../models/User.js');
const { anonymiseUser } = require('../services/accounts.js');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);
let app;
before(() => {
  app = h.makeApp();
});

async function person(displayName, username) {
  const p = await h.signUp(app, { displayName });
  await User.updateOne({ _id: p.user.id }, { username });
  return { ...p, id: p.user.id, username };
}

test('following someone, and becoming friends when they follow back', async () => {
  const ada = await person('Ada', 'ada');
  const ben = await person('Ben', 'ben');

  await h.request(app).post('/api/users/ben/follow').expect(401);
  await ada.agent.post('/api/users/ada/follow').expect(400);
  await ada.agent.post('/api/users/nobody_here/follow').expect(404);

  const first = await ada.agent.post('/api/users/ben/follow').expect(200);
  assert.deepEqual(first.body.viewer, { following: true, followsYou: false, friends: false });
  assert.deepEqual(first.body.stats, { followers: 1, following: 0 });
  // Following twice is fine and doesn't notify twice
  await ada.agent.post('/api/users/ben/follow').expect(200);
  assert.equal(await Notification.countDocuments({ user: ben.id, type: 'new_follower' }), 1);

  const profile = await ben.agent.get('/api/users/ada').expect(200);
  assert.deepEqual(profile.body.viewer, { blocked: false, following: false, followsYou: true, friends: false });

  const back = await ben.agent.post('/api/users/ada/follow').expect(200);
  assert.equal(back.body.viewer.friends, true);
  assert.equal(await Notification.countDocuments({ user: ada.id, type: 'new_friend' }), 1);

  const list = await ada.agent.get('/api/friends').expect(200);
  assert.deepEqual(list.body.friends.map((f) => f.user.displayName), ['Ben']);
  assert.deepEqual(list.body.followers, []);
  assert.deepEqual(list.body.following, []);

  // Unfollowing: Ben still follows Ada, so Ben shows as a follower
  const undone = await ada.agent.delete('/api/users/ben/follow').expect(200);
  assert.deepEqual(undone.body.viewer, { following: false, followsYou: true, friends: false });
  const after1 = await ada.agent.get('/api/friends').expect(200);
  assert.deepEqual(after1.body.friends, []);
  assert.deepEqual(after1.body.followers.map((f) => f.user.displayName), ['Ben']);
});

test('the friend list shows who is in the museum, and deleted accounts drop out', async () => {
  const ada = await person('Ada', 'ada');
  const ben = await person('Ben', 'ben');
  const cleo = await person('Cleo', 'cleo');
  await ada.agent.post('/api/users/ben/follow').expect(200);
  await ben.agent.post('/api/users/ada/follow').expect(200);
  await ada.agent.post('/api/users/cleo/follow').expect(200);
  await cleo.agent.post('/api/users/ada/follow').expect(200);

  await Presence.create({ user: cleo.id, room: 'wing:abc:0', label: 'Spring Bloom, room 1', link: '/museum/abc' });
  const list = await ada.agent.get('/api/friends').expect(200);
  // Friends in the museum come first
  assert.deepEqual(list.body.friends.map((f) => f.user.displayName), ['Cleo', 'Ben']);
  assert.deepEqual(list.body.friends[0].online, { label: 'Spring Bloom, room 1', link: '/museum/abc' });
  assert.equal(list.body.friends[1].online, null);

  await anonymiseUser(cleo.id);
  assert.equal(await Follow.countDocuments({ $or: [{ follower: cleo.id }, { following: cleo.id }] }), 0);
  const after2 = await ada.agent.get('/api/friends').expect(200);
  assert.deepEqual(after2.body.friends.map((f) => f.user.displayName), ['Ben']);
});
