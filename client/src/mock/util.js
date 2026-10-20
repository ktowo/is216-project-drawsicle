// Small helpers shared by the mock handlers: errors, input reading, dates.
import { LIMITS, normalizeTags, CONTENT_WARNING_VALUES, REFERENCE_URL_RE } from '@shared/constants.mjs';
import { PET_KIND_VALUES, PET_PALETTE_VALUES } from '@shared/pets.mjs';

const HEX_RE = /^#[0-9a-f]{6}$/;

// Same default codes as server/utils/helpers.js
const DEFAULT_CODES = {
  400: 'VALIDATION',
  401: 'AUTH_REQUIRED',
  403: 'ACCESS_DENIED',
  404: 'NOT_FOUND',
};

// extra: more fields for the error body, like the server's { reason: 'expired' }
export class MockHttpError extends Error {
  constructor(status, message, code, extra = null) {
    super(message);
    this.status = status;
    this.code = code || DEFAULT_CODES[status];
    this.extra = extra;
  }
}

export const httpError = (status, message, code, extra) => new MockHttpError(status, message, code, extra);
export const invalid = (message) => httpError(400, message, 'VALIDATION');

export const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export const URL_RE = /^https?:\/\/\S+$/i;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function readText(value, label, max) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' && typeof value !== 'number') throw invalid(`${label} must be text.`);
  const text = String(value).trim();
  if (text.length > max) throw invalid(`${label} is too long (max ${max} characters).`);
  return text;
}

export function readList(value, label) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(',');
  throw invalid(`${label} must be a list.`);
}

export function readBoolean(value, label) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw invalid(`${label} must be true or false.`);
}

// [{ label, url }] rows; rows with an empty url are dropped so forms can send blank rows.
// reference: character reference links, which also take the demo's own pictures and a comment
export function readLinks(value, { max, what = 'Links', labelMax = 60, urlMax = 500, reference = false } = {}) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw invalid(`${what} must be a list.`);
  const links = [];
  for (const row of value) {
    const raw = typeof row === 'string' ? { url: row } : row;
    if (!isPlainObject(raw)) continue;
    const url = typeof raw.url === 'string' ? raw.url.trim() : '';
    if (!url) continue;
    const label = typeof raw.label === 'string' ? raw.label.trim() : '';
    if (url.length > urlMax) throw invalid(`One of the ${what.toLowerCase()} is too long.`);
    if (!(reference ? REFERENCE_URL_RE : URL_RE).test(url)) throw invalid(`${what} must start with http:// or https://`);
    if (label.length > labelMax) throw invalid(`Link labels can be up to ${labelMax} characters.`);
    if (!reference) {
      links.push({ label, url });
      continue;
    }
    const note = typeof raw.note === 'string' ? raw.note.trim() : '';
    if (note.length > LIMITS.linkNote) throw invalid(`Link comments can be up to ${LIMITS.linkNote} characters.`);
    links.push({ label, url, note });
  }
  if (max !== undefined && links.length > max) throw invalid(`Up to ${max} ${what.toLowerCase()}.`);
  return links;
}

// Character fields from a request (library form or new characters on a sign-up)
export function readCharacterInput(body) {
  if (!isPlainObject(body)) throw invalid('Character details are missing.');
  const input = {};
  const fields = {
    name: ['Name', LIMITS.characterName],
    description: ['Description', LIMITS.characterDescription],
    species: ['Species', LIMITS.species],
    notesForArtists: ['Notes for artists', LIMITS.notesForArtists],
    pronouns: ['Pronouns', LIMITS.pronouns],
    personality: ['Personality', LIMITS.personality],
    folder: ['Folder', LIMITS.folder],
  };
  for (const [key, [label, max]] of Object.entries(fields)) {
    if (body[key] !== undefined) input[key] = readText(body[key], label, max);
  }
  if (body.tags !== undefined) input.tags = normalizeTags(body.tags ?? []);
  if (body.referenceLinks !== undefined) {
    input.referenceLinks = readLinks(body.referenceLinks, { max: LIMITS.referenceLinks, what: 'Reference links', reference: true });
  }
  if (body.contentWarnings !== undefined) {
    const list = body.contentWarnings ?? [];
    if (!Array.isArray(list) || list.some((w) => !CONTENT_WARNING_VALUES.includes(w))) {
      throw invalid('Pick content warnings from the list.');
    }
    input.contentWarnings = [...new Set(list)];
  }
  if (body.colours !== undefined) {
    if (body.colours !== null && !Array.isArray(body.colours)) throw invalid('Colours must be a list.');
    const colours = [];
    for (const raw of body.colours || []) {
      const hex = String(raw ?? '').trim().toLowerCase();
      if (!HEX_RE.test(hex)) throw invalid('Colours must look like #ff99cc.');
      if (!colours.includes(hex)) colours.push(hex);
    }
    if (colours.length > LIMITS.colours) throw invalid(`Up to ${LIMITS.colours} colours.`);
    input.colours = colours;
  }
  if (body.favourite !== undefined) input.favourite = body.favourite === true;
  if (body.pet !== undefined) {
    if (!isPlainObject(body.pet)) throw invalid('Pet settings are missing.');
    const pet = {};
    if (body.pet.shown !== undefined) pet.shown = body.pet.shown === true;
    if (body.pet.kind !== undefined) {
      if (body.pet.kind !== '' && !PET_KIND_VALUES.includes(body.pet.kind)) throw invalid('Pick a kind of pet from the list.');
      pet.kind = body.pet.kind;
    }
    if (body.pet.palette !== undefined) {
      if (body.pet.palette !== '' && !PET_PALETTE_VALUES.includes(body.pet.palette)) throw invalid('Pick pet colours from the list.');
      pet.palette = body.pet.palette;
    }
    input.pet = pet;
  }
  return input;
}

export const nowIso = () => new Date().toISOString();
export const toMs = (value) => (value ? new Date(value).getTime() : NaN);

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// "in 2 days", "in 5 hours", "in under an hour" (same wording as services/reminders.js)
export function timeLeft(deadline, now) {
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const ms = toMs(deadline) - now.getTime();
  if (ms >= 2 * DAY) return `in ${Math.floor(ms / DAY)} days`;
  if (ms >= DAY) return 'in 1 day';
  if (ms >= 2 * HOUR) return `in ${Math.floor(ms / HOUR)} hours`;
  if (ms >= HOUR) return 'in 1 hour';
  return 'in under an hour';
}

export function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Same wording as server/routes/auth-router.js
export function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 128) return 'Password is too long.';
  return null;
}

// Date text used inside notifications, matching the server's formatting
export function formatDate(date) {
  return new Date(date).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

export function formatDay(date) {
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// A single string from the query (repeated keys already collapse to the first one)
export function queryParam(query, key) {
  const value = query[key];
  return typeof value === 'string' ? value.trim() : '';
}

export const byName = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' });
