// /characters: my private character library (server/routes/character-router.js)
import { newId } from '../db.js';
import { characterPublic, characterUsage, characterWithUsage } from '../model.js';
import { httpError, invalid, readCharacterInput } from '../util.js';
import { MAX_SHOWN_PETS } from '@shared/pets.mjs';

const notFound = () => httpError(404, 'Character not found.', 'NOT_FOUND');

// A new character row from checked input. Shared with the sign-up form, which can add characters.
export function buildCharacter(input, ownerId, now) {
  if (!input.name) throw invalid('Give your character a name.');
  const at = now.toISOString();
  return {
    id: newId(),
    owner: ownerId,
    name: input.name,
    description: input.description || '',
    species: input.species || '',
    tags: input.tags || [],
    referenceLinks: input.referenceLinks || [],
    notesForArtists: input.notesForArtists || '',
    contentWarnings: input.contentWarnings || [],
    pronouns: input.pronouns || '',
    personality: input.personality || '',
    colours: input.colours || [],
    folder: input.folder || '',
    favourite: Boolean(input.favourite),
    pet: { shown: false, kind: '', palette: '', ...(input.pet || {}) },
    archivedAt: null,
    createdAt: at,
    updatedAt: at,
  };
}

// Someone else's character looks exactly like a missing one
function findOwn(ctx, user) {
  const character = ctx.state.characters.find((c) => c.id === ctx.params.id && c.owner === user.id);
  if (!character) throw notFound();
  return character;
}

// The events this character was offered in, newest sign-up first
function usedIn(state, character) {
  return state.applications
    .filter((a) => a.offeredCharacters.includes(character.id))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id.localeCompare(a.id))
    .map((a) => ({ application: a, event: state.events.find((e) => e.id === a.event) }))
    .filter((row) => row.event)
    .map(({ application, event }) => ({
      eventId: event.id,
      eventName: event.name,
      eventStatus: event.status,
      applicationStatus: application.status,
    }));
}

// Same limit as the server's Character model
function checkPetRoom(state, character) {
  if (!character.pet?.shown) return;
  const others = state.characters.filter(
    (c) => c.owner === character.owner && c.id !== character.id && !c.archivedAt && c.pet?.shown
  ).length;
  if (others >= MAX_SHOWN_PETS) {
    throw httpError(409, `You can have up to ${MAX_SHOWN_PETS} pets out at once. Tuck one away first.`, 'TOO_MANY_PETS');
  }
}

const recentFirst = (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)) || b.id.localeCompare(a.id);

export function register(router) {
  router.get('/characters', (ctx) => {
    const user = ctx.requireAuth();
    const archived = ctx.query.archived === undefined ? 'false' : String(ctx.query.archived);
    if (!['false', 'true', 'all'].includes(archived)) throw invalid('archived must be false, true or all.');

    const folder = typeof ctx.query.folder === 'string' ? ctx.query.folder.trim() : null;
    const characters = ctx.state.characters
      .filter((c) => c.owner === user.id)
      .filter((c) => folder === null || (c.folder || '') === folder)
      .filter((c) => (archived === 'all' ? true : archived === 'true' ? Boolean(c.archivedAt) : !c.archivedAt))
      .sort(recentFirst)
      .map((c) => characterWithUsage(ctx.state, c));
    return { characters };
  });

  router.get('/characters/pets', (ctx) => {
    const user = ctx.requireAuth();
    const pets = ctx.state.characters
      .filter((c) => c.owner === user.id && !c.archivedAt && c.pet?.shown)
      .sort(recentFirst)
      .slice(0, MAX_SHOWN_PETS)
      .map((c) => characterPublic(c));
    return { pets };
  });

  router.get('/characters/folders', (ctx) => {
    const user = ctx.requireAuth();
    const counts = new Map();
    for (const c of ctx.state.characters) {
      if (c.owner !== user.id || c.archivedAt || !c.folder) continue;
      counts.set(c.folder, (counts.get(c.folder) || 0) + 1);
    }
    const folders = [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => (a.name < b.name ? -1 : 1));
    return { folders };
  });

  router.post('/characters', (ctx) => {
    const user = ctx.requireAuth();
    const character = buildCharacter(readCharacterInput(ctx.body), user.id, ctx.now);
    checkPetRoom(ctx.state, character);
    ctx.state.characters.push(character);
    ctx.status = 201;
    return { character: characterPublic(character, { inUse: false, eventCount: 0 }) };
  });

  router.get('/characters/:id', (ctx) => {
    const user = ctx.requireAuth();
    const character = findOwn(ctx, user);
    return { character: { ...characterWithUsage(ctx.state, character), usedIn: usedIn(ctx.state, character) } };
  });

  router.patch('/characters/:id', (ctx) => {
    const user = ctx.requireAuth();
    const character = findOwn(ctx, user);
    const input = readCharacterInput(ctx.body);
    if (input.name !== undefined && !input.name) throw invalid('Give your character a name.');
    if (character.archivedAt && input.pet?.shown) {
      throw invalid('Archived characters can’t be out as pets. Restore it first.');
    }
    const { pet, ...rest } = input;
    const nextPet = { shown: false, kind: '', palette: '', ...(character.pet || {}), ...(pet || {}) };
    if (nextPet.shown && !character.pet?.shown) checkPetRoom(ctx.state, { ...character, pet: nextPet });
    Object.assign(character, rest, { pet: nextPet, updatedAt: ctx.now.toISOString() });
    return { character: characterWithUsage(ctx.state, character) };
  });

  router.delete('/characters/:id', (ctx) => {
    const user = ctx.requireAuth();
    const character = findOwn(ctx, user);
    // Organisers and matched artists may still need it for past events
    if (characterUsage(ctx.state, character.id) > 0) {
      throw httpError(409, 'This character was offered in an event, so it can only be archived.', 'CHARACTER_IN_USE');
    }
    ctx.state.characters = ctx.state.characters.filter((c) => c !== character);
    return { ok: true };
  });

  router.post('/characters/:id/archive', (ctx) => {
    const user = ctx.requireAuth();
    const character = findOwn(ctx, user);
    if (!character.archivedAt) {
      character.archivedAt = ctx.now.toISOString();
      character.updatedAt = character.archivedAt;
      // Archived characters go back in their box
      if (character.pet) character.pet.shown = false;
    }
    return { character: characterWithUsage(ctx.state, character) };
  });

  router.post('/characters/:id/restore', (ctx) => {
    const user = ctx.requireAuth();
    const character = findOwn(ctx, user);
    if (character.archivedAt) {
      character.archivedAt = null;
      character.updatedAt = ctx.now.toISOString();
    }
    return { character: characterWithUsage(ctx.state, character) };
  });
}
