const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');
const { MAX_SHOWN_PETS } = require('../../shared/pets.mjs');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);

const make = (agent, body) => agent.post('/api/characters').send({ name: 'Sprout', species: 'cat', ...body });

test('characters keep pronouns, personality, colours, folder and favourite', async () => {
  const app = h.makeApp();
  const { agent } = await h.signUp(app);
  const res = await make(agent, {
    pronouns: 'she/her',
    personality: 'Shy but brave when it counts.',
    colours: ['#FFAA00', '#ffaa00', '#335577'],
    folder: '  OCs ',
    favourite: true,
  }).expect(201);
  const c = res.body.character;
  assert.equal(c.pronouns, 'she/her');
  assert.equal(c.personality, 'Shy but brave when it counts.');
  assert.deepEqual(c.colours, ['#ffaa00', '#335577']); // lower case, no repeats
  assert.equal(c.folder, 'OCs');
  assert.equal(c.favourite, true);
  assert.deepEqual(c.pet, { shown: false, kind: '', palette: '' });

  await make(agent, { colours: ['orange'] }).expect(400);
  await make(agent, { colours: Array.from({ length: 7 }, (_, i) => `#00000${i}`) }).expect(400);
  await make(agent, { pronouns: 'x'.repeat(41) }).expect(400);
});

test('pets: settings, the limit of four, and the pets list', async () => {
  const app = h.makeApp();
  const { agent } = await h.signUp(app);
  const ids = [];
  for (let i = 0; i < MAX_SHOWN_PETS; i++) {
    const res = await make(agent, { name: `Pet ${i}`, pet: { shown: true } }).expect(201);
    ids.push(res.body.character.id);
  }
  const extra = await make(agent, { name: 'One too many' }).expect(201);
  const tooMany = await agent.patch(`/api/characters/${extra.body.character.id}`).send({ pet: { shown: true } }).expect(409);
  assert.equal(tooMany.body.code, 'TOO_MANY_PETS');
  await make(agent, { name: 'Also too many', pet: { shown: true } }).expect(409);

  // Partial pet settings keep the rest
  const styled = await agent.patch(`/api/characters/${ids[0]}`).send({ pet: { kind: 'dragon', palette: 'lilac' } }).expect(200);
  assert.deepEqual(styled.body.character.pet, { shown: true, kind: 'dragon', palette: 'lilac' });
  await agent.patch(`/api/characters/${ids[0]}`).send({ pet: { kind: 'unicorn' } }).expect(400);
  await agent.patch(`/api/characters/${ids[0]}`).send({ pet: { palette: 'rainbow' } }).expect(400);

  const list = await agent.get('/api/characters/pets').expect(200);
  assert.equal(list.body.pets.length, MAX_SHOWN_PETS);

  // Archiving puts the pet away, and an archived character can't be brought out
  await agent.post(`/api/characters/${ids[1]}/archive`).expect(200);
  const after = await agent.get('/api/characters/pets').expect(200);
  assert.equal(after.body.pets.length, MAX_SHOWN_PETS - 1);
  await agent.patch(`/api/characters/${ids[1]}`).send({ pet: { shown: true } }).expect(400);
  // ...which frees a slot for someone else
  await agent.patch(`/api/characters/${extra.body.character.id}`).send({ pet: { shown: true } }).expect(200);

  await h.request(app).get('/api/characters/pets').expect(401);
});

test('pets and folders only ever show your own characters', async () => {
  const app = h.makeApp();
  const mine = await h.signUp(app);
  const theirs = await h.signUp(app);
  await make(mine.agent, { name: 'Mine', folder: 'OCs', pet: { shown: true } }).expect(201);
  await make(mine.agent, { name: 'Also mine', folder: 'OCs' }).expect(201);
  await make(mine.agent, { name: 'Adopt', folder: 'Adopts' }).expect(201);
  await make(theirs.agent, { name: 'Theirs', folder: 'Secret', pet: { shown: true } }).expect(201);

  const pets = await mine.agent.get('/api/characters/pets').expect(200);
  assert.deepEqual(pets.body.pets.map((p) => p.name), ['Mine']);
  const folders = await mine.agent.get('/api/characters/folders').expect(200);
  assert.deepEqual(folders.body.folders, [{ name: 'Adopts', count: 1 }, { name: 'OCs', count: 2 }]);
  const inFolder = await mine.agent.get('/api/characters?folder=OCs').expect(200);
  assert.deepEqual(inFolder.body.characters.map((c) => c.name).sort(), ['Also mine', 'Mine']);
});
