const { Router } = require('express');
const mongoose = require('mongoose');
const Character = require('../models/Character.js');
const Application = require('../models/Application.js');
const { requireAuth } = require('../middleware/auth.js');
const { LIMITS, normalizeTags, CONTENT_WARNING_VALUES, REFERENCE_URL_RE } = require('../../shared/constants.mjs');
const { PET_KIND_VALUES, PET_PALETTE_VALUES, MAX_SHOWN_PETS } = require('../../shared/pets.mjs');
const { asyncHandler, apiErrorHandler, httpError } = require('../utils/helpers.js');

const router = Router();
router.use(requireAuth);

const TEXT_FIELDS = {
  name: { label: 'Name', max: LIMITS.characterName },
  description: { label: 'Description', max: LIMITS.characterDescription },
  species: { label: 'Species', max: LIMITS.species },
  notesForArtists: { label: 'Notes for artists', max: LIMITS.notesForArtists },
  pronouns: { label: 'Pronouns', max: LIMITS.pronouns },
  personality: { label: 'Personality', max: LIMITS.personality },
  folder: { label: 'Folder', max: LIMITS.folder },
};
const HEX_RE = /^#[0-9a-f]{6}$/;
const LINK_LABEL_MAX = LIMITS.linkLabel;
const LINK_URL_MAX = 500;
const URL_RE = REFERENCE_URL_RE;

function readText(value, label, max) {
  if (value === null) return '';
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw httpError(400, `${label} must be text.`, 'VALIDATION');
  }
  const text = String(value).trim();
  if (text.length > max) throw httpError(400, `${label} is too long (max ${max} characters).`, 'VALIDATION');
  return text;
}

// Rows with an empty url are dropped, so the form can send blank rows.
function readLinks(value) {
  if (value === null) return [];
  if (!Array.isArray(value)) throw httpError(400, 'Reference links must be a list.', 'VALIDATION');
  const links = [];
  for (const row of value) {
    const raw = typeof row === 'string' ? { url: row } : row;
    if (!raw || typeof raw !== 'object') continue;
    const url = typeof raw.url === 'string' ? raw.url.trim() : '';
    if (!url) continue;
    const label = typeof raw.label === 'string' ? raw.label.trim() : '';
    if (url.length > LINK_URL_MAX) throw httpError(400, 'One of the reference links is too long.', 'VALIDATION');
    if (!URL_RE.test(url)) {
      throw httpError(400, 'Reference links must start with http:// or https://', 'VALIDATION');
    }
    if (label.length > LINK_LABEL_MAX) {
      throw httpError(400, `Link labels can be up to ${LINK_LABEL_MAX} characters.`, 'VALIDATION');
    }
    const note = typeof raw.note === 'string' ? raw.note.trim() : '';
    if (note.length > LIMITS.linkNote) {
      throw httpError(400, `Link comments can be up to ${LIMITS.linkNote} characters.`, 'VALIDATION');
    }
    links.push({ label, url, note });
  }
  if (links.length > LIMITS.referenceLinks) {
    throw httpError(400, `Up to ${LIMITS.referenceLinks} reference links.`, 'VALIDATION');
  }
  return links;
}

function readColours(value) {
  if (value === null) return [];
  if (!Array.isArray(value)) throw httpError(400, 'Colours must be a list.', 'VALIDATION');
  const colours = [];
  for (const raw of value) {
    const hex = String(raw ?? '').trim().toLowerCase();
    if (!HEX_RE.test(hex)) throw httpError(400, 'Colours must look like #ff99cc.', 'VALIDATION');
    if (!colours.includes(hex)) colours.push(hex);
  }
  if (colours.length > LIMITS.colours) throw httpError(400, `Up to ${LIMITS.colours} colours.`, 'VALIDATION');
  return colours;
}

// { shown, kind, palette }: any of them; kind/palette '' means automatic
function readPet(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw httpError(400, 'Pet settings are missing.', 'VALIDATION');
  }
  const pet = {};
  if (value.shown !== undefined) pet.shown = value.shown === true;
  if (value.kind !== undefined) {
    if (value.kind !== '' && !PET_KIND_VALUES.includes(value.kind)) {
      throw httpError(400, 'Pick a kind of pet from the list.', 'VALIDATION');
    }
    pet.kind = value.kind;
  }
  if (value.palette !== undefined) {
    if (value.palette !== '' && !PET_PALETTE_VALUES.includes(value.palette)) {
      throw httpError(400, 'Pick pet colours from the list.', 'VALIDATION');
    }
    pet.palette = value.palette;
  }
  return pet;
}

// Only these fields can be set from a request. Also used by the sign-up form
// (application-router) for characters created while applying.
function readCharacterInput(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw httpError(400, 'Character details are missing.', 'VALIDATION');
  }
  const input = {};
  for (const [key, { label, max }] of Object.entries(TEXT_FIELDS)) {
    if (body[key] !== undefined) input[key] = readText(body[key], label, max);
  }
  // normalizeTags splits "fox, feral" strings, which a plain [String] cast wouldn't
  if (body.tags !== undefined) input.tags = normalizeTags(body.tags ?? []);
  if (body.referenceLinks !== undefined) input.referenceLinks = readLinks(body.referenceLinks);
  if (body.contentWarnings !== undefined) {
    const list = body.contentWarnings ?? [];
    if (!Array.isArray(list) || list.some((w) => !CONTENT_WARNING_VALUES.includes(w))) {
      throw httpError(400, 'Pick content warnings from the list.', 'VALIDATION');
    }
    input.contentWarnings = [...new Set(list)];
  }
  if (body.colours !== undefined) input.colours = readColours(body.colours);
  if (body.favourite !== undefined) input.favourite = body.favourite === true;
  if (body.pet !== undefined) input.pet = readPet(body.pet);
  return input;
}

const notFound = () => httpError(404, 'Character not found.', 'NOT_FOUND');

// Someone else's character looks exactly like a missing one.
async function findOwnCharacter(req) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw notFound();
  const character = await Character.findOne({ _id: id, owner: req.user._id });
  if (!character) throw notFound();
  return character;
}

// Map(characterId -> number of applications that offered it), one query for any number of characters
async function usageCounts(characterIds) {
  if (!characterIds.length) return new Map();
  const rows = await Application.aggregate([
    { $match: { offeredCharacters: { $in: characterIds } } },
    { $unwind: '$offeredCharacters' },
    { $match: { offeredCharacters: { $in: characterIds } } },
    { $group: { _id: '$offeredCharacters', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [r._id.toString(), r.count]));
}

async function withUsage(character) {
  const eventCount = await Application.countDocuments({ offeredCharacters: character._id });
  return character.toPublic({ inUse: eventCount > 0, eventCount });
}

router.get('/', asyncHandler(async (req, res) => {
  const archived = req.query.archived === undefined ? 'false' : String(req.query.archived);
  if (!['false', 'true', 'all'].includes(archived)) {
    throw httpError(400, 'archived must be false, true or all.', 'VALIDATION');
  }

  const filter = { owner: req.user._id };
  if (typeof req.query.folder === 'string') filter.folder = req.query.folder.trim();
  if (archived === 'false') filter.archivedAt = null;
  if (archived === 'true') filter.archivedAt = { $ne: null };

  const characters = await Character.find(filter).sort({ updatedAt: -1, _id: -1 });
  const usage = await usageCounts(characters.map((c) => c._id));
  res.json({
    characters: characters.map((c) => {
      const eventCount = usage.get(c._id.toString()) || 0;
      return c.toPublic({ inUse: eventCount > 0, eventCount });
    }),
  });
}));

// The screen pets someone has out (client/src/components/pets)
router.get('/pets', asyncHandler(async (req, res) => {
  const pets = await Character.find({ owner: req.user._id, archivedAt: null, 'pet.shown': true })
    .sort({ updatedAt: -1, _id: -1 })
    .limit(MAX_SHOWN_PETS);
  res.json({ pets: pets.map((c) => c.toPublic()) });
}));

// Folder names in use, with how many (unarchived) characters are in each
router.get('/folders', asyncHandler(async (req, res) => {
  const rows = await Character.aggregate([
    { $match: { owner: req.user._id, archivedAt: null, folder: { $nin: ['', null] } } },
    { $group: { _id: '$folder', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  res.json({ folders: rows.map((r) => ({ name: r._id, count: r.count })) });
}));

// Pets can't be switched on for an archived character
function rejectArchivedPet(character, input) {
  if (character.archivedAt && input.pet?.shown) {
    throw httpError(400, 'Archived characters can’t be out as pets. Restore it first.', 'VALIDATION');
  }
}

// Partial pet settings ({ shown } alone, say) are merged into the saved ones
function applyInput(character, input) {
  const { pet, ...rest } = input;
  character.set(rest);
  if (pet) {
    for (const [key, value] of Object.entries(pet)) character.set(`pet.${key}`, value);
  }
}

router.post('/', asyncHandler(async (req, res) => {
  const character = new Character({ ...readCharacterInput(req.body), owner: req.user._id });
  await character.save();
  res.status(201).json({ character: character.toPublic({ inUse: false, eventCount: 0 }) });
}));

// The events this character was offered in, newest sign-up first
async function usedIn(character) {
  const applications = await Application.find({ offeredCharacters: character._id })
    .sort({ createdAt: -1, _id: -1 })
    .populate('event', 'name status');
  return applications
    .filter((a) => a.event)
    .map((a) => ({
      eventId: a.event._id.toString(),
      eventName: a.event.name,
      eventStatus: a.event.status,
      applicationStatus: a.status,
    }));
}

router.get('/:id', asyncHandler(async (req, res) => {
  const character = await findOwnCharacter(req);
  const json = await withUsage(character);
  res.json({ character: { ...json, usedIn: await usedIn(character) } });
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const character = await findOwnCharacter(req);
  const input = readCharacterInput(req.body);
  rejectArchivedPet(character, input);
  applyInput(character, input);
  await character.save();
  res.json({ character: await withUsage(character) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const character = await findOwnCharacter(req);
  // Organisers and matched artists may still need it for past events
  if (await Application.exists({ offeredCharacters: character._id })) {
    throw httpError(409, 'This character was offered in an event, so it can only be archived.', 'CHARACTER_IN_USE');
  }
  await character.deleteOne();
  res.json({ ok: true });
}));

router.post('/:id/archive', asyncHandler(async (req, res) => {
  const character = await findOwnCharacter(req);
  if (!character.archivedAt) {
    character.archivedAt = new Date();
    await character.save();
  }
  res.json({ character: await withUsage(character) });
}));

router.post('/:id/restore', asyncHandler(async (req, res) => {
  const character = await findOwnCharacter(req);
  if (character.archivedAt) {
    character.archivedAt = null;
    await character.save();
  }
  res.json({ character: await withUsage(character) });
}));

router.use(apiErrorHandler);

module.exports = router;
module.exports.readCharacterInput = readCharacterInput;
