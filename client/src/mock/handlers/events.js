// /events: listing, my events, create/edit/delete, lifecycle, invite codes, banners and
// organisers (server/routes/event-router.js)
import {
  CREATION_TYPE_VALUES,
  EVENT_STATUSES,
  EVENT_TRANSITIONS,
  LIMITS,
  PLATFORM_VALUES,
  PUBLICITY,
  SEASON_VALUES,
  normalizeTags,
  DISCORD_WEBHOOK_RE,
  isTimeZone,
} from '@shared/constants.mjs';
import { newId, randomCode } from '../db.js';
import { checkImage, filesFrom, imageToDataUrl, looksLikeImage } from '../files.js';
import {
  acceptedUserIds,
  grantRole,
  membership,
  notify,
  notifyMany,
  organizerMinis,
  participantCount,
  revokeRole,
  serializeEvent,
  setStatus,
  userMini,
} from '../model.js';
import { escapeRegex, formatDate, httpError, invalid, queryParam, readBoolean, toMs, URL_RE } from '../util.js';
import { organizerEvent, visibleEvent } from './common.js';

// ---------- Reading event fields from a request ----------

const TEXT_FIELDS = {
  name: { label: 'Name', max: LIMITS.eventName },
  description: { label: 'Description', max: LIMITS.eventDescription },
  theme: { label: 'Theme', max: LIMITS.theme },
  rules: { label: 'Rules', max: LIMITS.eventRules },
  platformName: { label: 'Community name', max: 100 },
  platformLink: { label: 'Community link', max: 500 },
};

const DATE_FIELDS = {
  signupDeadline: 'Sign-up deadline',
  submissionDeadline: 'Submission deadline',
};

// Event.remindersSent keys tied to each deadline (see jobs.js)
const DEADLINE_REMINDERS = {
  signupDeadline: ['signup-48h'],
  submissionDeadline: ['submission-72h', 'submission-24h', 'submission-overdue'],
};

const COUNT_FIELDS = {
  minParticipants: 'Minimum participants',
  maxParticipants: 'Maximum participants',
};

// Only changeable while people can still sign up, because matching depends on them
const OPEN_ONLY_FIELDS = {
  allowedTypes: 'Allowed creation types',
  requireApproval: 'Approval setting',
  minParticipants: 'Minimum participants',
  maxParticipants: 'Maximum participants',
  publicity: 'Publicity',
};

function readText(value, label, max) {
  if (value === null) return '';
  if (typeof value !== 'string' && typeof value !== 'number') throw invalid(`${label} must be text.`);
  const text = String(value).trim();
  if (text.length > max) throw invalid(`${label} is too long (max ${max} characters).`);
  return text;
}

function readChoice(value, allowed, message) {
  if (!allowed.includes(value)) throw invalid(message);
  return value;
}

function readDate(value, label) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') throw invalid(`${label} is not a valid date.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw invalid(`${label} is not a valid date.`);
  return date;
}

function readCount(value, label) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  const { minParticipantsFloor: min, maxParticipantsCeiling: max } = LIMITS;
  if (!Number.isInteger(n) || n < min || n > max) throw invalid(`${label} must be a whole number from ${min} to ${max}.`);
  return n;
}

function readTypes(value) {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : null;
  if (!list) throw invalid('Allowed creation types must be a list.');
  const types = [...new Set(list.map((t) => String(t).trim()).filter(Boolean))];
  if (types.some((t) => !CREATION_TYPE_VALUES.includes(t))) {
    throw invalid(`Creation types can be: ${CREATION_TYPE_VALUES.join(', ')}.`);
  }
  if (!types.length) throw invalid('Allow at least one kind of creation.');
  return types;
}

// The only fields an organiser can set on POST and PATCH. Anything else in the body is ignored.
function readEventInput(body) {
  const src = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const input = {};
  for (const [key, { label, max }] of Object.entries(TEXT_FIELDS)) {
    if (src[key] !== undefined) input[key] = readText(src[key], label, max);
  }
  if (input.platformLink && !URL_RE.test(input.platformLink)) {
    throw invalid('Community link must start with http:// or https://');
  }
  if (src.season !== undefined) input.season = readChoice(src.season, SEASON_VALUES, 'Pick a season from the list.');
  if (src.platform !== undefined) {
    input.platform = readChoice(src.platform, PLATFORM_VALUES, 'Pick a community platform from the list.');
  }
  if (src.publicity !== undefined) {
    input.publicity = readChoice(src.publicity, PUBLICITY, 'Publicity must be public or private.');
  }
  if (src.tags !== undefined) input.tags = normalizeTags(src.tags ?? []);
  for (const [key, label] of Object.entries(DATE_FIELDS)) {
    if (src[key] !== undefined) input[key] = readDate(src[key], label);
  }
  for (const [key, label] of Object.entries(COUNT_FIELDS)) {
    if (src[key] !== undefined) input[key] = readCount(src[key], label);
  }
  if (src.allowedTypes !== undefined) input.allowedTypes = readTypes(src.allowedTypes);
  if (src.requireApproval !== undefined) input.requireApproval = readBoolean(src.requireApproval, 'Require approval');
  if (src.timeZone !== undefined && src.timeZone !== null && src.timeZone !== '') {
    if (!isTimeZone(src.timeZone)) throw invalid("That time zone isn't one we recognise.");
    input.timeZone = src.timeZone;
  }
  if (src.discordWebhookUrl !== undefined) {
    const url = readText(src.discordWebhookUrl, 'Discord webhook', 300);
    if (url && !DISCORD_WEBHOOK_RE.test(url)) {
      throw invalid('Paste a Discord webhook link (it starts with https://discord.com/api/webhooks/).');
    }
    input.discordWebhookUrl = url;
  }
  return input;
}

// The model-level checks Event.js runs before every save
function validateEvent(event) {
  if (!event.name) throw invalid('Give your event a name.');
  if (!event.signupDeadline) throw invalid('Set a sign-up deadline.');
  if (!event.submissionDeadline) throw invalid('Set a submission deadline.');
  if (toMs(event.submissionDeadline) <= toMs(event.signupDeadline)) {
    throw invalid('The submission deadline must be after sign-ups close.');
  }
  if (event.maxParticipants < event.minParticipants) throw invalid('Maximum participants must be at least the minimum.');
}

// Input with dates as ISO strings, ready to merge into a stored event
function storable(input) {
  const out = { ...input };
  for (const key of Object.keys(DATE_FIELDS)) {
    if (out[key] instanceof Date) out[key] = out[key].toISOString();
  }
  return out;
}

function sameValue(current, next) {
  if (Array.isArray(next)) {
    const a = [...(current || [])].map(String).sort();
    const b = [...next].map(String).sort();
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }
  return current === next;
}

function rejectIfCompleted(event) {
  if (event.status === 'completed') {
    throw httpError(409, 'This event is completed, so it can no longer be edited.', 'EVENT_LOCKED');
  }
}

// ---------- Duplicate ----------

const COPIED_FIELDS = [
  'description', 'theme', 'season', 'rules', 'tags', 'platform', 'platformName', 'platformLink', 'timeZone', 'discordWebhookUrl',
  'minParticipants', 'maxParticipants', 'allowedTypes', 'publicity', 'requireApproval', 'bannerUrl',
];
const DUPLICATE_SIGNUP_DAYS = 14;

// ---------- Listing ----------

const LIST_STATUSES = {
  open: ['open'],
  matching: ['matching'],
  active: ['active'],
  completed: ['completed'],
  upcoming: ['open', 'matching', 'active'],
  all: ['open', 'matching', 'active', 'completed'],
};

const byId = (a, b) => a.id.localeCompare(b.id);

// "deadline" means each event's next relevant date: sign-ups closing for open events, gifts
// being due for matching/active ones. Completed events go last, most recently finished first.
function nextDeadline(event) {
  if (event.status === 'open') return toMs(event.signupDeadline);
  if (event.status === 'completed') return -toMs(event.completedAt || event.updatedAt);
  return toMs(event.submissionDeadline);
}
const isCompleted = (event) => (event.status === 'completed' ? 1 : 0);

const LIST_SORTS = {
  deadline: (a, b) =>
    isCompleted(a.event) - isCompleted(b.event) ||
    nextDeadline(a.event) - nextDeadline(b.event) ||
    byId(a.event, b.event),
  newest: (a, b) => toMs(b.event.createdAt) - toMs(a.event.createdAt) || byId(b.event, a.event),
  popular: (a, b) =>
    b.count - a.count ||
    toMs(a.event.signupDeadline) - toMs(b.event.signupDeadline) ||
    byId(a.event, b.event),
};

function readListCount(value, label) {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw invalid(`${label} must be a whole number.`);
  return n;
}

function readPageNumber(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

// Draft/open events care about the sign-up deadline, later ones about the submission deadline
function deadlineOf(event) {
  return toMs(['draft', 'open'].includes(event.status) ? event.signupDeadline : event.submissionDeadline);
}

// Lifecycle order, then the closest deadline first (completed: most recently finished first)
function sortMine(list) {
  return list.sort((a, b) => {
    const byStatus = EVENT_STATUSES.indexOf(a.status) - EVENT_STATUSES.indexOf(b.status);
    if (byStatus) return byStatus;
    if (a.status === 'completed') {
      return toMs(b.completedAt || b.submissionDeadline) - toMs(a.completedAt || a.submissionDeadline);
    }
    return deadlineOf(a) - deadlineOf(b);
  });
}

function organizerStats(state, eventId) {
  const apps = state.applications.filter((a) => a.event === eventId && a.status !== 'withdrawn');
  return {
    applications: apps.length,
    pending: apps.filter((a) => a.status === 'pending').length,
    accepted: apps.filter((a) => a.status === 'accepted').length,
    submitted: state.submissions.filter((s) => s.event === eventId).length,
  };
}

// Removes an event and everything hanging off it
function deleteEventData(state, eventId) {
  state.applications = state.applications.filter((a) => a.event !== eventId);
  state.matches = state.matches.filter((m) => m.event !== eventId);
  state.submissions = state.submissions.filter((s) => s.event !== eventId);
  state.members = state.members.filter((m) => m.event !== eventId);
  state.events = state.events.filter((e) => e.id !== eventId);
}

export function register(router) {
  router.get('/events', (ctx) => {
    const { state, query } = ctx;
    const user = ctx.currentUser();
    const status = queryParam(query, 'status') || 'all';
    if (!LIST_STATUSES[status]) throw invalid(`status must be one of: ${Object.keys(LIST_STATUSES).join(', ')}.`);
    const season = queryParam(query, 'season');
    if (season && !SEASON_VALUES.includes(season)) throw invalid('Unknown season.');
    const sort = queryParam(query, 'sort') || 'deadline';
    if (!LIST_SORTS[sort]) throw invalid(`sort must be one of: ${Object.keys(LIST_SORTS).join(', ')}.`);
    const minCount = readListCount(queryParam(query, 'minParticipants'), 'minParticipants');
    const maxCount = readListCount(queryParam(query, 'maxParticipants'), 'maxParticipants');
    const page = Math.max(1, readPageNumber(queryParam(query, 'page'), 1));
    const limit = Math.min(50, Math.max(1, readPageNumber(queryParam(query, 'limit'), 12)));
    const q = queryParam(query, 'q').slice(0, 100);

    let organised = null;
    let re = null;
    if (q) {
      re = new RegExp(escapeRegex(q), 'i');
      const people = new Set(state.users.filter((u) => re.test(u.displayName || '') || re.test(u.username || '')).map((u) => u.id));
      organised = new Set(
        state.members.filter((m) => people.has(m.user) && m.roles.includes('organizer')).map((m) => m.event)
      );
    }

    const rows = state.events
      .filter((e) => e.publicity === 'public' && LIST_STATUSES[status].includes(e.status))
      .filter((e) => !season || e.season === season)
      .filter((e) => !re || re.test(e.name) || re.test(e.theme || '') || re.test(e.description || '') || organised.has(e.id))
      .map((event) => ({ event, count: participantCount(state, event.id) }))
      .filter(({ count }) => (minCount === null || count >= minCount) && (maxCount === null || count <= maxCount))
      .sort(LIST_SORTS[sort]);

    const total = rows.length;
    return {
      events: rows.slice((page - 1) * limit, page * limit).map(({ event }) => serializeEvent(state, event, user)),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    };
  });

  router.get('/events/mine', (ctx) => {
    const user = ctx.requireAuth();
    const { state } = ctx;
    const organizingIds = state.members
      .filter((m) => m.user === user.id && m.roles.includes('organizer'))
      .map((m) => m.event);
    const participatingIds = state.applications
      .filter((a) => a.user === user.id && a.status !== 'withdrawn')
      .map((a) => a.event);
    const pick = (ids) =>
      ids
        .map((id) => state.events.find((e) => e.id === id))
        .filter(Boolean)
        .map((event) => serializeEvent(state, event, user));

    return {
      organizing: sortMine(pick(organizingIds)).map((e) => ({ ...e, stats: organizerStats(state, e.id) })),
      participating: sortMine(pick(participatingIds)),
    };
  });

  router.post('/events', (ctx) => {
    const user = ctx.requireAuth();
    const input = readEventInput(ctx.body);
    if (!input.signupDeadline) throw invalid('Set a sign-up deadline.');
    if (!input.submissionDeadline) throw invalid('Set a submission deadline.');
    if (input.signupDeadline <= ctx.now) throw invalid('The sign-up deadline must be in the future.');

    const at = ctx.now.toISOString();
    const event = {
      id: newId(),
      name: '',
      description: '',
      theme: '',
      season: 'other',
      rules: '',
      tags: [],
      platform: 'discord',
      platformName: '',
      platformLink: '',
      minParticipants: 3,
      maxParticipants: 50,
      allowedTypes: [...CREATION_TYPE_VALUES],
      publicity: 'public',
      requireApproval: false,
      ...storable(input),
      status: 'draft',
      inviteCode: randomCode(),
      bannerUrl: '',
      createdBy: user.id,
      statusHistory: [{ status: 'draft', at, by: user.id }],
      publishedAt: null,
      completedAt: null,
      remindersSent: [],
      createdAt: at,
      updatedAt: at,
    };
    validateEvent(event);
    ctx.state.events.push(event);
    grantRole(ctx.state, user.id, event.id, 'organizer');
    ctx.status = 201;
    return { event: serializeEvent(ctx.state, event, user) };
  });

  // Settings copied into a new draft. People, matches, gifts and the invite code are not.
  router.post('/events/:eventId/duplicate', (ctx) => {
    const { user, event: source } = organizerEvent(ctx);
    const src = ctx.body;

    let name = src.name === undefined ? '' : readText(src.name, 'Name', LIMITS.eventName);
    if (!name) name = `Copy of ${source.name}`.slice(0, LIMITS.eventName).trim();
    const optionalDate = (value, label) => (value === undefined ? null : readDate(value, label));
    const signupDeadline =
      optionalDate(src.signupDeadline, 'Sign-up deadline') ||
      new Date(ctx.now.getTime() + DUPLICATE_SIGNUP_DAYS * 24 * 60 * 60 * 1000);
    if (signupDeadline <= ctx.now) throw invalid('The sign-up deadline must be in the future.');
    // Same time for making gifts as the original had
    const gap = toMs(source.submissionDeadline) - toMs(source.signupDeadline);
    const submissionDeadline =
      optionalDate(src.submissionDeadline, 'Submission deadline') || new Date(signupDeadline.getTime() + gap);

    const at = ctx.now.toISOString();
    const event = { id: newId() };
    for (const key of COPIED_FIELDS) {
      const value = source[key];
      event[key] = Array.isArray(value) ? [...value] : value;
    }
    Object.assign(event, {
      name,
      signupDeadline: signupDeadline.toISOString(),
      submissionDeadline: submissionDeadline.toISOString(),
      status: 'draft',
      inviteCode: randomCode(),
      createdBy: user.id,
      statusHistory: [{ status: 'draft', at, by: user.id }],
      publishedAt: null,
      completedAt: null,
      remindersSent: [],
      createdAt: at,
      updatedAt: at,
    });
    validateEvent(event);
    ctx.state.events.push(event);
    grantRole(ctx.state, user.id, event.id, 'organizer');
    ctx.status = 201;
    return { event: serializeEvent(ctx.state, event, user) };
  });

  router.get('/events/:eventId', (ctx) => {
    const user = ctx.currentUser();
    const { event, viewer } = visibleEvent(ctx, user);
    return { event: serializeEvent(ctx.state, event, user, viewer) };
  });

  router.patch('/events/:eventId', (ctx) => {
    const { user, event, viewer } = organizerEvent(ctx);
    const { state } = ctx;
    rejectIfCompleted(event);
    const input = readEventInput(ctx.body);
    const signupsStage = ['draft', 'open'].includes(event.status);

    for (const [field, label] of Object.entries(OPEN_ONLY_FIELDS)) {
      if (input[field] === undefined) continue;
      // The edit form sends every field back, so unchanged values are fine
      if (sameValue(event[field], input[field])) {
        delete input[field];
        continue;
      }
      if (!signupsStage) throw httpError(409, `${label} can't be changed after sign-ups close.`, 'FIELD_LOCKED');
    }

    if (input.maxParticipants !== undefined) {
      const accepted = participantCount(state, event.id);
      if (input.maxParticipants < accepted) {
        throw invalid(`${accepted} people are already accepted, so the maximum can't be lower than that.`);
      }
    }

    const changedDeadlines = [];
    for (const [key, label] of Object.entries(DATE_FIELDS)) {
      if (input[key] === undefined) continue;
      if (input[key] === null) throw invalid(`${label} can't be empty.`);
      if (event[key] && input[key].getTime() === toMs(event[key])) {
        delete input[key];
        continue;
      }
      changedDeadlines.push(key);
    }
    if (changedDeadlines.includes('signupDeadline') && signupsStage && input.signupDeadline <= ctx.now) {
      throw invalid('The sign-up deadline must be in the future.');
    }
    if (changedDeadlines.includes('submissionDeadline') && input.submissionDeadline <= ctx.now) {
      throw invalid('The submission deadline must be in the future.');
    }

    const updated = { ...event, ...storable(input) };
    validateEvent(updated);
    Object.assign(event, updated, { updatedAt: ctx.now.toISOString() });
    // A moved deadline gets its automatic reminders again, counted from the new date
    const resetKeys = changedDeadlines.flatMap((key) => DEADLINE_REMINDERS[key]);
    if (resetKeys.length) event.remindersSent = (event.remindersSent || []).filter((k) => !resetKeys.includes(k));

    if (changedDeadlines.length && event.status !== 'draft') {
      const lines = [];
      if (changedDeadlines.includes('signupDeadline')) lines.push(`Sign-ups now close ${formatDate(event.signupDeadline)}.`);
      if (changedDeadlines.includes('submissionDeadline')) {
        lines.push(`Gifts are now due ${formatDate(event.submissionDeadline)}.`);
      }
      notifyMany(state, acceptedUserIds(state, event.id, user.id), {
        type: 'event_status',
        title: `New deadlines for ${event.name}`,
        message: lines.join(' '),
        link: `/events/${event.id}`,
      });
    }
    return { event: serializeEvent(state, event, user, viewer) };
  });

  router.delete('/events/:eventId', (ctx) => {
    const { user, event } = organizerEvent(ctx);
    const finished = event.status === 'completed';
    notifyMany(ctx.state, acceptedUserIds(ctx.state, event.id, user.id), {
      type: 'event_status',
      title: finished ? `${event.name} was removed` : `${event.name} was cancelled`,
      message: finished ? 'The organisers deleted this event.' : 'The organisers deleted this event, so it will not go ahead.',
      link: '/my-events',
    });
    deleteEventData(ctx.state, event.id);
    return { ok: true };
  });

  router.post('/events/:eventId/status', (ctx) => {
    const { user, event, viewer } = organizerEvent(ctx);
    const { state } = ctx;
    const from = event.status;
    const to = typeof ctx.body.status === 'string' ? ctx.body.status : '';
    const allowed = EVENT_TRANSITIONS[from] || [];

    if (from === 'matching' && to === 'active') {
      throw httpError(400, 'Publish the matches to start the event.', 'USE_PUBLISH');
    }
    if (!allowed.includes(to)) {
      const message = allowed.length
        ? `This event is ${from}. It can only move to: ${allowed.join(', ')}.`
        : `This event is ${from}, so its status can't change any more.`;
      throw httpError(400, message, 'INVALID_TRANSITION');
    }
    if (to === 'open' && !(toMs(event.signupDeadline) > ctx.now.getTime())) {
      throw httpError(400, 'The sign-up deadline has passed. Set a new one before opening sign-ups.', 'DEADLINE_PASSED');
    }
    if (from === 'open' && to === 'draft') {
      if (state.applications.some((a) => a.event === event.id && a.status !== 'withdrawn')) {
        throw httpError(409, "People have already signed up, so this event can't go back to draft.", 'HAS_APPLICATIONS');
      }
    }

    setStatus(event, to, user.id);

    if (from === 'matching' && to === 'open') {
      state.matches = state.matches.filter((m) => !(m.event === event.id && !m.published));
    }
    if (from === 'open' && to === 'matching') {
      notifyMany(state, acceptedUserIds(state, event.id, user.id), {
        type: 'event_status',
        title: `Sign-ups closed for ${event.name}, matches are on the way`,
        message: "You'll get a notification as soon as you can see who you're making a gift for.",
        link: `/events/${event.id}`,
      });
    }
    if (from === 'active' && to === 'completed') {
      notifyMany(state, acceptedUserIds(state, event.id, user.id), {
        type: 'gift_revealed',
        title: `Gifts for ${event.name} are revealed!`,
        message: 'See the gift made for you, who your Secret Santa was, and everything else from the exchange.',
        link: `/events/${event.id}/results`,
      });
    }
    return { event: serializeEvent(state, event, user, viewer) };
  });

  router.post('/events/:eventId/invite/regenerate', (ctx) => {
    const { event } = organizerEvent(ctx);
    event.inviteCode = randomCode();
    event.updatedAt = ctx.now.toISOString();
    return { inviteCode: event.inviteCode };
  });

  // ---------- Banner ----------

  router.post('/events/:eventId/banner', async (ctx) => {
    const { user, event, viewer } = organizerEvent(ctx);
    rejectIfCompleted(event);
    const [file] = filesFrom(ctx.form, 'banner');
    if (!file) throw invalid('Choose an image to upload.');
    checkImage(file, {
      maxBytes: LIMITS.imageBytes,
      tooBig: 'Banner images must be 5 MB or smaller.',
      typeCode: 'VALIDATION',
      sizeCode: 'UPLOAD_INVALID',
    });
    if (!(await looksLikeImage(file))) throw invalid('Use a PNG, JPG, WebP or GIF image.');
    event.bannerUrl = await imageToDataUrl(file);
    event.updatedAt = ctx.now.toISOString();
    return { event: serializeEvent(ctx.state, event, user, viewer) };
  });

  router.delete('/events/:eventId/banner', (ctx) => {
    const { user, event, viewer } = organizerEvent(ctx);
    rejectIfCompleted(event);
    event.bannerUrl = '';
    event.updatedAt = ctx.now.toISOString();
    return { event: serializeEvent(ctx.state, event, user, viewer) };
  });

  // ---------- Organisers ----------

  router.get('/events/:eventId/organizers', (ctx) => {
    const { event } = visibleEvent(ctx, ctx.currentUser());
    return { organizers: organizerMinis(ctx.state, event.id) };
  });

  router.post('/events/:eventId/organizers', (ctx) => {
    const { user, event } = organizerEvent(ctx);
    const { state } = ctx;
    const raw = typeof ctx.body.identifier === 'string' ? ctx.body.identifier.trim().toLowerCase() : '';
    if (!raw) throw invalid('Enter their email or username.');

    const byEmail = raw.includes('@') && !raw.startsWith('@');
    const handle = raw.replace(/^@/, '');
    const target = state.users.find((u) => (byEmail ? u.email === raw : u.username === handle));
    if (!target || target.status === 'deactivated') {
      throw httpError(404, "We couldn't find anyone with that email or username.", 'USER_NOT_FOUND');
    }

    if (!membership(state, target.id, event.id)?.roles.includes('organizer')) {
      grantRole(state, target.id, event.id, 'organizer');
      notify(state, target.id, {
        type: 'organizer_added',
        title: `You're now an organiser of ${event.name}`,
        message: `${userMini(user).displayName} added you as an organiser.`,
        link: `/events/${event.id}/manage`,
      });
    }
    return { organizers: organizerMinis(state, event.id) };
  });

  router.delete('/events/:eventId/organizers/:userId', (ctx) => {
    const { event } = organizerEvent(ctx);
    const { state } = ctx;
    const { userId } = ctx.params;
    if (!membership(state, userId, event.id)?.roles.includes('organizer')) {
      throw httpError(404, 'That person is not an organiser of this event.', 'NOT_FOUND');
    }
    const count = state.members.filter((m) => m.event === event.id && m.roles.includes('organizer')).length;
    if (count <= 1) {
      throw httpError(400, 'Every event needs at least one organiser. Add someone else first.', 'LAST_ORGANIZER');
    }
    revokeRole(state, userId, event.id, 'organizer');
    return { organizers: organizerMinis(state, event.id) };
  });
}
