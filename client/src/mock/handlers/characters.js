// /characters: my private character library (server/routes/character-router.js)
import { newId } from '../db.js';
import { characterPublic, characterUsage, characterWithUsage } from '../model.js';
import { httpError, invalid, readCharacterInput } from '../util.js';

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

const recentFirst = (a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)) || b.id.localeCompare(a.id);

export function register(router) {
  router.get('/characters', (ctx) => {
    const user = ctx.requireAuth();
    const archived = ctx.query.archived === undefined ? 'false' : String(ctx.query.archived);
    if (!['false', 'true', 'all'].includes(archived)) throw invalid('archived must be false, true or all.');

    const characters = ctx.state.characters
      .filter((c) => c.owner === user.id)
      .filter((c) => (archived === 'all' ? true : archived === 'true' ? Boolean(c.archivedAt) : !c.archivedAt))
      .sort(recentFirst)
      .map((c) => characterWithUsage(ctx.state, c));
    return { characters };
  });

  router.post('/characters', (ctx) => {
    const user = ctx.requireAuth();
    const character = buildCharacter(readCharacterInput(ctx.body), user.id, ctx.now);
    ctx.state.characters.push(character);
    ctx.status = 201;
    return { character: characterPublic(character, { inUse: false, eventCount: 0 }) };
  });

  router.get('/characters/:id', (ctx) => {
    const user = ctx.requireAuth();
    return { character: characterWithUsage(ctx.state, findOwn(ctx, user)) };
  });

  router.patch('/characters/:id', (ctx) => {
    const user = ctx.requireAuth();
    const character = findOwn(ctx, user);
    const input = readCharacterInput(ctx.body);
    if (input.name !== undefined && !input.name) throw invalid('Give your character a name.');
    Object.assign(character, input, { updatedAt: ctx.now.toISOString() });
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
