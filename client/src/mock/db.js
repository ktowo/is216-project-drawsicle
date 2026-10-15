// Storage for mock mode. The whole "database" is one JSON document in localStorage,
// seeded from shared/demo-data.mjs the first time it's needed. Without localStorage
// (vitest, private windows that block it) it lives in memory instead.
//
// Passwords are kept as plain strings here on purpose: mock mode only ever holds the
// fake demo accounts plus whatever someone types into the demo, and never leaves the
// browser. The real server hashes them with bcrypt.
import { buildDemoData, DEMO_PASSWORD } from '@shared/demo-data.mjs';
import { demoArtDataUrl } from '@shared/demo-art.mjs';

export const STATE_KEY = 'drawsicle-mock-v1';
export const SESSION_KEY = 'drawsicle-mock-session';
const STATE_VERSION = 1;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// ---------- Key/value storage ----------

const memory = new Map();
const memoryStore = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
};

function pickStore() {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return memoryStore;
    const probe = '__drawsicle_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return memoryStore;
  }
}

let store = null;
const kv = () => (store ||= pickStore());

// ---------- Ids ----------

// 24 hex characters like a MongoDB ObjectId, so ids look the same in both modes
export function newId() {
  const seconds = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  let rest = '';
  if (globalThis.crypto?.getRandomValues) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(8));
    for (const b of bytes) rest += b.toString(16).padStart(2, '0');
  } else {
    for (let i = 0; i < 16; i++) rest += Math.floor(Math.random() * 16).toString(16);
  }
  return seconds + rest;
}

export const isId = (value) => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);

export function randomCode(length = 11) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  const bytes = globalThis.crypto?.getRandomValues
    ? globalThis.crypto.getRandomValues(new Uint8Array(length))
    : Array.from({ length }, () => Math.floor(Math.random() * 256));
  for (const b of bytes) out += chars[b % chars.length];
  return out;
}

// ---------- Seeding ----------

const iso = (date) => (date ? new Date(date).toISOString() : null);

const SOCIAL_KEYS = ['twitter', 'instagram', 'bluesky', 'discord', 'deviantart', 'toyhouse', 'tumblr'];

export function emptySocials() {
  return Object.fromEntries(SOCIAL_KEYS.map((key) => [key, '']));
}

export function buildState(now = new Date()) {
  const demo = buildDemoData(now);
  const nowMs = now.getTime();
  const ids = {};
  const idFor = (kind, key) => (ids[`${kind}:${key}`] ||= newId());

  const users = demo.users.map((u, i) => ({
    id: idFor('user', u.key),
    email: u.email,
    password: DEMO_PASSWORD,
    username: u.username,
    role: u.role || 'user',
    status: 'active',
    deactivatedAt: null,
    sessionVersion: 0,
    displayName: u.displayName,
    avatarUrl: null,
    bio: u.bio || '',
    socials: { ...emptySocials(), ...(u.socials || {}) },
    defaultForm: {
      communityUsername: '',
      canCreate: [],
      wantsTypes: [],
      likes: '',
      avoid: '',
      cannotDraw: [],
      ...(u.defaultForm || {}),
    },
    notificationPrefs: { emailReminders: true, emailMatches: true, emailEventUpdates: false },
    profilePrivacy: { showExchanges: true, showGifts: false, ...(u.profilePrivacy || {}) },
    createdAt: iso(nowMs - (200 - i * 7) * DAY),
    updatedAt: iso(nowMs - (30 - i) * DAY),
  }));

  const characters = demo.characters.map((c, i) => ({
    id: idFor('character', c.key),
    owner: idFor('user', c.owner),
    name: c.name,
    description: c.description || '',
    species: c.species || '',
    tags: [...(c.tags || [])],
    referenceLinks: (c.referenceLinks || []).map((l) => ({ label: l.label || '', url: l.url })),
    notesForArtists: c.notesForArtists || '',
    archivedAt: c.archived ? iso(nowMs - 40 * DAY) : null,
    createdAt: iso(nowMs - (150 - i * 3) * DAY),
    updatedAt: iso(nowMs - (60 - i) * DAY),
  }));

  const events = [];
  const members = [];
  const grant = (user, event, role, createdAt) => {
    let row = members.find((m) => m.user === user && m.event === event);
    if (!row) {
      row = { id: newId(), user, event, roles: [], createdAt };
      members.push(row);
    }
    if (!row.roles.includes(role)) row.roles.push(role);
  };

  for (const e of demo.events) {
    const id = idFor('event', e.key);
    const signup = new Date(e.signupDeadline).getTime();
    // Created a few weeks before sign-ups close, never in the future
    const createdMs = Math.min(signup - 21 * DAY, nowMs - 2 * HOUR);
    const history = [{ status: 'draft', at: iso(createdMs), by: idFor('user', e.createdBy) }];
    const step = (status, at, by = idFor('user', e.createdBy)) => history.push({ status, at: iso(at), by });
    if (e.status !== 'draft') step('open', createdMs + HOUR);
    if (['matching', 'active', 'completed'].includes(e.status)) step('matching', signup, null);
    if (['active', 'completed'].includes(e.status)) step('active', e.publishedAt || signup + DAY);
    if (e.status === 'completed') step('completed', e.completedAt || nowMs);

    events.push({
      id,
      name: e.name,
      description: e.description || '',
      theme: e.theme || '',
      season: e.season || 'other',
      rules: e.rules || '',
      tags: [...(e.tags || [])],
      platform: e.platform || 'discord',
      platformName: e.platformName || '',
      platformLink: e.platformLink || '',
      signupDeadline: iso(e.signupDeadline),
      submissionDeadline: iso(e.submissionDeadline),
      minParticipants: e.minParticipants,
      maxParticipants: e.maxParticipants,
      allowedTypes: [...e.allowedTypes],
      status: e.status,
      publicity: e.publicity || 'public',
      inviteCode: e.inviteCode || randomCode(),
      requireApproval: Boolean(e.requireApproval),
      bannerUrl: e.banner ? demoArtDataUrl({ ...e.banner, width: 1200, height: 400 }) : '',
      createdBy: idFor('user', e.createdBy),
      statusHistory: history,
      publishedAt: iso(e.publishedAt),
      completedAt: iso(e.completedAt),
      // Reminders that would already have gone out by now, so they don't all fire on first load
      remindersSent: e.status === 'open' ? [] : ['signup-48h', 'signup-closed'],
      createdAt: iso(createdMs),
      updatedAt: iso(Math.min(nowMs, createdMs + 2 * DAY)),
    });
    for (const org of e.organizers) grant(idFor('user', org), id, 'organizer', iso(createdMs));
  }
  const eventById = new Map(events.map((e) => [e.id, e]));

  const applications = demo.applications.map((a, i) => {
    const event = eventById.get(idFor('event', a.event));
    const signup = new Date(event.signupDeadline).getTime();
    const createdMs = Math.min(signup, nowMs) - (2 + (i % 5)) * DAY - (i % 7) * HOUR;
    const row = {
      id: newId(),
      event: event.id,
      user: idFor('user', a.user),
      status: a.status || 'accepted',
      communityUsername: a.communityUsername || '',
      canCreate: [...a.canCreate],
      wantsTypes: [...a.wantsTypes],
      offeredCharacters: a.offeredCharacters.map((key) => idFor('character', key)),
      likes: a.likes || '',
      avoid: a.avoid || '',
      cannotDraw: [...(a.cannotDraw || [])],
      notes: a.notes || '',
      reviewedBy: null,
      reviewedAt: null,
      createdAt: iso(createdMs),
      updatedAt: iso(createdMs),
    };
    if (row.status === 'accepted') grant(row.user, event.id, 'participant', row.createdAt);
    return row;
  });

  const applicationOf = (eventId, userId) =>
    applications.find((a) => a.event === eventId && a.user === userId)?.id || null;
  const matches = demo.matches.map((m) => {
    const event = eventById.get(idFor('event', m.event));
    const giver = idFor('user', m.giver);
    const recipient = idFor('user', m.recipient);
    return {
      id: newId(),
      event: event.id,
      giver,
      recipient,
      giverApplication: applicationOf(event.id, giver),
      recipientApplication: applicationOf(event.id, recipient),
      score: m.score ?? 0,
      reasons: [...(m.reasons || [])],
      published: m.published !== false,
      status: m.status || 'assigned',
      createdAt: event.publishedAt || iso(nowMs),
      updatedAt: event.publishedAt || iso(nowMs),
    };
  });

  const submissions = demo.submissions.map((s) => {
    const eventId = idFor('event', s.event);
    const giver = idFor('user', s.giver);
    const recipient = idFor('user', s.recipient);
    const match = matches.find((m) => m.event === eventId && m.giver === giver && m.recipient === recipient);
    const submittedAt = iso(s.submittedAt || now);
    return {
      id: newId(),
      event: eventId,
      match: match ? match.id : null,
      giver,
      recipient,
      title: s.title || '',
      message: s.message || '',
      type: s.type || 'art',
      images: (s.art || []).map((art) => demoArtDataUrl(art)),
      links: (s.links || []).map((l) => ({ label: l.label || '', url: l.url })),
      submittedAt,
      late: Boolean(s.late),
      verified: Boolean(s.verified),
      verifiedAt: s.verified ? submittedAt : null,
      createdAt: submittedAt,
      updatedAt: submittedAt,
    };
  });

  const notifications = demo.notifications.map((n) => ({
    id: newId(),
    user: idFor('user', n.user),
    type: n.type,
    title: n.title,
    message: n.message || '',
    link: n.event ? `/events/${idFor('event', n.event)}${n.path || ''}` : n.path || '',
    readAt: n.read ? iso(n.createdAt) : null,
    createdAt: iso(n.createdAt),
  }));

  return {
    version: STATE_VERSION,
    seededAt: iso(now),
    users,
    characters,
    events,
    members,
    applications,
    matches,
    submissions,
    notifications,
    announcements: [],
    reports: [],
  };
}

// Collections added after the first release; older saved demos get them empty
const LATER_COLLECTIONS = ['announcements', 'reports'];

// ---------- Loading and saving ----------

let cache = null;

function readState() {
  try {
    const raw = kv().getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.version === STATE_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

export class StorageFullError extends Error {}

function writeState(state) {
  try {
    kv().setItem(STATE_KEY, JSON.stringify(state));
  } catch (err) {
    // Usually QuotaExceededError: too many big images for the browser's ~5 MB
    throw new StorageFullError(err?.message || 'Storage is full');
  }
}

// The current state, seeding it on first use
export function getState() {
  if (cache) return cache;
  let state = readState();
  if (!state) {
    state = buildState(new Date());
    writeState(state);
  }
  for (const key of LATER_COLLECTIONS) state[key] ||= [];
  cache = state;
  return cache;
}

export function saveState() {
  if (cache) writeState(cache);
}

// Forget unsaved changes (used when a request fails half-way)
export function discardChanges() {
  cache = null;
}

export function resetState() {
  cache = null;
  try {
    kv().removeItem(STATE_KEY);
    kv().removeItem(SESSION_KEY);
  } catch {
    /* nothing stored */
  }
}

// Another tab changed the demo data: read it again next time
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (e) => {
    if (e.key === STATE_KEY || e.key === null) cache = null;
  });
}

// ---------- Session ----------

export function getSession() {
  try {
    const raw = kv().getItem(SESSION_KEY);
    const session = raw ? JSON.parse(raw) : null;
    return session && typeof session.userId === 'string' ? session : null;
  } catch {
    return null;
  }
}

export function setSession(user) {
  kv().setItem(SESSION_KEY, JSON.stringify({ userId: user.id, version: user.sessionVersion || 0 }));
}

export function clearSession() {
  try {
    kv().removeItem(SESSION_KEY);
  } catch {
    /* already gone */
  }
}
