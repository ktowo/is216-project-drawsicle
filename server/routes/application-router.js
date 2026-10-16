const { Router } = require('express');
const mongoose = require('mongoose');
const Application = require('../models/Application.js');
const Character = require('../models/Character.js');
const EventMember = require('../models/EventMember.js');
const Match = require('../models/Match.js');
const { userMini } = require('../models/User.js');
const { requireAuth, loadEvent, requireEventRole } = require('../middleware/auth.js');
const { organizerIds, participantCount, viewerContext, canViewEvent } = require('../services/events.js');
const { notify, notifyMany } = require('../services/notify.js');
const { readCharacterInput } = require('./character-router.js');
const { promoteFromWaitlist } = require('../services/waitlist.js');
const {
  APPLICATION_STATUSES,
  CREATION_TYPES,
  LIMITS,
  labelFor,
  normalizeTags,
  signupsOpen,
} = require('../../shared/constants.mjs');
const { asyncHandler, apiErrorHandler, httpError } = require('../utils/helpers.js');
const { STYLE_PREFERENCES } = require('../../shared/style.mjs');

// Mounted at /api/events/:eventId, next to the match and submission routers,
// so every route lists its own middleware instead of using router.use().
const router = Router({ mergeParams: true });

const invalid = (message) => httpError(400, message, 'VALIDATION');
const USER_FIELDS = 'displayName username avatarUrl email';

async function quietly(task) {
  try {
    await task;
  } catch (err) {
    console.error('Notification failed:', err.message);
  }
}

// The applicant routes only work on events the user is allowed to see (404 otherwise).
const requireVisible = asyncHandler(async (req, res, next) => {
  const ctx = await viewerContext(req.event, req.user);
  const invite = typeof req.query.invite === 'string' ? req.query.invite : undefined;
  if (!canViewEvent(req.event, ctx, invite)) throw httpError(404, 'Event not found.', 'NOT_FOUND');
  req.viewer = ctx;
  next();
});

const applicant = [requireAuth, loadEvent, requireVisible];
const organizerOnly = [requireAuth, loadEvent, requireVisible, requireEventRole('organizer')];

const signupsClosed = () => httpError(409, 'Sign-ups for this event are closed.', 'SIGNUPS_CLOSED');
const rejected = () =>
  httpError(403, "The organisers didn't accept your application for this event.", 'APPLICATION_REJECTED');
const eventFull = () => httpError(409, 'This event is full.', 'EVENT_FULL');

async function isFull(event) {
  return (await participantCount(event._id)) >= event.maxParticipants;
}

// Application JSON with the user and offered characters filled in.
// Expects `user` and `offeredCharacters` to be populated.
function applicationJson(application) {
  const characters = (application.offeredCharacters || []).filter((c) => c && c._id && c.toPublic);
  return application.toPublic({
    user: userMini(application.user),
    characters: characters.map((c) => c.toPublic()),
  });
}

function populateApplication(application) {
  return application.populate([{ path: 'user', select: USER_FIELDS }, { path: 'offeredCharacters' }]);
}

// ---------- Reading the sign-up form ----------

function readText(value, label, max) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' && typeof value !== 'number') throw invalid(`${label} must be text.`);
  const text = String(value).trim();
  if (text.length > max) throw invalid(`${label} is too long (max ${max} characters).`);
  return text;
}

function readList(value, label) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(',');
  throw invalid(`${label} must be a list.`);
}

// Both lists must use only what the event allows
function readTypes(value, allowedTypes, { label, emptyMessage }) {
  const types = [...new Set(readList(value, label).map((t) => String(t).trim()).filter(Boolean))];
  if (!types.length) throw invalid(emptyMessage);
  const outside = types.filter((t) => !allowedTypes.includes(t));
  if (outside.length) {
    const allowed = allowedTypes.map((t) => labelFor(CREATION_TYPES, t)).join(', ');
    throw invalid(`This event only allows: ${allowed}.`);
  }
  return types;
}

const OBJECT_ID_RE = /^[a-f\d]{24}$/;

// Lowercased so they compare equal to ObjectId.toString()
function readCharacterIds(value) {
  const list = readList(value, 'Offered characters').map((id) => String(id).trim().toLowerCase());
  const ids = [...new Set(list.filter(Boolean))];
  if (ids.some((id) => !OBJECT_ID_RE.test(id))) {
    throw invalid("One of the characters you picked isn't in your library.");
  }
  return ids;
}

function readSignupForm(body, event) {
  const src = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const newCharacters = src.newCharacters ?? [];
  if (!Array.isArray(newCharacters)) throw invalid('New characters must be a list.');

  return {
    communityUsername: readText(src.communityUsername, 'Community username', LIMITS.communityUsername),
    canCreate: readTypes(src.canCreate, event.allowedTypes, {
      label: 'What you can make',
      emptyMessage: 'Pick at least one thing you can make.',
    }),
    wantsTypes: readTypes(src.wantsTypes, event.allowedTypes, {
      label: 'What you would like',
      emptyMessage: 'Pick at least one thing you would like to receive.',
    }),
    offeredCharacterIds: readCharacterIds(src.offeredCharacterIds),
    newCharacters,
    likes: readText(src.likes, 'Likes', LIMITS.formText),
    avoid: readText(src.avoid, 'Things to avoid', LIMITS.formText),
    cannotDraw: normalizeTags(readList(src.cannotDraw, "Things you can't draw")),
    notes: readText(src.notes, 'Notes for the organisers', LIMITS.formText),
    saveAsDefault: src.saveAsDefault === true || src.saveAsDefault === 'true',
    canBackup: src.canBackup === true || src.canBackup === 'true',
    stylePreference: STYLE_PREFERENCES.includes(src.stylePreference) ? src.stylePreference : 'any',
  };
}

// ---------- My application ----------

router.get('/application', ...applicant, asyncHandler(async (req, res) => {
  const application = req.viewer.application;
  if (!application) return res.json({ application: null });
  await populateApplication(application);
  res.json({ application: applicationJson(application) });
}));

router.put('/application', ...applicant, asyncHandler(async (req, res) => {
  const { event, user } = req;
  if (!signupsOpen(event)) throw signupsClosed();

  const existing = req.viewer.application;
  if (existing?.status === 'rejected') throw rejected();
  const isNew = !existing || existing.status === 'withdrawn';
  // A full event: join the waitlist if asked to, otherwise say it's full
  let joinWaitlist = false;
  if (isNew && (await isFull(event))) {
    if (req.body?.waitlist !== true) throw eventFull();
    joinWaitlist = true;
  }

  const form = readSignupForm(req.body, event);
  if (isNew && event.adultOnly && req.body?.confirmAdult !== true) {
    throw httpError(400, "This event is for adults. Confirm you're 18 or older to sign up.", 'AGE_CONFIRM');
  }

  // Characters picked from the library: mine, and not archived unless they're already on this application
  const picked = form.offeredCharacterIds.length
    ? await Character.find({ _id: { $in: form.offeredCharacterIds }, owner: user._id })
    : [];
  if (picked.length !== form.offeredCharacterIds.length) {
    throw invalid("One of the characters you picked isn't in your library.");
  }
  // A withdrawn application starts over, so its old characters get no exception
  const alreadyOffered = new Set((isNew ? [] : existing.offeredCharacters || []).map(String));
  const archived = picked.find((c) => c.archivedAt && !alreadyOffered.has(c._id.toString()));
  if (archived) throw invalid(`${archived.name} is archived. Restore it in your library to offer it.`);

  const total = picked.length + form.newCharacters.length;
  if (total < LIMITS.offeredCharactersMin || total > LIMITS.offeredCharactersMax) {
    throw invalid(`Offer between ${LIMITS.offeredCharactersMin} and ${LIMITS.offeredCharactersMax} characters.`);
  }

  // Check every new character before saving any, so a bad one doesn't leave the others behind
  const created = form.newCharacters.map((input) => new Character({ ...readCharacterInput(input), owner: user._id }));
  await Promise.all(created.map((c) => c.validate()));

  const byId = new Map([...picked, ...created].map((c) => [c._id.toString(), c]));
  const offered = [...form.offeredCharacterIds.map((id) => byId.get(id)), ...created];

  const application = existing || new Application({ event: event._id, user: user._id });
  application.set({
    communityUsername: form.communityUsername,
    canCreate: form.canCreate,
    wantsTypes: form.wantsTypes,
    offeredCharacters: offered.map((c) => c._id),
    likes: form.likes,
    avoid: form.avoid,
    cannotDraw: form.cannotDraw,
    notes: form.notes,
    canBackup: form.canBackup,
    stylePreference: form.stylePreference,
  });
  if (isNew) {
    application.status = joinWaitlist ? 'waitlisted' : event.requireApproval ? 'pending' : 'accepted';
    application.waitlistedAt = joinWaitlist ? new Date() : null;
    application.reviewedBy = null;
    application.reviewedAt = null;
  }
  await application.validate();

  await Promise.all(created.map((c) => c.save()));
  try {
    await application.save();
  } catch (err) {
    // Two sign-ups from the same person at once: the unique index stops the second
    if (err?.code === 11000) throw httpError(409, 'You have already signed up for this event.', 'ALREADY_APPLIED');
    throw err;
  }

  if (application.status === 'accepted') await EventMember.grant(user._id, event._id, 'participant');

  if (form.saveAsDefault) {
    user.defaultForm = {
      communityUsername: form.communityUsername,
      canCreate: form.canCreate,
      wantsTypes: form.wantsTypes,
      likes: form.likes,
      avoid: form.avoid,
      cannotDraw: form.cannotDraw,
    };
    await user.save();
  }

  if (isNew) {
    const name = userMini(user).displayName;
    const recipients = (await organizerIds(event._id)).filter((id) => !id.equals(user._id));
    await quietly(
      notifyMany(recipients, {
        type: 'application_received',
        title: `New sign-up for ${event.name}`,
        message:
          application.status === 'waitlisted'
            ? `${name} joined the waitlist.`
            : application.status === 'pending'
              ? `${name} applied and is waiting for your review.`
              : `${name} joined the exchange.`,
        link: `/events/${event.id}/manage?tab=participants`,
      })
    );
  }

  const json = application.toPublic({
    user: userMini(user),
    characters: offered.map((c) => c.toPublic()),
  });
  res.status(isNew ? 201 : 200).json({
    application: json,
    createdCharacters: created.map((c) => c.toPublic({ inUse: true, eventCount: 1 })),
  });
}));

router.delete('/application', ...applicant, asyncHandler(async (req, res) => {
  const { event, user } = req;
  const application = req.viewer.application;
  if (!application || application.status === 'withdrawn') {
    throw httpError(404, "You haven't signed up for this event.", 'NOT_FOUND');
  }
  // Withdrawing and re-applying would get around the rejection
  if (application.status === 'rejected') throw rejected();
  if (!signupsOpen(event)) throw signupsClosed();

  const freedPlace = application.status === 'accepted';
  application.status = 'withdrawn';
  application.waitlistedAt = null;
  await application.save();
  await EventMember.revoke(user._id, event._id, 'participant');
  if (freedPlace) await promoteFromWaitlist(event);
  res.json({ ok: true });
}));

// ---------- Organiser review ----------

router.get('/applications', ...organizerOnly, asyncHandler(async (req, res) => {
  const { event } = req;
  const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
  if (status && !APPLICATION_STATUSES.includes(status)) {
    throw invalid(`status must be one of: ${APPLICATION_STATUSES.join(', ')}.`);
  }

  const filter = { event: event._id };
  if (status) filter.status = status;
  const [applications, countRows] = await Promise.all([
    Application.find(filter)
      .sort({ createdAt: 1, _id: 1 })
      .populate('user', USER_FIELDS)
      .populate('offeredCharacters'),
    Application.aggregate([{ $match: { event: event._id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);

  const counts = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0]));
  for (const row of countRows) counts[row._id] = row.count;

  res.json({ applications: applications.map(applicationJson), counts });
}));

router.patch('/applications/:applicationId', ...organizerOnly, asyncHandler(async (req, res) => {
  const { event } = req;
  const status = req.body?.status;
  if (status !== 'accepted' && status !== 'rejected') throw invalid('status must be accepted or rejected.');
  if (!['open', 'matching'].includes(event.status)) {
    throw httpError(409, 'Applications can only be reviewed until the matches are published.', 'EVENT_LOCKED');
  }

  const { applicationId } = req.params;
  const missing = () => httpError(404, 'Application not found.', 'NOT_FOUND');
  if (!mongoose.isValidObjectId(applicationId)) throw missing();
  const application = await Application.findOne({ _id: applicationId, event: event._id });
  if (!application) throw missing();
  if (application.status === 'withdrawn') {
    throw httpError(409, 'This person withdrew their application.', 'APPLICATION_WITHDRAWN');
  }

  let matchesCleared = false;
  const freedPlace = application.status === 'accepted' && status === 'rejected';
  if (application.status !== status) {
    if (status === 'accepted' && (await isFull(event))) throw eventFull();

    application.status = status;
    application.waitlistedAt = null;
    application.reviewedBy = req.user._id;
    application.reviewedAt = new Date();
    await application.save();

    if (status === 'accepted') await EventMember.grant(application.user, event._id, 'participant');
    else await EventMember.revoke(application.user, event._id, 'participant');

    // Draft matches were made from the old participant list
    if (event.status === 'matching') {
      const { deletedCount } = await Match.deleteMany({ event: event._id, published: false });
      matchesCleared = deletedCount > 0;
    }

    await quietly(
      notify(application.user, status === 'accepted'
        ? {
            type: 'application_accepted',
            title: `You're in! Your sign-up for ${event.name} was accepted`,
            message: "You'll be told who you're making a gift for once matches are published.",
            link: `/events/${event.id}`,
            email: 'eventUpdates',
          }
        : {
            type: 'application_rejected',
            title: `Your sign-up for ${event.name} wasn't accepted`,
            message: 'The organisers decided not to include you in this exchange. Thanks for your interest.',
            link: `/events/${event.id}`,
            email: 'eventUpdates',
          })
    );
  }

  if (freedPlace) await promoteFromWaitlist(event);

  await populateApplication(application);
  const body = { application: applicationJson(application) };
  if (event.status === 'matching') body.matchesCleared = matchesCleared;
  res.json(body);
}));

router.use(apiErrorHandler);

module.exports = router;
