// Values shared by the Express server and the Vue client.
//   server: const { EVENT_STATUSES } = require('../../shared/constants.mjs');
//   client: import { EVENT_STATUSES } from '@shared/constants.mjs';

// ---------- Events ----------

// Lifecycle: draft -> open -> matching -> active -> completed
export const EVENT_STATUSES = ['draft', 'open', 'matching', 'active', 'completed'];

export const EVENT_STATUS_LABELS = {
  draft: 'Draft',
  open: 'Open for sign-ups',
  matching: 'Matching',
  active: 'Active',
  completed: 'Completed',
};

// Status changes an organiser can make with POST /api/events/:eventId/status.
// matching -> active is not here: it happens by publishing matches.
export const EVENT_TRANSITIONS = {
  draft: ['open'],
  open: ['draft', 'matching'],
  matching: ['open'],
  active: ['completed'],
  completed: [],
};

export const PUBLICITY = ['public', 'private'];

export const PLATFORMS = [
  { value: 'discord', label: 'Discord' },
  { value: 'deviantart', label: 'DeviantArt' },
  { value: 'toyhouse', label: 'Toyhou.se' },
  { value: 'tumblr', label: 'Tumblr' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'twitter', label: 'X / Twitter' },
  { value: 'bluesky', label: 'Bluesky' },
  { value: 'other', label: 'Other' },
];
export const PLATFORM_VALUES = PLATFORMS.map((p) => p.value);

export const SEASONS = [
  { value: 'winter', label: 'Winter' },
  { value: 'spring', label: 'Spring' },
  { value: 'summer', label: 'Summer' },
  { value: 'autumn', label: 'Autumn' },
  { value: 'valentine', label: "Valentine's" },
  { value: 'halloween', label: 'Halloween' },
  { value: 'christmas', label: 'Christmas / Secret Santa' },
  { value: 'other', label: 'Other' },
];
export const SEASON_VALUES = SEASONS.map((s) => s.value);

// What participants can make for each other
export const CREATION_TYPES = [
  { value: 'art', label: 'Art' },
  { value: 'adoptable', label: 'Adoptable' },
  { value: 'writing', label: 'Writing' },
  { value: 'music', label: 'Music' },
];
export const CREATION_TYPE_VALUES = CREATION_TYPES.map((t) => t.value);

// ---------- Applications, matches ----------

export const APPLICATION_STATUSES = ['pending', 'accepted', 'rejected', 'withdrawn'];

export const APPLICATION_STATUS_LABELS = {
  pending: 'Pending review',
  accepted: 'Accepted',
  rejected: 'Not accepted',
  withdrawn: 'Withdrawn',
};

export const MATCH_STATUSES = ['assigned', 'submitted'];

// Event roles live in EventMember (server/models/EventMember.js)
export const EVENT_ROLES = ['organizer', 'participant', 'helper', 'approver'];

export const NOTIFICATION_TYPES = [
  'application_received',
  'application_accepted',
  'application_rejected',
  'event_status',
  'organizer_added',
  'match_assigned',
  'deadline_reminder',
  'submission_received',
  'gift_revealed',
  'role_changed',
  'test',
];

// ---------- Limits ----------

export const LIMITS = {
  eventName: 100,
  eventDescription: 5000,
  eventRules: 5000,
  theme: 100,
  minParticipantsFloor: 2,
  maxParticipantsCeiling: 500,
  characterName: 80,
  characterDescription: 2000,
  species: 80,
  tags: 20,
  tagLength: 30,
  referenceLinks: 10,
  notesForArtists: 1000,
  offeredCharactersMin: 1,
  offeredCharactersMax: 5,
  formText: 1000,
  communityUsername: 100,
  submissionTitle: 120,
  submissionMessage: 2000,
  submissionImages: 4,
  submissionLinks: 5,
  imageBytes: 5 * 1024 * 1024,
  deactivationGraceDays: 30,
};

// ---------- Helpers ----------

export function normalizeTag(tag) {
  return String(tag ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, LIMITS.tagLength);
}

// Lowercase, trimmed, de-duplicated, capped. Accepts an array or a comma-separated string.
export function normalizeTags(input, max = LIMITS.tags) {
  const list = Array.isArray(input) ? input : String(input ?? '').split(',');
  const out = [];
  for (const raw of list) {
    const tag = normalizeTag(raw);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}

export function signupsOpen(event, now = new Date()) {
  return event.status === 'open' && new Date(event.signupDeadline) > now;
}

export function labelFor(list, value) {
  return list.find((x) => x.value === value)?.label ?? value;
}
