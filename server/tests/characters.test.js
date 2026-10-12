const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const h = require('./helpers.js');
const Application = require('../models/Application.js');
const Character = require('../models/Character.js');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);

let app;
before(() => {
  app = h.makeApp();
});

async function createCharacter(agent, body = {}) {
  const res = await agent
    .post('/api/characters')
    .send({ name: 'Pip', species: 'Fox', ...body })
    .expect(201);
  return res.body.character;
}

// Pretends the character was offered in some event's sign-up form
function offerInApplication(userId, characterId, status = 'accepted') {
  return Application.create({
    event: new mongoose.Types.ObjectId(),
    user: userId,
    status,
    communityUsername: 'pip_owner',
    canCreate: ['art'],
    wantsTypes: ['art'],
    offeredCharacters: [characterId],
  });
}

test('guests cannot use the character library', async () => {
  const guest = h.request(app);
  const list = await guest.get('/api/characters').expect(401);
  assert.equal(list.body.code, 'AUTH_REQUIRED');
  await guest.post('/api/characters').send({ name: 'Pip' }).expect(401);
});

test('creating a character keeps only the allowed fields and cleans them up', async () => {
  const { agent, user } = await h.signUp(app);
  const other = new mongoose.Types.ObjectId().toString();

  const character = await createCharacter(agent, {
    name: '  Pip  ',
    description: 'A small fox who likes scarves.',
    species: 'Fox',
    tags: 'Fluffy,  feral , fluffy',
    referenceLinks: [
      { label: ' Toyhouse ', url: ' https://toyhou.se/123.pip ' },
      { label: 'blank row', url: '   ' },
      { label: '', url: '' },
    ],
    notesForArtists: 'Scarf is always red.',
    owner: other,
    archivedAt: new Date().toISOString(),
  });

  assert.equal(character.name, 'Pip');
  assert.equal(character.ownerId, user.id);
  assert.deepEqual(character.tags, ['fluffy', 'feral']);
  assert.deepEqual(character.referenceLinks, [{ label: 'Toyhouse', url: 'https://toyhou.se/123.pip' }]);
  assert.equal(character.notesForArtists, 'Scarf is always red.');
  assert.equal(character.archived, false);
  assert.equal(character.inUse, false);
  assert.equal(character.eventCount, 0);
  assert.equal(character._id, undefined);
});

test('character validation errors come back as 400 with a message', async () => {
  const { agent } = await h.signUp(app);

  const noName = await agent.post('/api/characters').send({ species: 'Fox' }).expect(400);
  assert.equal(noName.body.error, 'Give your character a name.');
  assert.equal(noName.body.code, 'VALIDATION');

  const badLink = await agent
    .post('/api/characters')
    .send({ name: 'Pip', referenceLinks: [{ label: 'refs', url: 'toyhou.se/pip' }] })
    .expect(400);
  assert.match(badLink.body.error, /http/);

  const tooLong = await agent.post('/api/characters').send({ name: 'x'.repeat(81) }).expect(400);
  assert.match(tooLong.body.error, /too long/);

  const notText = await agent.post('/api/characters').send({ name: { $gt: '' } }).expect(400);
  assert.equal(notText.body.code, 'VALIDATION');

  const links = Array.from({ length: 11 }, (_, i) => ({ url: `https://example.com/${i}` }));
  await agent.post('/api/characters').send({ name: 'Pip', referenceLinks: links }).expect(400);
  await agent.post('/api/characters').send({ name: 'Pip', referenceLinks: 'https://x.com' }).expect(400);

  assert.equal(await Character.countDocuments(), 0);
});

test('other people\'s characters and bad ids answer 404', async () => {
  const owner = await h.signUp(app);
  const stranger = await h.signUp(app);
  const character = await createCharacter(owner.agent);

  await owner.agent.get(`/api/characters/${character.id}`).expect(200);
  for (const res of [
    await stranger.agent.get(`/api/characters/${character.id}`),
    await stranger.agent.patch(`/api/characters/${character.id}`).send({ name: 'Mine now' }),
    await stranger.agent.delete(`/api/characters/${character.id}`),
    await stranger.agent.post(`/api/characters/${character.id}/archive`),
    await stranger.agent.post(`/api/characters/${character.id}/restore`),
    await owner.agent.get('/api/characters/not-an-id'),
    await owner.agent.get(`/api/characters/${new mongoose.Types.ObjectId()}`),
  ]) {
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'NOT_FOUND');
  }

  const stored = await Character.findById(character.id);
  assert.equal(stored.name, 'Pip');
  assert.equal(stored.archivedAt, null);

  const list = await stranger.agent.get('/api/characters').expect(200);
  assert.deepEqual(list.body.characters, []);
});

test('updating a character only touches editable fields', async () => {
  const { agent, user } = await h.signUp(app);
  const character = await createCharacter(agent, { tags: ['fox'] });

  const res = await agent
    .patch(`/api/characters/${character.id}`)
    .send({
      description: 'Now with a hat.',
      tags: ['Fox', 'Hat'],
      referenceLinks: [{ url: 'https://docs.google.com/document/d/abc' }],
      owner: new mongoose.Types.ObjectId().toString(),
      createdAt: '2000-01-01T00:00:00.000Z',
    })
    .expect(200);

  assert.equal(res.body.character.name, 'Pip');
  assert.equal(res.body.character.description, 'Now with a hat.');
  assert.deepEqual(res.body.character.tags, ['fox', 'hat']);
  assert.deepEqual(res.body.character.referenceLinks, [{ label: '', url: 'https://docs.google.com/document/d/abc' }]);
  assert.equal(res.body.character.ownerId, user.id);
  assert.notEqual(res.body.character.createdAt, '2000-01-01T00:00:00.000Z');

  const blank = await agent.patch(`/api/characters/${character.id}`).send({ name: '   ' }).expect(400);
  assert.equal(blank.body.error, 'Give your character a name.');
});

test('listing filters by archived state, newest first, with usage counts', async () => {
  const { agent, user } = await h.signUp(app);
  const first = await createCharacter(agent, { name: 'First' });
  const second = await createCharacter(agent, { name: 'Second' });
  const third = await createCharacter(agent, { name: 'Third' });

  await offerInApplication(user.id, second.id, 'accepted');
  await offerInApplication(user.id, second.id, 'withdrawn');
  await agent.post(`/api/characters/${third.id}/archive`).expect(200);
  // Touching the first one makes it the most recently updated
  await agent.patch(`/api/characters/${first.id}`).send({ description: 'Edited' }).expect(200);

  const active = await agent.get('/api/characters').expect(200);
  assert.deepEqual(active.body.characters.map((c) => c.name), ['First', 'Second']);
  const secondRow = active.body.characters.find((c) => c.id === second.id);
  assert.equal(secondRow.inUse, true);
  assert.equal(secondRow.eventCount, 2);
  assert.equal(active.body.characters[0].inUse, false);
  assert.equal(active.body.characters[0].eventCount, 0);

  const archived = await agent.get('/api/characters?archived=true').expect(200);
  assert.deepEqual(archived.body.characters.map((c) => c.name), ['Third']);
  assert.equal(archived.body.characters[0].archived, true);

  const all = await agent.get('/api/characters?archived=all').expect(200);
  assert.equal(all.body.characters.length, 3);

  const bad = await agent.get('/api/characters?archived=maybe').expect(400);
  assert.equal(bad.body.code, 'VALIDATION');
});

test('unused characters can be deleted, used ones only archived', async () => {
  const { agent, user } = await h.signUp(app);
  const unused = await createCharacter(agent, { name: 'Unused' });
  const used = await createCharacter(agent, { name: 'Used' });
  await offerInApplication(user.id, used.id, 'rejected');

  const ok = await agent.delete(`/api/characters/${unused.id}`).expect(200);
  assert.deepEqual(ok.body, { ok: true });
  assert.equal(await Character.exists({ _id: unused.id }), null);

  const blocked = await agent.delete(`/api/characters/${used.id}`).expect(409);
  assert.equal(blocked.body.code, 'CHARACTER_IN_USE');
  assert.equal(blocked.body.error, 'This character was offered in an event, so it can only be archived.');
  assert.ok(await Character.exists({ _id: used.id }));

  const fetched = await agent.get(`/api/characters/${used.id}`).expect(200);
  assert.equal(fetched.body.character.inUse, true);
  assert.equal(fetched.body.character.eventCount, 1);
});

test('archive and restore set and clear archivedAt', async () => {
  const { agent } = await h.signUp(app);
  const character = await createCharacter(agent);

  const archived = await agent.post(`/api/characters/${character.id}/archive`).expect(200);
  assert.equal(archived.body.character.archived, true);
  assert.ok(archived.body.character.archivedAt);

  // Archiving twice keeps the original timestamp
  const again = await agent.post(`/api/characters/${character.id}/archive`).expect(200);
  assert.equal(again.body.character.archivedAt, archived.body.character.archivedAt);

  const restored = await agent.post(`/api/characters/${character.id}/restore`).expect(200);
  assert.equal(restored.body.character.archived, false);
  assert.equal(restored.body.character.archivedAt, null);

  const list = await agent.get('/api/characters').expect(200);
  assert.deepEqual(list.body.characters.map((c) => c.id), [character.id]);
});
