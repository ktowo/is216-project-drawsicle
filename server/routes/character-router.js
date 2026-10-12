const { Router } = require('express');
const mongoose = require('mongoose');
const Character = require('../models/Character.js');
const Application = require('../models/Application.js');
const { requireAuth } = require('../middleware/auth.js');
const { LIMITS, normalizeTags } = require('../../shared/constants.mjs');
const { asyncHandler, apiErrorHandler, httpError } = require('../utils/helpers.js');

const router = Router();
router.use(requireAuth);

const TEXT_FIELDS = {
  name: { label: 'Name', max: LIMITS.characterName },
  description: { label: 'Description', max: LIMITS.characterDescription },
  species: { label: 'Species', max: LIMITS.species },
  notesForArtists: { label: 'Notes for artists', max: LIMITS.notesForArtists },
};
const LINK_LABEL_MAX = 60;
const LINK_URL_MAX = 500;
const URL_RE = /^https?:\/\/\S+$/i;

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
    links.push({ label, url });
  }
  if (links.length > LIMITS.referenceLinks) {
    throw httpError(400, `Up to ${LIMITS.referenceLinks} reference links.`, 'VALIDATION');
  }
  return links;
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
  character.set(readCharacterInput(req.body));
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
