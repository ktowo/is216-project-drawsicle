const { Router } = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const Application = require('../models/Application.js');
const Match = require('../models/Match.js');
const Submission = require('../models/Submission.js');
const { userMini } = require('../models/User.js');
const { requireAuth, loadEvent, requireEventRole } = require('../middleware/auth.js');
const { organizerIds, serializeEvent, viewerContext, canViewEvent } = require('../services/events.js');
const { notify, notifyMany } = require('../services/notify.js');
const { uploadImage, looksLikeImage, IMAGE_TYPES } = require('../services/storage.js');
const {
  loadMatchRows,
  requireParticipant,
  loadMyMatch,
  loadBackupMatch,
  rejectIfHandedOver,
} = require('./match-router.js');
const {
  LIMITS,
  CONTENT_WARNING_VALUES,
  REACTION_VALUES,
  orderImages,
  imageDescriptionsFor,
} = require('../../shared/constants.mjs');
const { asyncHandler, apiErrorHandler, httpError } = require('../utils/helpers.js');

// Mounted at /api/events/:eventId next to the application and match routers,
// so every route lists its own middleware instead of using router.use().
const router = Router({ mergeParams: true });

const invalid = (message) => httpError(400, message, 'VALIDATION');
const organizerOnly = [requireAuth, loadEvent, requireEventRole('organizer')];

const IMAGE_MB = Number((LIMITS.imageBytes / (1024 * 1024)).toFixed(1));
const LINK_LABEL_MAX = 60;
const LINK_URL_MAX = 500;
const REMINDER_MESSAGE_MAX = 500; // same as Notification.message
const REMINDER_AUDIENCES = ['missing_submissions', 'all_participants'];

const wrongType = () => httpError(400, 'Use a PNG, JPG, WebP or GIF image.', 'UPLOAD_INVALID');
const tooManyImages = () => httpError(400, `Up to ${LIMITS.submissionImages} images.`, 'UPLOAD_INVALID');

async function quietly(task) {
  try {
    await task;
  } catch (err) {
    console.error('Notification failed:', err.message);
  }
}

function formatDay(date) {
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ---------- Uploads ----------

// Memory storage: files go straight on to services/storage.js (local disk or Azure),
// so nothing depends on a writable disk on the server itself.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.imageBytes, files: LIMITS.submissionImages, fields: 20, fieldSize: 64 * 1024 },
  fileFilter: (req, file, cb) => {
    if (IMAGE_TYPES[file.mimetype]) cb(null, true);
    else cb(wrongType());
  },
}).array('images', LIMITS.submissionImages);

// ---------- Reading the submission form ----------

// Multipart sends everything as strings; a JSON body may already hold arrays.
// undefined means "not sent", which keeps the current value on an update.
function parseJsonField(value, label) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return value;
  if (!value.trim()) return [];
  try {
    return JSON.parse(value);
  } catch {
    throw invalid(`${label} could not be read. Please try again.`);
  }
}

function readText(value, label, max, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string' && typeof value !== 'number') throw invalid(`${label} must be text.`);
  const text = String(value).trim();
  if (text.length > max) throw invalid(`${label} is too long (max ${max} characters).`);
  return text;
}

function readUrl(raw) {
  const url = raw.trim();
  let parsed = null;
  try {
    parsed = new URL(url);
  } catch {
    // reported below
  }
  if (!parsed || !['http:', 'https:'].includes(parsed.protocol) || !/^https?:\/\/\S+$/i.test(url)) {
    throw invalid('Links must start with http:// or https://');
  }
  if (url.length > LINK_URL_MAX) throw invalid(`Links can be up to ${LINK_URL_MAX} characters.`);
  return url;
}

// [{ label, url }], dropping rows with no URL (empty rows from the form)
function readLinks(value, fallback) {
  const parsed = parseJsonField(value, 'Links');
  if (parsed === undefined) return fallback;
  if (!Array.isArray(parsed)) throw invalid('Links must be a list.');

  const links = [];
  for (const row of parsed) {
    const item = typeof row === 'string' ? { url: row } : row;
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw invalid('Each link needs a URL.');
    const rawUrl = typeof item.url === 'string' ? item.url : '';
    if (!rawUrl.trim()) continue;
    const label = typeof item.label === 'string' ? item.label.trim() : '';
    if (label.length > LINK_LABEL_MAX) throw invalid(`Link labels can be up to ${LINK_LABEL_MAX} characters.`);
    links.push({ label, url: readUrl(rawUrl) });
  }
  if (links.length > LIMITS.submissionLinks) throw invalid(`Up to ${LIMITS.submissionLinks} links.`);
  return links;
}

// Existing image URLs to keep, in the order given. Not sent: keep them all.
function readKeepImages(value, existing) {
  const parsed = parseJsonField(value, 'Images to keep');
  if (parsed === undefined) return [...existing];
  if (!Array.isArray(parsed) || parsed.some((url) => typeof url !== 'string')) {
    throw invalid('Images to keep must be a list of image links.');
  }
  const keep = [...new Set(parsed)];
  if (keep.some((url) => !existing.includes(url))) {
    throw invalid("One of the images to keep isn't part of this gift. Refresh the page and try again.");
  }
  return keep;
}

// ["blood", "horror"] (or its JSON); unknown warnings are refused rather than dropped
function readContentWarnings(value, fallback) {
  const parsed = parseJsonField(value, 'Content warnings');
  if (parsed === undefined) return [...fallback];
  if (!Array.isArray(parsed) || parsed.some((w) => !CONTENT_WARNING_VALUES.includes(w))) {
    throw invalid('Pick content warnings from the list.');
  }
  return [...new Set(parsed)];
}

// { "<image link>" | "new:<n>": "description" }
function readImageDescriptions(value) {
  const parsed = parseJsonField(value, 'Image descriptions');
  if (parsed === undefined) return undefined;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw invalid('Image descriptions could not be read. Please try again.');
  }
  for (const text of Object.values(parsed)) {
    if (typeof text !== 'string') throw invalid('Image descriptions must be text.');
    if (text.trim().length > LIMITS.imageDescription) {
      throw invalid(`Keep each image description under ${LIMITS.imageDescription} characters.`);
    }
  }
  return parsed;
}

function readType(value, allowedTypes, fallback) {
  if (value === undefined || value === null || value === '') {
    return allowedTypes.includes(fallback) ? fallback : allowedTypes[0];
  }
  const type = String(value).trim();
  if (!allowedTypes.includes(type)) throw invalid("This event doesn't allow that kind of gift.");
  return type;
}

// ---------- Guards ----------

// Gifts can only be added, changed or removed while the event is active
const requireActive = (req, res, next) => {
  if (req.event.status === 'active') return next();
  const message =
    req.event.status === 'completed'
      ? 'This event is finished, so gifts can no longer be changed.'
      : 'Gifts can be uploaded once the matches are published.';
  next(httpError(409, message, 'WRONG_STATUS'));
};

const giverOnly = [requireAuth, loadEvent, requireParticipant, loadMyMatch];
// The same gift routes for someone making a backup gift: /backups/:matchId/submission
const backupOnly = [requireAuth, loadEvent, requireParticipant, loadBackupMatch];

// ---------- My gift ----------

async function getGift(req, res) {
  const submission = await Submission.findOne({ match: req.match._id });
  res.json({ submission: submission ? submission.toPublic() : null });
}

router.get('/submission', ...giverOnly, rejectIfHandedOver, asyncHandler(getGift));
router.get('/backups/:matchId/submission', ...backupOnly, asyncHandler(getGift));

// Saves the gift for req.match, made by the logged-in person (the giver, or a backup)
async function saveGift(req, res) {
  const { event, match, user } = req;
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const files = req.files || [];

  // Check everything before storing any file, so a bad request leaves nothing behind
  if (files.some((file) => !looksLikeImage(file))) throw wrongType();

  const existing = await Submission.findOne({ match: match._id });
  const title = readText(body.title, 'Title', LIMITS.submissionTitle, existing?.title || '');
  const message = readText(body.message, 'Message', LIMITS.submissionMessage, existing?.message || '');
  const type = readType(body.type, event.allowedTypes, existing?.type);
  const links = readLinks(body.links, existing ? existing.links.map((l) => ({ label: l.label, url: l.url })) : []);
  const keep = readKeepImages(body.keepImages, existing ? [...existing.images] : []);
  const order = parseJsonField(body.imageOrder, 'Image order');
  const descriptions = readImageDescriptions(body.imageDescriptions);
  const contentWarnings = readContentWarnings(body.contentWarnings, existing?.contentWarnings || []);

  if (keep.length + files.length > LIMITS.submissionImages) throw tooManyImages();
  if (keep.length + files.length === 0 && links.length === 0) {
    throw invalid('Add at least one image or link so your recipient can see your gift.');
  }

  const uploaded = await Promise.all(files.map((file) => uploadImage('submissions', file)));

  const now = new Date();
  const submission =
    existing ||
    new Submission({
      event: event._id,
      match: match._id,
      giver: user._id,
      recipient: match.recipient,
      submittedAt: now,
    });
  const images = orderImages(order, keep, uploaded);
  submission.set({
    title,
    message,
    type,
    images,
    imageDescriptions: imageDescriptionsFor(images, keep, uploaded, descriptions, {
      images: existing?.images,
      descriptions: existing?.imageDescriptions,
    }),
    contentWarnings,
    links,
    late: now > event.submissionDeadline,
  });

  try {
    await submission.save();
  } catch (err) {
    // Two first submits at once (e.g. two tabs): the unique index on match stops the second
    if (err?.code === 11000) {
      throw httpError(409, 'Your gift was just saved somewhere else. Refresh the page and try again.', 'SUBMISSION_CHANGED');
    }
    throw err;
  }
  await Match.updateOne({ _id: match._id }, { $set: { status: 'submitted' } });

  if (!existing) {
    const recipients = (await organizerIds(event._id)).filter((id) => !id.equals(user._id));
    await quietly(
      notifyMany(recipients, {
        type: 'submission_received',
        title: `New gift submitted for ${event.name}`,
        message: `${userMini(user).displayName} uploaded their gift${submission.late ? ' after the deadline' : ''}.`,
        link: `/events/${event.id}/manage?tab=submissions`,
      })
    );
  }

  res.status(existing ? 200 : 201).json({ submission: submission.toPublic() });
}

router.put('/submission', ...giverOnly, rejectIfHandedOver, requireActive, upload, asyncHandler(saveGift));
router.put('/backups/:matchId/submission', ...backupOnly, requireActive, upload, asyncHandler(saveGift));

async function deleteGift(req, res) {
  const submission = await Submission.findOne({ match: req.match._id });
  if (!submission) throw httpError(404, "You haven't submitted a gift yet.", 'NOT_FOUND');
  await submission.deleteOne();
  await Match.updateOne({ _id: req.match._id }, { $set: { status: 'assigned' } });
  res.json({ ok: true });
}

router.delete('/submission', ...giverOnly, rejectIfHandedOver, requireActive, asyncHandler(deleteGift));
router.delete('/backups/:matchId/submission', ...backupOnly, requireActive, asyncHandler(deleteGift));

// ---------- Organisers ----------

router.get('/submissions', ...organizerOnly, asyncHandler(async (req, res) => {
  const { event } = req;
  const now = new Date();
  const pastDeadline = now > event.submissionDeadline;
  const matchRows = await loadMatchRows(event._id, { published: true });

  const rows = matchRows.map(({ admin, submission }) => ({
    match: admin,
    submission: submission ? submission.toPublic() : null,
    overdue: !submission && pastDeadline,
  }));
  const submitted = rows.filter((r) => r.submission);
  res.json({
    rows,
    counts: {
      total: rows.length,
      submitted: submitted.length,
      missing: rows.length - submitted.length,
      late: submitted.filter((r) => r.submission.late).length,
      verified: submitted.filter((r) => r.submission.verified).length,
    },
  });
}));

router.patch('/submissions/:submissionId', ...organizerOnly, asyncHandler(async (req, res) => {
  const verified = req.body?.verified;
  if (typeof verified !== 'boolean') throw invalid('verified must be true or false.');

  const { submissionId } = req.params;
  const missing = () => httpError(404, 'Submission not found.', 'NOT_FOUND');
  if (!mongoose.isValidObjectId(submissionId)) throw missing();
  const submission = await Submission.findOne({ _id: submissionId, event: req.event._id });
  if (!submission) throw missing();

  submission.verified = verified;
  submission.verifiedAt = verified ? new Date() : null;
  submission.verifiedBy = verified ? req.user._id : null;
  await submission.save();
  res.json({ submission: submission.toPublic() });
}));

// Default text for a reminder, depending on where the event is
function defaultReminder(event, audience, now) {
  if (audience === 'missing_submissions') {
    return now > event.submissionDeadline
      ? `The submission deadline was ${formatDay(event.submissionDeadline)}. Please upload your gift as soon as you can.`
      : `Your gift is due ${formatDay(event.submissionDeadline)}. Upload it from the event page when it's ready.`;
  }
  if (event.status === 'open') {
    return `Sign-ups close ${formatDay(event.signupDeadline)}. Check the event page for the details.`;
  }
  if (event.status === 'matching') {
    return "Sign-ups are closed and matches are being made. You'll get a notification when yours is ready.";
  }
  return `Gifts are due ${formatDay(event.submissionDeadline)}. Check the event page for the details.`;
}

// The deadline that matters right now, added under an organiser's own message
function deadlineLine(event, now) {
  if (event.status === 'open') return `Sign-ups close ${formatDay(event.signupDeadline)}.`;
  if (event.status === 'active' && now <= event.submissionDeadline) {
    return `Gifts are due ${formatDay(event.submissionDeadline)}.`;
  }
  return '';
}

router.post('/reminders', ...organizerOnly, asyncHandler(async (req, res) => {
  const { event, user } = req;
  const audience = req.body?.audience;
  if (!REMINDER_AUDIENCES.includes(audience)) {
    throw invalid('Choose who gets the reminder: missing_submissions or all_participants.');
  }
  const custom = readText(req.body?.message, 'Message', REMINDER_MESSAGE_MAX, '');

  let userIds = [];
  if (audience === 'missing_submissions') {
    if (event.status !== 'active') {
      throw httpError(409, 'Submission reminders can only be sent while the event is active.', 'WRONG_STATUS');
    }
    const [matches, submittedMatchIds] = await Promise.all([
      Match.find({ event: event._id, published: true }).select('giver backupGiver'),
      Submission.find({ event: event._id }).distinct('match'),
    ]);
    const done = new Set(submittedMatchIds.map(String));
    userIds = matches.filter((m) => !done.has(m._id.toString())).map((m) => m.backupGiver || m.giver);
  } else {
    if (['draft', 'completed'].includes(event.status)) {
      throw httpError(409, 'Reminders can only be sent while the event is running.', 'WRONG_STATUS');
    }
    userIds = await Application.find({ event: event._id, status: 'accepted' }).distinct('user');
  }
  // Organisers who also take part don't need a reminder they sent themselves
  userIds = userIds.filter((id) => !id.equals(user._id));

  const now = new Date();
  const line = deadlineLine(event, now);
  let message = custom || defaultReminder(event, audience, now);
  if (custom && line && custom.length + line.length + 2 <= REMINDER_MESSAGE_MAX) message = `${custom}\n\n${line}`;

  const created = await notifyMany(userIds, {
    type: 'deadline_reminder',
    title: `Reminder from the organisers of ${event.name}`,
    message,
    link: audience === 'missing_submissions' ? `/events/${event.id}/submit` : `/events/${event.id}`,
    email: 'reminders',
  });
  res.json({ sent: created.length });
}));

// ---------- Results (the reveal) ----------

router.get('/results', requireAuth, loadEvent, asyncHandler(async (req, res) => {
  const { event, user } = req;
  const ctx = await viewerContext(event, user);
  // Drafts and private events stay hidden from people who can't see them at all
  if (!canViewEvent(event, ctx)) throw httpError(404, 'Event not found.', 'NOT_FOUND');
  if (event.status !== 'completed') {
    throw httpError(409, 'Gifts are revealed once the organisers close the event.', 'NOT_COMPLETED');
  }
  if (!ctx.isOrganizer && !ctx.isParticipant) {
    throw httpError(403, 'Only the organisers and participants of this event can see the gifts.', 'ACCESS_DENIED');
  }

  const rows = await loadMatchRows(event._id, { published: true });
  const me = user._id.toString();
  const idOf = (x) => (x?._id || x)?.toString();
  // Who actually made each gift: the backup when one took it over
  const madeBy = (r) =>
    r.submission && idOf(r.submission.giver) !== idOf(r.match.giver) && r.admin.backupGiver ? r.admin.backupGiver : r.admin.giver;
  const received = rows.find((r) => idOf(r.match.recipient) === me);
  const given = rows.find((r) => idOf(r.match.giver) === me);
  const handedOver = Boolean(given && given.match.backupGiver);
  const backups = rows.filter((r) => r.submission && idOf(r.submission.giver) === me && idOf(r.match.giver) !== me);

  res.json({
    event: await serializeEvent(event, user, { ctx }),
    received: received
      ? { giver: madeBy(received), submission: received.submission ? received.submission.toPublic() : null }
      : null,
    given: given
      ? {
          recipient: given.admin.recipient,
          handedOver,
          submission: given.submission && !handedOver ? given.submission.toPublic() : null,
        }
      : null,
    backups: backups.map((r) => ({ recipient: r.admin.recipient, submission: r.submission.toPublic() })),
    gallery: rows
      .filter((r) => r.submission)
      .map((r) => ({ giver: madeBy(r), recipient: r.admin.recipient, submission: r.submission.toPublic() })),
  });
}));

// ---------- Thank-you notes (after the reveal) ----------

// The gift the viewer received in a completed event
async function loadReceivedGift(req) {
  const { event, user } = req;
  if (event.status !== 'completed') {
    throw httpError(409, 'You can thank your Secret Santa once the gifts are revealed.', 'NOT_COMPLETED');
  }
  const match = await Match.findOne({ event: event._id, recipient: user._id, published: true });
  const submission = match && (await Submission.findOne({ match: match._id }));
  if (!submission) throw httpError(404, "There's no gift for you to thank in this event.", 'NOT_FOUND');
  return submission;
}

router.put('/thanks', requireAuth, loadEvent, asyncHandler(async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const submission = await loadReceivedGift(req);
  const message = readText(body.message, 'Thank-you note', LIMITS.thanksMessage, '');
  const reaction = body.reaction === undefined || body.reaction === null ? '' : String(body.reaction);
  if (reaction && !REACTION_VALUES.includes(reaction)) throw invalid('Pick a reaction from the list.');
  if (!message && !reaction) throw invalid('Write a note or pick a reaction.');

  const first = !submission.thanks?.at;
  submission.thanks = { message, reaction, at: new Date() };
  await submission.save();

  if (first) {
    await quietly(
      notify(submission.giver, {
        type: 'gift_thanked',
        title: `${userMini(req.user).displayName} thanked you for your gift`,
        message: message || 'They reacted to the gift you made them.',
        link: `/events/${req.event.id}/results`,
        email: 'eventUpdates',
      })
    );
  }
  res.json({ submission: submission.toPublic() });
}));

router.delete('/thanks', requireAuth, loadEvent, asyncHandler(async (req, res) => {
  const submission = await loadReceivedGift(req);
  submission.thanks = { message: '', reaction: '', at: null };
  await submission.save();
  res.json({ submission: submission.toPublic() });
}));

// Friendlier messages for multer's own limits; everything else goes to the shared handler
router.use((err, req, res, next) => {
  if (err?.name !== 'MulterError') return next(err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return next(httpError(400, `Each image must be ${IMAGE_MB} MB or smaller.`, 'UPLOAD_INVALID'));
  }
  if (err.code === 'LIMIT_FILE_COUNT') return next(tooManyImages());
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return next(err.field === 'images' ? tooManyImages() : httpError(400, 'Send images in the "images" field.', 'UPLOAD_INVALID'));
  }
  next(err);
});

router.use(apiErrorHandler);

module.exports = router;
