const { Router } = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const Event = require('../models/Event.js');
const EventMember = require('../models/EventMember.js');
const Application = require('../models/Application.js');
const Match = require('../models/Match.js');
const Submission = require('../models/Submission.js');
const User = require('../models/User.js');
const { userMini } = require('../models/User.js');
const { requireAuth, optionalAuth, loadEvent, requireEventRole } = require('../middleware/auth.js');
const {
  deleteEventCascade,
  organizerMinis,
  participantCount,
  viewerContext,
  canViewEvent,
  serializeEvent,
  serializeEvents,
} = require('../services/events.js');
const { notify, notifyMany } = require('../services/notify.js');
const { uploadImage, looksLikeImage, IMAGE_TYPES } = require('../services/storage.js');
const { REMINDER_KEYS } = require('../services/reminders.js');
const { announceMilestone } = require('../services/discord.js');
const { promoteFromWaitlist } = require('../services/waitlist.js');
const {
  EVENT_STATUSES,
  EVENT_TRANSITIONS,
  PUBLICITY,
  PLATFORM_VALUES,
  SEASON_VALUES,
  CREATION_TYPE_VALUES,
  LIMITS,
  normalizeTags,
  DISCORD_WEBHOOK_RE,
  isTimeZone,
} = require('../../shared/constants.mjs');
const { MUSEUM_THEME_CHOICES } = require('../../shared/museum-themes.mjs');
const { MATCH_MODES } = require('../../shared/matching.mjs');
const { asyncHandler, apiErrorHandler, httpError } = require('../utils/helpers.js');

const router = Router();

const invalid = (message) => httpError(400, message, 'VALIDATION');
const notFound = () => httpError(404, 'Event not found.', 'NOT_FOUND');
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Express may hand us an array for repeated query keys; we only ever want one string.
function queryParam(req, key) {
  const value = req.query[key];
  return typeof value === 'string' ? value.trim() : '';
}

const inviteParam = (req) => queryParam(req, 'invite') || undefined;

function formatDate(date) {
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

// A notification failing to save shouldn't turn a change that already happened into an error.
async function quietly(task) {
  try {
    await task;
  } catch (err) {
    console.error('Notification failed:', err.message);
  }
}

async function acceptedUserIds(eventId, exceptUserId) {
  const rows = await Application.find({ event: eventId, status: 'accepted' }).select('user');
  return rows.map((r) => r.user).filter((id) => !exceptUserId || !id.equals(exceptUserId));
}

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

// Event.remindersSent keys tied to each deadline (services/reminders.js)
const DEADLINE_REMINDERS = {
  signupDeadline: [REMINDER_KEYS.signupWarning, REMINDER_KEYS.watchersWarning],
  submissionDeadline: [REMINDER_KEYS.submission72h, REMINDER_KEYS.submission24h, REMINDER_KEYS.overdue],
};

const COUNT_FIELDS = {
  minParticipants: 'Minimum participants',
  maxParticipants: 'Maximum participants',
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
  if (!Number.isInteger(n) || n < min || n > max) {
    throw invalid(`${label} must be a whole number from ${min} to ${max}.`);
  }
  return n;
}

function readBoolean(value, label) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw invalid(`${label} must be true or false.`);
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
  if (input.platformLink && !/^https?:\/\/\S+$/i.test(input.platformLink)) {
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
  if (src.adultOnly !== undefined) input.adultOnly = readBoolean(src.adultOnly, 'Adults only');
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
  // Automatic matching (services/match-making.js): { enabled, mode, publish }, any of them
  if (src.autoMatch !== undefined) {
    const auto = src.autoMatch && typeof src.autoMatch === 'object' ? src.autoMatch : null;
    if (!auto) throw invalid('autoMatch must be an object.');
    if (auto.enabled !== undefined) input['autoMatch.enabled'] = readBoolean(auto.enabled, 'Automatic matching');
    if (auto.publish !== undefined) input['autoMatch.publish'] = readBoolean(auto.publish, 'Publish automatically');
    if (auto.mode !== undefined) input['autoMatch.mode'] = readChoice(auto.mode, MATCH_MODES, 'Pick best fit or random matching.');
  }
  return input;
}

// ---------- Access ----------

// Hides drafts and private events from anyone who can't see them (404, not 403).
const requireVisible = asyncHandler(async (req, res, next) => {
  const ctx = await viewerContext(req.event, req.user);
  if (!canViewEvent(req.event, ctx, inviteParam(req))) throw notFound();
  req.viewer = ctx;
  next();
});

const organizerOnly = [requireAuth, loadEvent, requireVisible, requireEventRole('organizer')];

function rejectIfCompleted(req, res, next) {
  if (req.event.status === 'completed') {
    return next(httpError(409, 'This event is completed, so it can no longer be edited.', 'EVENT_LOCKED'));
  }
  next();
}

// ---------- Public listing ----------

const LIST_STATUSES = {
  open: ['open'],
  matching: ['matching'],
  active: ['active'],
  completed: ['completed'],
  upcoming: ['open', 'matching', 'active'],
  all: ['open', 'matching', 'active', 'completed', 'cancelled'],
  cancelled: ['cancelled'],
};

// "deadline" means each event's next relevant date: sign-ups closing for open events, gifts
// being due for matching/active ones. Completed events go last, most recently finished first.
const NEXT_DEADLINE_FIELDS = {
  isCompleted: { $cond: [{ $in: ['$status', ['completed', 'cancelled']] }, 1, 0] },
  deadlineSortTime: {
    $switch: {
      branches: [
        { case: { $eq: ['$status', 'open'] }, then: { $toLong: '$signupDeadline' } },
        {
          case: { $eq: ['$status', 'completed'] },
          then: { $subtract: [0, { $toLong: { $ifNull: ['$completedAt', '$updatedAt'] } }] },
        },
      ],
      default: { $toLong: '$submissionDeadline' },
    },
  },
};

const LIST_SORTS = {
  deadline: { isCompleted: 1, deadlineSortTime: 1, _id: 1 },
  newest: { createdAt: -1, _id: -1 },
  popular: { participantCount: -1, signupDeadline: 1, _id: 1 },
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

router.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const status = queryParam(req, 'status') || 'all';
  if (!LIST_STATUSES[status]) throw invalid(`status must be one of: ${Object.keys(LIST_STATUSES).join(', ')}.`);
  const season = queryParam(req, 'season');
  if (season && !SEASON_VALUES.includes(season)) throw invalid('Unknown season.');
  const sort = queryParam(req, 'sort') || 'deadline';
  if (!LIST_SORTS[sort]) throw invalid(`sort must be one of: ${Object.keys(LIST_SORTS).join(', ')}.`);
  const minCount = readListCount(queryParam(req, 'minParticipants'), 'minParticipants');
  const maxCount = readListCount(queryParam(req, 'maxParticipants'), 'maxParticipants');
  const page = Math.max(1, readPageNumber(queryParam(req, 'page'), 1));
  const limit = Math.min(50, Math.max(1, readPageNumber(queryParam(req, 'limit'), 12)));
  const q = queryParam(req, 'q').slice(0, 100);

  const match = { publicity: 'public', status: { $in: LIST_STATUSES[status] }, disabledAt: null };
  if (season) match.season = season;
  if (q) {
    const re = new RegExp(escapeRegex(q), 'i');
    const users = await User.find({ $or: [{ displayName: re }, { username: re }] }).select('_id').lean();
    const organised = users.length
      ? await EventMember.distinct('event', { user: { $in: users.map((u) => u._id) }, roles: 'organizer' })
      : [];
    match.$or = [{ name: re }, { theme: re }, { description: re }, { platformName: re }];
    if (organised.length) match.$or.push({ _id: { $in: organised } });
  }

  const pipeline = [
    { $match: match },
    {
      $lookup: {
        from: Application.collection.name,
        let: { eventId: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$event', '$$eventId'] }, { $eq: ['$status', 'accepted'] }] } } },
          { $count: 'n' },
        ],
        as: 'accepted',
      },
    },
    {
      $addFields: {
        participantCount: { $ifNull: [{ $arrayElemAt: ['$accepted.n', 0] }, 0] },
        ...NEXT_DEADLINE_FIELDS,
      },
    },
    { $project: { accepted: 0 } },
  ];
  if (minCount !== null || maxCount !== null) {
    const range = {};
    if (minCount !== null) range.$gte = minCount;
    if (maxCount !== null) range.$lte = maxCount;
    pipeline.push({ $match: { participantCount: range } });
  }
  pipeline.push({
    $facet: {
      rows: [{ $sort: LIST_SORTS[sort] }, { $skip: (page - 1) * limit }, { $limit: limit }],
      total: [{ $count: 'n' }],
    },
  });

  const [{ rows, total: totalRows }] = await Event.aggregate(pipeline);
  const total = totalRows[0]?.n || 0;
  const counts = new Map(rows.map((r) => [r._id.toString(), r.participantCount]));
  const events = rows.map(({ participantCount: _count, isCompleted: _c, deadlineSortTime: _t, ...doc }) =>
    Event.hydrate(doc)
  );

  res.json({
    events: await serializeEvents(events, req.user, { counts }),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
}));

// ---------- My events ----------

// Draft/open events care about the sign-up deadline, later ones about the submission deadline.
function deadlineOf(event) {
  const date = ['draft', 'open'].includes(event.status) ? event.signupDeadline : event.submissionDeadline;
  return new Date(date).getTime();
}

// Lifecycle order, then the closest deadline first (completed: most recently finished first)
function sortMine(list) {
  return list.sort((a, b) => {
    const byStatus = EVENT_STATUSES.indexOf(a.status) - EVENT_STATUSES.indexOf(b.status);
    if (byStatus) return byStatus;
    if (a.status === 'completed') {
      return new Date(b.completedAt || b.submissionDeadline) - new Date(a.completedAt || a.submissionDeadline);
    }
    return deadlineOf(a) - deadlineOf(b);
  });
}

async function organizerStats(eventIds) {
  const stats = new Map(
    eventIds.map((id) => [id.toString(), { applications: 0, pending: 0, accepted: 0, submitted: 0 }])
  );
  if (!eventIds.length) return stats;
  const [applicationRows, submissionRows] = await Promise.all([
    Application.aggregate([
      { $match: { event: { $in: eventIds }, status: { $ne: 'withdrawn' } } },
      { $group: { _id: { event: '$event', status: '$status' }, count: { $sum: 1 } } },
    ]),
    Submission.aggregate([
      { $match: { event: { $in: eventIds } } },
      { $group: { _id: '$event', count: { $sum: 1 } } },
    ]),
  ]);
  for (const row of applicationRows) {
    const entry = stats.get(row._id.event.toString());
    if (!entry) continue;
    entry.applications += row.count;
    if (row._id.status === 'pending') entry.pending += row.count;
    if (row._id.status === 'accepted') entry.accepted += row.count;
  }
  for (const row of submissionRows) {
    const entry = stats.get(row._id.toString());
    if (entry) entry.submitted = row.count;
  }
  return stats;
}

router.get('/mine', requireAuth, asyncHandler(async (req, res) => {
  const [organizerRows, myApplications] = await Promise.all([
    EventMember.find({ user: req.user._id, roles: 'organizer' }).select('event'),
    Application.find({ user: req.user._id, status: { $ne: 'withdrawn' } }).select('event'),
  ]);
  const organizingIds = organizerRows.map((r) => r.event);
  const participatingIds = myApplications.map((a) => a.event);

  const events = await Event.find({ _id: { $in: [...organizingIds, ...participatingIds] } });
  const [serialized, stats] = await Promise.all([
    serializeEvents(events, req.user),
    organizerStats(organizingIds),
  ]);
  const byId = new Map(serialized.map((e) => [e.id, e]));
  const pick = (ids) => ids.map((id) => byId.get(id.toString())).filter(Boolean);

  res.json({
    organizing: sortMine(pick(organizingIds)).map((e) => ({ ...e, stats: stats.get(e.id) })),
    // Disabled events vanish for everyone but their organisers
    participating: sortMine(pick(participatingIds)).filter((e) => !e.disabled || e.viewer?.isOrganizer),
  });
}));

// ---------- Create ----------

router.post('/', requireAuth, asyncHandler(async (req, res) => {
  const input = readEventInput(req.body);
  if (!input.signupDeadline) throw invalid('Set a sign-up deadline.');
  if (!input.submissionDeadline) throw invalid('Set a submission deadline.');
  if (input.signupDeadline <= new Date()) throw invalid('The sign-up deadline must be in the future.');

  const event = new Event({ ...input, createdBy: req.user._id, status: 'draft' });
  event.setStatus('draft', req.user._id);
  await event.save();
  try {
    await EventMember.grant(req.user._id, event._id, 'organizer');
  } catch (err) {
    await event.deleteOne();
    throw err;
  }

  res.status(201).json({ event: await serializeEvent(event, req.user) });
}));

// ---------- One event ----------

router.get('/:eventId', optionalAuth, loadEvent, requireVisible, asyncHandler(async (req, res) => {
  res.json({ event: await serializeEvent(req.event, req.user, { ctx: req.viewer }) });
}));

// ---------- "Remind me before sign-ups close" ----------
// Saves the event on the person's account; the reminder job tells them 48 h before the
// sign-up deadline unless they've signed up by then (services/reminders.js).

router.post('/:eventId/watch', requireAuth, loadEvent, requireVisible, asyncHandler(async (req, res) => {
  if (req.event.status !== 'open') {
    throw httpError(409, 'Reminders are only for events that are open for sign-ups.', 'NOT_OPEN');
  }
  await User.updateOne({ _id: req.user._id }, { $addToSet: { watchedEvents: req.event._id } });
  res.json({ watching: true });
}));

router.delete('/:eventId/watch', requireAuth, loadEvent, asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $pull: { watchedEvents: req.event._id } });
  res.json({ watching: false });
}));

// Only changeable while people can still sign up, because matching depends on them
const OPEN_ONLY_FIELDS = {
  allowedTypes: 'Allowed creation types',
  requireApproval: 'Approval setting',
  adultOnly: 'Adults-only setting',
  minParticipants: 'Minimum participants',
  maxParticipants: 'Maximum participants',
  publicity: 'Publicity',
};

function sameValue(current, next) {
  if (Array.isArray(next)) {
    const a = [...(current || [])].map(String).sort();
    const b = [...next].map(String).sort();
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }
  return current === next;
}

router.patch('/:eventId', ...organizerOnly, rejectIfCompleted, asyncHandler(async (req, res) => {
  const { event } = req;
  const input = readEventInput(req.body);
  const signupsStage = ['draft', 'open'].includes(event.status);

  for (const [field, label] of Object.entries(OPEN_ONLY_FIELDS)) {
    if (input[field] === undefined) continue;
    // The edit form sends every field back, so unchanged values are fine
    if (sameValue(event[field], input[field])) {
      delete input[field];
      continue;
    }
    if (!signupsStage) {
      throw httpError(409, `${label} can't be changed after sign-ups close.`, 'FIELD_LOCKED');
    }
  }

  if (input.maxParticipants !== undefined) {
    const accepted = await participantCount(event._id);
    if (input.maxParticipants < accepted) {
      throw invalid(`${accepted} people are already accepted, so the maximum can't be lower than that.`);
    }
  }

  const changedDeadlines = [];
  for (const [key, label] of Object.entries(DATE_FIELDS)) {
    if (input[key] === undefined) continue;
    if (input[key] === null) throw invalid(`${label} can't be empty.`);
    if (event[key] && input[key].getTime() === event[key].getTime()) {
      delete input[key];
      continue;
    }
    changedDeadlines.push(key);
  }
  const now = new Date();
  if (changedDeadlines.includes('signupDeadline') && signupsStage && input.signupDeadline <= now) {
    throw invalid('The sign-up deadline must be in the future.');
  }
  if (changedDeadlines.includes('submissionDeadline') && input.submissionDeadline <= now) {
    throw invalid('The submission deadline must be in the future.');
  }

  event.set(input);
  // A moved deadline gets its automatic reminders again, counted from the new date
  const resetKeys = changedDeadlines.flatMap((key) => DEADLINE_REMINDERS[key]);
  if (resetKeys.length) event.remindersSent = event.remindersSent.filter((k) => !resetKeys.includes(k));
  await event.save();

  if (changedDeadlines.length && event.status !== 'draft') {
    const lines = [];
    if (changedDeadlines.includes('signupDeadline')) lines.push(`Sign-ups now close ${formatDate(event.signupDeadline)}.`);
    if (changedDeadlines.includes('submissionDeadline')) {
      lines.push(`Gifts are now due ${formatDate(event.submissionDeadline)}.`);
    }
    await quietly(
      notifyMany(await acceptedUserIds(event._id, req.user._id), {
        type: 'event_status',
        title: `New deadlines for ${event.name}`,
        message: lines.join(' '),
        link: `/events/${event.id}`,
        email: 'eventUpdates',
      })
    );
  }

  // A higher limit lets people in from the waitlist
  if (input.maxParticipants !== undefined) await promoteFromWaitlist(event);

  res.json({ event: await serializeEvent(event, req.user, { ctx: req.viewer }) });
}));

router.delete('/:eventId', ...organizerOnly, asyncHandler(async (req, res) => {
  const { event } = req;
  const finished = event.status === 'completed';
  await quietly(
    notifyMany(await acceptedUserIds(event._id, req.user._id), {
      type: 'event_status',
      title: finished ? `${event.name} was removed` : `${event.name} was cancelled`,
      message: finished
        ? 'The organisers deleted this event.'
        : 'The organisers deleted this event, so it will not go ahead.',
      link: '/my-events',
      email: 'eventUpdates',
    })
  );

  await deleteEventCascade(event);
  res.json({ ok: true });
}));

// ---------- Lifecycle ----------

router.post('/:eventId/status', ...organizerOnly, asyncHandler(async (req, res) => {
  const { event } = req;
  const from = event.status;
  const to = typeof req.body?.status === 'string' ? req.body.status : '';
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

  const now = new Date();
  if (to === 'open' && !(event.signupDeadline > now)) {
    throw httpError(
      400,
      'The sign-up deadline has passed. Set a new one before opening sign-ups.',
      'DEADLINE_PASSED'
    );
  }
  if (from === 'open' && to === 'draft') {
    if (await Application.exists({ event: event._id, status: { $ne: 'withdrawn' } })) {
      throw httpError(409, "People have already signed up, so this event can't go back to draft.", 'HAS_APPLICATIONS');
    }
  }

  event.setStatus(to, req.user._id);
  await event.save();

  if (from === 'matching' && to === 'open') {
    await Match.deleteMany({ event: event._id, published: false });
  }
  if (to === 'open') announceMilestone(event, 'signups_open');
  if (from === 'open' && to === 'matching') announceMilestone(event, 'signups_closed');
  if (from === 'active' && to === 'completed') announceMilestone(event, 'revealed');

  if (from === 'open' && to === 'matching') {
    await quietly(
      notifyMany(await acceptedUserIds(event._id, req.user._id), {
        type: 'event_status',
        title: `Sign-ups closed for ${event.name}, matches are on the way`,
        message: "You'll get a notification as soon as you can see who you're making a gift for.",
        link: `/events/${event.id}`,
        email: 'eventUpdates',
      })
    );
  }
  if (from === 'active' && to === 'completed') {
    await quietly(
      notifyMany(await acceptedUserIds(event._id, req.user._id), {
        type: 'gift_revealed',
        title: `Gifts for ${event.name} are revealed!`,
        message: 'See the gift made for you, who your Secret Santa was, and everything else from the exchange.',
        link: `/events/${event.id}/results`,
        email: 'eventUpdates',
      })
    );
  }

  res.json({ event: await serializeEvent(event, req.user, { ctx: req.viewer }) });
}));

// The museum's room design. Unlike the other settings it can change after the event is over,
// since that's when its museum opens.
router.put('/:eventId/museum-theme', ...organizerOnly, asyncHandler(async (req, res) => {
  const choice = req.body?.museumTheme;
  if (!MUSEUM_THEME_CHOICES.includes(choice)) throw invalid('Pick one of the room designs.');
  req.event.museumTheme = choice;
  await req.event.save();
  res.json({ museumTheme: req.event.museumTheme });
}));

router.post('/:eventId/invite/regenerate', ...organizerOnly, asyncHandler(async (req, res) => {
  const inviteCode = req.event.regenerateInviteCode();
  await req.event.save();
  res.json({ inviteCode });
}));

// ---------- Duplicate ----------

// Settings copied into a new draft. People, matches, gifts and the invite code are not.
const COPIED_FIELDS = [
  'description', 'theme', 'season', 'rules', 'tags', 'platform', 'platformName', 'platformLink', 'timeZone', 'discordWebhookUrl',
  'minParticipants', 'maxParticipants', 'allowedTypes', 'publicity', 'requireApproval', 'adultOnly', 'bannerUrl', 'museumTheme',
];
const DUPLICATE_SIGNUP_DAYS = 14;

// A date the caller may leave out
const optionalDate = (value, label) => (value === undefined ? null : readDate(value, label));

function copyName(name) {
  return `Copy of ${name}`.slice(0, LIMITS.eventName).trim();
}

router.post('/:eventId/duplicate', ...organizerOnly, asyncHandler(async (req, res) => {
  const source = req.event;
  const src = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};

  let name = src.name === undefined ? '' : readText(src.name, 'Name', LIMITS.eventName);
  if (!name) name = copyName(source.name);
  const now = new Date();
  const signupDeadline = optionalDate(src.signupDeadline, 'Sign-up deadline') ||
    new Date(now.getTime() + DUPLICATE_SIGNUP_DAYS * 24 * 60 * 60 * 1000);
  if (signupDeadline <= now) throw invalid('The sign-up deadline must be in the future.');
  // Same time for making gifts as the original had
  const gap = source.submissionDeadline.getTime() - source.signupDeadline.getTime();
  const submissionDeadline = optionalDate(src.submissionDeadline, 'Submission deadline') ||
    new Date(signupDeadline.getTime() + gap);

  const fields = {};
  for (const key of COPIED_FIELDS) {
    const value = source[key];
    fields[key] = Array.isArray(value) ? [...value] : value;
  }
  const event = new Event({ ...fields, name, signupDeadline, submissionDeadline, createdBy: req.user._id, status: 'draft' });
  event.setStatus('draft', req.user._id);
  await event.save();
  try {
    await EventMember.grant(req.user._id, event._id, 'organizer');
  } catch (err) {
    await event.deleteOne();
    throw err;
  }

  res.status(201).json({ event: await serializeEvent(event, req.user) });
}));

// ---------- Banner ----------

const bannerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.imageBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    if (IMAGE_TYPES[file.mimetype]) cb(null, true);
    else cb(httpError(400, 'Use a PNG, JPG, WebP or GIF image.', 'VALIDATION'));
  },
}).single('banner');

function receiveBanner(req, res, next) {
  bannerUpload(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      return next(httpError(400, 'Banner images must be 5 MB or smaller.', 'UPLOAD_INVALID'));
    }
    next(err);
  });
}

router.post('/:eventId/banner', ...organizerOnly, rejectIfCompleted, receiveBanner, asyncHandler(async (req, res) => {
  if (!req.file) throw invalid('Choose an image to upload.');
  if (!looksLikeImage(req.file)) throw invalid('Use a PNG, JPG, WebP or GIF image.');
  req.event.bannerUrl = await uploadImage('banners', req.file);
  await req.event.save();
  res.json({ event: await serializeEvent(req.event, req.user, { ctx: req.viewer }) });
}));

router.delete('/:eventId/banner', ...organizerOnly, rejectIfCompleted, asyncHandler(async (req, res) => {
  req.event.bannerUrl = '';
  await req.event.save();
  res.json({ event: await serializeEvent(req.event, req.user, { ctx: req.viewer }) });
}));

// ---------- Organisers ----------

router.get('/:eventId/organizers', optionalAuth, loadEvent, requireVisible, asyncHandler(async (req, res) => {
  res.json({ organizers: await organizerMinis(req.event._id) });
}));

router.post('/:eventId/organizers', ...organizerOnly, asyncHandler(async (req, res) => {
  const { event } = req;
  const raw = typeof req.body?.identifier === 'string' ? req.body.identifier.trim().toLowerCase() : '';
  if (!raw) throw invalid('Enter their email or username.');

  // Emails and usernames are stored lowercase, so an exact match is case-insensitive
  const query = raw.includes('@') && !raw.startsWith('@') ? { email: raw } : { username: raw.replace(/^@/, '') };
  const user = await User.findOne(query);
  if (!user || user.status === 'deactivated') {
    throw httpError(404, "We couldn't find anyone with that email or username.", 'USER_NOT_FOUND');
  }

  const already = await EventMember.exists({ user: user._id, event: event._id, roles: 'organizer' });
  if (!already) {
    await EventMember.grant(user._id, event._id, 'organizer');
    await quietly(
      notify(user._id, {
        type: 'organizer_added',
        title: `You're now an organiser of ${event.name}`,
        message: `${userMini(req.user).displayName} added you as an organiser.`,
        link: `/events/${event.id}/manage`,
        email: 'eventUpdates',
      })
    );
  }

  res.json({ organizers: await organizerMinis(event._id) });
}));

router.delete('/:eventId/organizers/:userId', ...organizerOnly, asyncHandler(async (req, res) => {
  const { event } = req;
  const { userId } = req.params;
  const notOrganizer = () => httpError(404, 'That person is not an organiser of this event.', 'NOT_FOUND');
  if (!mongoose.isValidObjectId(userId)) throw notOrganizer();
  if (!(await EventMember.exists({ user: userId, event: event._id, roles: 'organizer' }))) throw notOrganizer();

  const organizerCount = await EventMember.countDocuments({ event: event._id, roles: 'organizer' });
  if (organizerCount <= 1) {
    throw httpError(400, 'Every event needs at least one organiser. Add someone else first.', 'LAST_ORGANIZER');
  }

  await EventMember.revoke(userId, event._id, 'organizer');
  res.json({ organizers: await organizerMinis(event._id) });
}));

router.use(apiErrorHandler);

module.exports = router;
