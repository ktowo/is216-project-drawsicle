// Screen pets and character folders in the in-browser mock (same rules as the server)
import { beforeEach, expect, it } from 'vitest';
import { DEMO_PASSWORD } from '@shared/demo-data.mjs';
import { MAX_SHOWN_PETS } from '@shared/pets.mjs';
import { mockRequest, resetMockData, setMockLatency } from '../src/mock/index.js';

const call = (path, method = 'GET', body) => mockRequest(path, { method, body });

async function logIn(email) {
  const res = await call('/auth/login', 'POST', { email, password: DEMO_PASSWORD });
  expect(res.status).toBe(200);
}

beforeEach(() => {
  setMockLatency(0);
  resetMockData();
});

it('lists the pets someone has out and keeps to the limit', async () => {
  expect((await call('/characters/pets')).status).toBe(401);
  await logIn('mika@demo.test');

  const { data } = await call('/characters/pets');
  expect(data.pets.map((p) => p.name).sort()).toEqual(['Biscuit', 'Mochi', 'Pocket']);
  expect(data.pets.every((p) => p.pet.shown)).toBe(true);

  const { data: library } = await call('/characters');
  const resting = library.characters.filter((c) => !c.pet.shown);
  // One more fits, the next doesn't
  expect((await call(`/characters/${resting[0].id}`, 'PATCH', { pet: { shown: true } })).status).toBe(200);
  const tooMany = await call(`/characters/${resting[1].id}`, 'PATCH', { pet: { shown: true } });
  expect(tooMany.status).toBe(409);
  expect(tooMany.data.code).toBe('TOO_MANY_PETS');
  expect((await call('/characters/pets')).data.pets).toHaveLength(MAX_SHOWN_PETS);

  // Partial settings keep the rest; unknown kinds are refused
  const styled = await call(`/characters/${resting[0].id}`, 'PATCH', { pet: { kind: 'frog' } });
  expect(styled.data.character.pet).toEqual({ shown: true, kind: 'frog', palette: '' });
  expect((await call(`/characters/${resting[0].id}`, 'PATCH', { pet: { kind: 'unicorn' } })).status).toBe(400);

  // Archiving puts a pet away
  await call(`/characters/${resting[0].id}/archive`, 'POST');
  expect((await call('/characters/pets')).data.pets).toHaveLength(MAX_SHOWN_PETS - 1);
});

it('groups characters into folders and keeps colours tidy', async () => {
  await logIn('mika@demo.test');
  const { data } = await call('/characters/folders');
  expect(data.folders.map((f) => f.name)).toEqual(expect.arrayContaining(['Comfort crew', 'OCs', 'Story cast']));
  const comfort = data.folders.find((f) => f.name === 'Comfort crew');
  const inFolder = await call(`/characters?folder=${encodeURIComponent('Comfort crew')}`);
  expect(inFolder.data.characters).toHaveLength(comfort.count);

  const made = await call('/characters', 'POST', { name: 'Swatch', colours: ['#FFAA00', '#ffaa00', '#123456'], folder: ' WIP ' });
  expect(made.status).toBe(201);
  expect(made.data.character.colours).toEqual(['#ffaa00', '#123456']);
  expect(made.data.character.folder).toBe('WIP');
  expect((await call('/characters', 'POST', { name: 'Bad', colours: ['orange'] })).status).toBe(400);
});
