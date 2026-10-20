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
  cancelled: 'Cancelled',
};

// Status changes an organiser can make with POST /api/events/:eventId/status.
// matching -> active is not here: it happens by publishing matches.
// Site admins can cancel an event at any stage. It keeps its page (with a notice) but
// nothing else can happen in it. Not part of the normal lifecycle above.
export const EVENT_CANCELLED = 'cancelled';
export const ALL_EVENT_STATUSES = [...EVENT_STATUSES, EVENT_CANCELLED];

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
];
export const CREATION_TYPE_VALUES = CREATION_TYPES.map((t) => t.value);

// ---------- Applications, matches ----------

// waitlisted: the event was full; they move in, first come first served, when a place opens
export const APPLICATION_STATUSES = ['pending', 'accepted', 'waitlisted', 'rejected', 'withdrawn'];

export const APPLICATION_STATUS_LABELS = {
  pending: 'Pending review',
  accepted: 'Accepted',
  waitlisted: 'On the waitlist',
  rejected: 'Not accepted',
  withdrawn: 'Withdrawn',
};

export const MATCH_STATUSES = ['assigned', 'submitted'];

// Event roles live in EventMember (server/models/EventMember.js)
export const EVENT_ROLES = ['organizer', 'participant', 'helper', 'approver'];

// Site-wide account states. Banned accounts can't log in; deactivated ones can (which reactivates them).
export const USER_STATUSES = ['active', 'deactivated', 'banned'];
// What each role may do is in shared/permissions.mjs
export const SITE_ROLES = ['user', 'moderator', 'admin'];

export const NOTIFICATION_TYPES = [
  'application_received',
  'application_accepted',
  'application_rejected',
  'event_status',
  'organizer_added',
  'match_assigned',
  'gift_question',
  'gift_answer',
  'deadline_reminder',
  'submission_received',
  'gift_revealed',
  'gift_thanked',
  'announcement',
  'event_invite',
  'waitlist_promoted',
  'backup_needed',
  'backup_assigned',
  'report_received',
  'report_handled',
  'new_follower',
  'new_friend',
  'chat_muted',
  'role_changed',
  'test',
];

// Reactions a recipient can leave on the gift they were given
export const REACTIONS = [
  { value: 'heart', label: 'Love it', emoji: '❤️' },
  { value: 'sparkles', label: 'Amazing', emoji: '✨' },
  { value: 'teary', label: 'So touched', emoji: '🥹' },
  { value: 'fire', label: 'On fire', emoji: '🔥' },
  { value: 'laugh', label: 'Made me laugh', emoji: '😂' },
];
export const REACTION_VALUES = REACTIONS.map((r) => r.value);

// Warnings an artist can put on a gift or a character, so others can choose before looking
export const CONTENT_WARNINGS = [
  { value: 'blood', label: 'Blood or injury' },
  { value: 'horror', label: 'Horror or scary themes' },
  { value: 'mature', label: 'Mature themes' },
  { value: 'suggestive', label: 'Suggestive' },
  { value: 'eyestrain', label: 'Flashing or eye strain' },
];
export const CONTENT_WARNING_VALUES = CONTENT_WARNINGS.map((w) => w.value);

// How far along a gift is; givers update it so organisers know who might need a hand
export const PROGRESS_STAGES = [
  { value: 'not_started', label: 'Not started' },
  { value: 'sketch', label: 'Sketching' },
  { value: 'lineart', label: 'Lineart' },
  { value: 'colour', label: 'Colouring' },
  { value: 'finishing', label: 'Finishing up' },
];
export const PROGRESS_VALUES = PROGRESS_STAGES.map((p) => p.value);

// Why someone reported a gift, a character or a profile to the site admins
export const REPORT_REASONS = [
  { value: 'harassment', label: 'Harassment or hate' },
  { value: 'stolen_art', label: 'Stolen or traced art' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'spam', label: 'Spam or scam' },
  { value: 'other', label: 'Something else' },
];
export const REPORT_REASON_VALUES = REPORT_REASONS.map((r) => r.value);
export const REPORT_TARGETS = ['submission', 'user', 'character', 'event'];
export const REPORT_STATUSES = ['open', 'resolved', 'dismissed'];
export const REPORT_STATUS_LABELS = { open: 'Open', resolved: 'Action taken', dismissed: 'No action needed' };

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
  linkLabel: 60,
  linkNote: 300,
  notesForArtists: 1000,
  pronouns: 40,
  personality: 1000,
  colours: 6,
  folder: 40,
  offeredCharactersMin: 1,
  offeredCharactersMax: 5,
  formText: 1000,
  adoptWishlist: 2000,
  communityUsername: 100,
  submissionTitle: 120,
  submissionMessage: 2000,
  submissionImages: 4,
  submissionLinks: 5,
  imageBytes: 5 * 1024 * 1024,
  imageDescription: 300,
  thanksMessage: 500,
  announcement: 1000,
  announcementsShown: 20,
  blockedUsers: 50,
  avoidPairs: 50,
  reportDetails: 1000,
  progressNote: 200,
  favourites: 500,
  reportsPerDay: 20,
  following: 500,
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

// The order a gift's pictures are shown in, the first being its cover. `order` lists the kept image
// links and "new:<n>" for the nth file uploaded with this save. Anything that isn't exactly those
// pictures, once each, falls back to the kept ones first and then the new ones.
export function orderImages(order, keep, uploaded) {
  const fallback = [...keep, ...uploaded];
  if (!Array.isArray(order) || order.length !== fallback.length) return fallback;
  const seen = new Set();
  const result = [];
  for (const entry of order) {
    if (typeof entry !== 'string' || seen.has(entry)) return fallback;
    seen.add(entry);
    const upload = /^new:(\d+)$/.exec(entry);
    if (upload) {
      const index = Number(upload[1]);
      if (index >= uploaded.length) return fallback;
      result.push(uploaded[index]);
    } else if (keep.includes(entry)) {
      result.push(entry);
    } else {
      return fallback;
    }
  }
  return result;
}

// Descriptions (alt text) for a gift's pictures, in the same order as the pictures.
//   images      the final list (after orderImages)
//   keep        kept image links; uploaded: links of this save's new files ("new:<n>" keys)
//   given       { "<link>" | "new:<n>": "text" } from the form, or undefined to keep what was there
//   previous    { images, descriptions } before this save
export function imageDescriptionsFor(images, keep, uploaded, given, previous = {}) {
  const before = new Map((previous.images || []).map((url, i) => [url, previous.descriptions?.[i] || '']));
  const keyOf = new Map([...keep.map((url) => [url, url]), ...uploaded.map((url, i) => [url, `new:${i}`])]);
  const source = given && typeof given === 'object' && !Array.isArray(given) ? given : null;
  return images.map((url) => {
    const key = keyOf.get(url);
    const text = source && key in source ? source[key] : before.get(url);
    return String(text ?? '').trim().slice(0, LIMITS.imageDescription);
  });
}

// A Discord channel webhook (Server settings > Integrations > Webhooks > Copy webhook URL)
export const DISCORD_WEBHOOK_RE = /^https:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;

// "Europe/London" and the like, as the browser and Node understand them
export function isTimeZone(value) {
  if (typeof value !== 'string' || !value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// A reference link: a web address, or one of the site's own demo reference pictures
// (client/public/demo-refs), which the demo characters and wishlists point at.
export const REFERENCE_URL_RE = /^(https?:\/\/\S+|\/demo-refs\/[\w.-]+)$/i;
