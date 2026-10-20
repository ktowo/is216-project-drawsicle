// /events/:eventId/submission(s), /reminders and /results (server/routes/submission-router.js)
import {
  LIMITS,
  CONTENT_WARNING_VALUES,
  REACTION_VALUES,
  orderImages,
  imageDescriptionsFor,
} from '@shared/constants.mjs';
import { newId } from '../db.js';
import { IMAGE_TYPES, filesFrom, imageToDataUrl, looksLikeImage } from '../files.js';
import {
  canViewEvent,
  miniOf,
  notify,
  notifyMany,
  organizerIds,
  serializeEvent,
  submissionForMatch,
  submissionPublic,
  viewerContext,
} from '../model.js';
import { formatDay, httpError, invalid } from '../util.js';
import { loadEvent, myMatch, participantEvent, roleEvent } from './common.js';
import { adminMatches, backupMatch } from './matches.js';

const IMAGE_MB = Number((LIMITS.imageBytes / (1024 * 1024)).toFixed(1));
const LINK_LABEL_MAX = 60;
const LINK_URL_MAX = 500;
const REMINDER_MESSAGE_MAX = 500;
const REMINDER_AUDIENCES = ['missing_submissions', 'all_participants'];

const wrongType = () => httpError(400, 'Use a PNG, JPG, WebP or GIF image.', 'UPLOAD_INVALID');
const tooManyImages = () => httpError(400, `Up to ${LIMITS.submissionImages} images.`, 'UPLOAD_INVALID');

// ---------- Reading the submission form ----------

// A FormData field (strings) or a JSON body value; undefined means "not sent"
function field(ctx, key) {
  if (ctx.form && typeof ctx.form.has === 'function') {
    if (!ctx.form.has(key)) return undefined;
    const value = ctx.form.get(key);
    return typeof value === 'string' ? value : undefined;
  }
  return ctx.body[key];
}

// Multipart sends everything as strings; a JSON body may already hold arrays
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

function readContentWarnings(value, fallback) {
  const parsed = parseJsonField(value, 'Content warnings');
  if (parsed === undefined) return [...fallback];
  if (!Array.isArray(parsed) || parsed.some((w) => !CONTENT_WARNING_VALUES.includes(w))) {
    throw invalid('Pick content warnings from the list.');
  }
  return [...new Set(parsed)];
}

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

function readType(value, allowedTypes, fallback) {
  if (value === undefined || value === null || value === '') {
    return allowedTypes.includes(fallback) ? fallback : allowedTypes[0];
  }
  const type = String(value).trim();
  if (!allowedTypes.includes(type)) throw invalid("This event doesn't allow that kind of gift.");
  return type;
}

// Gifts can only be added, changed or removed while the event is active
function requireActive(event) {
  if (event.status === 'active') return;
  const message =
    event.status === 'completed'
      ? 'This event is finished, so gifts can no longer be changed.'
      : 'Gifts can be uploaded once the matches are published.';
  throw httpError(409, message, 'WRONG_STATUS');
}

function giver(ctx) {
  const { user, event } = participantEvent(ctx);
  const match = ctx.params.matchId ? backupMatch(ctx, event, user) : myMatch(ctx, event, user);
  if (!ctx.params.matchId && match.backupGiver) {
    throw httpError(409, 'This gift was handed to a backup artist, so you no longer need to make it.', 'HANDED_OVER');
  }
  return { user, event, match };
}

// ---------- Reminder text ----------

function defaultReminder(event, audience, now) {
  if (audience === 'missing_submissions') {
    return now > new Date(event.submissionDeadline)
      ? `The submission deadline was ${formatDay(event.submissionDeadline)}. Please upload your gift as soon as you can.`
      : `Your gift is due ${formatDay(event.submissionDeadline)}. Upload it from the event page when it's ready.`;
  }
  if (event.status === 'open') return `Sign-ups close ${formatDay(event.signupDeadline)}. Check the event page for the details.`;
  if (event.status === 'matching') {
    return "Sign-ups are closed and matches are being made. You'll get a notification when yours is ready.";
  }
  return `Gifts are due ${formatDay(event.submissionDeadline)}. Check the event page for the details.`;
}

// The deadline that matters right now, added under an organiser's own message
function deadlineLine(event, now) {
  if (event.status === 'open') return `Sign-ups close ${formatDay(event.signupDeadline)}.`;
  if (event.status === 'active' && now <= new Date(event.submissionDeadline)) {
    return `Gifts are due ${formatDay(event.submissionDeadline)}.`;
  }
  return '';
}

export function register(router) {
  function getGift(ctx) {
    const { match } = giver(ctx);
    const submission = submissionForMatch(ctx.state, match.id);
    return { submission: submission ? submissionPublic(submission) : null };
  }
  router.get('/events/:eventId/submission', getGift);
  router.get('/events/:eventId/backups/:matchId/submission', getGift);

  async function saveGift(ctx) {
    const { user, event, match } = giver(ctx);
    const { state } = ctx;
    requireActive(event);

    const files = filesFrom(ctx.form, 'images');
    if (files.length > LIMITS.submissionImages) throw tooManyImages();
    for (const file of files) {
      if (!IMAGE_TYPES[file.type]) throw wrongType();
      if (file.size > LIMITS.imageBytes) throw httpError(400, `Each image must be ${IMAGE_MB} MB or smaller.`, 'UPLOAD_INVALID');
    }
    for (const file of files) if (!(await looksLikeImage(file))) throw wrongType();

    const existing = submissionForMatch(state, match.id);
    const title = readText(field(ctx, 'title'), 'Title', LIMITS.submissionTitle, existing?.title || '');
    const message = readText(field(ctx, 'message'), 'Message', LIMITS.submissionMessage, existing?.message || '');
    const type = readType(field(ctx, 'type'), event.allowedTypes, existing?.type);
    const links = readLinks(field(ctx, 'links'), existing ? existing.links.map((l) => ({ ...l })) : []);
    const keep = readKeepImages(field(ctx, 'keepImages'), existing ? [...existing.images] : []);
    const order = parseJsonField(field(ctx, 'imageOrder'), 'Image order');
    const descriptions = readImageDescriptions(field(ctx, 'imageDescriptions'));
    const contentWarnings = readContentWarnings(field(ctx, 'contentWarnings'), existing?.contentWarnings || []);

    if (keep.length + files.length > LIMITS.submissionImages) throw tooManyImages();
    if (keep.length + files.length === 0 && links.length === 0) {
      throw invalid('Add at least one image or link so your recipient can see your gift.');
    }

    const uploaded = [];
    for (const file of files) uploaded.push(await imageToDataUrl(file));

    const at = ctx.now.toISOString();
    const submission = existing || {
      id: newId(),
      event: event.id,
      match: match.id,
      giver: user.id,
      recipient: match.recipient,
      submittedAt: at,
      verified: false,
      verifiedAt: null,
      verifiedBy: null,
      createdAt: at,
    };
    const images = orderImages(order, keep, uploaded);
    Object.assign(submission, {
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
      late: ctx.now > new Date(event.submissionDeadline),
      updatedAt: at,
    });
    if (!existing) state.submissions.push(submission);
    match.status = 'submitted';
    match.updatedAt = at;

    if (!existing) {
      notifyMany(
        state,
        organizerIds(state, event.id).filter((id) => id !== user.id),
        {
          type: 'submission_received',
          title: `New gift submitted for ${event.name}`,
          message: `${miniOf(state, user.id).displayName} uploaded their gift${submission.late ? ' after the deadline' : ''}.`,
          link: `/events/${event.id}/manage?tab=submissions`,
        }
      );
    }

    ctx.status = existing ? 200 : 201;
    return { submission: submissionPublic(submission) };
  }
  router.put('/events/:eventId/submission', saveGift);
  router.put('/events/:eventId/backups/:matchId/submission', saveGift);

  function deleteGift(ctx) {
    const { event, match } = giver(ctx);
    requireActive(event);
    const submission = submissionForMatch(ctx.state, match.id);
    if (!submission) throw httpError(404, "You haven't submitted a gift yet.", 'NOT_FOUND');
    ctx.state.submissions = ctx.state.submissions.filter((s) => s !== submission);
    match.status = 'assigned';
    match.updatedAt = ctx.now.toISOString();
    return { ok: true };
  }
  router.delete('/events/:eventId/submission', deleteGift);
  router.delete('/events/:eventId/backups/:matchId/submission', deleteGift);

  // ---------- Organisers ----------

  router.get('/events/:eventId/submissions', (ctx) => {
    const { event } = roleEvent(ctx, 'organizer');
    const pastDeadline = ctx.now > new Date(event.submissionDeadline);
    const rows = adminMatches(ctx.state, event.id, { publishedOnly: true }).map(({ match, admin }) => {
      const submission = submissionForMatch(ctx.state, match.id);
      return {
        match: admin,
        submission: submission ? submissionPublic(submission) : null,
        overdue: !submission && pastDeadline,
      };
    });
    const submitted = rows.filter((r) => r.submission);
    return {
      rows,
      counts: {
        total: rows.length,
        submitted: submitted.length,
        missing: rows.length - submitted.length,
        late: submitted.filter((r) => r.submission.late).length,
        verified: submitted.filter((r) => r.submission.verified).length,
      },
    };
  });

  router.patch('/events/:eventId/submissions/:submissionId', (ctx) => {
    const { user, event } = roleEvent(ctx, 'organizer');
    const { verified } = ctx.body;
    if (typeof verified !== 'boolean') throw invalid('verified must be true or false.');
    const submission = ctx.state.submissions.find((s) => s.id === ctx.params.submissionId && s.event === event.id);
    if (!submission) throw httpError(404, 'Submission not found.', 'NOT_FOUND');

    submission.verified = verified;
    submission.verifiedAt = verified ? ctx.now.toISOString() : null;
    submission.verifiedBy = verified ? user.id : null;
    submission.updatedAt = ctx.now.toISOString();
    return { submission: submissionPublic(submission) };
  });

  router.post('/events/:eventId/reminders', (ctx) => {
    const { user, event } = roleEvent(ctx, 'organizer');
    const { state } = ctx;
    const { audience } = ctx.body;
    if (!REMINDER_AUDIENCES.includes(audience)) {
      throw invalid('Choose who gets the reminder: missing_submissions or all_participants.');
    }
    const custom = readText(ctx.body.message, 'Message', REMINDER_MESSAGE_MAX, '');

    let userIds = [];
    if (audience === 'missing_submissions') {
      if (event.status !== 'active') {
        throw httpError(409, 'Submission reminders can only be sent while the event is active.', 'WRONG_STATUS');
      }
      const done = new Set(state.submissions.filter((s) => s.event === event.id).map((s) => s.match));
      userIds = state.matches.filter((m) => m.event === event.id && m.published && !done.has(m.id)).map((m) => m.giver);
    } else {
      if (['draft', 'completed'].includes(event.status)) {
        throw httpError(409, 'Reminders can only be sent while the event is running.', 'WRONG_STATUS');
      }
      userIds = state.applications.filter((a) => a.event === event.id && a.status === 'accepted').map((a) => a.user);
    }
    // Organisers who also take part don't need a reminder they sent themselves
    userIds = [...new Set(userIds)].filter((id) => id !== user.id);

    const line = deadlineLine(event, ctx.now);
    let message = custom || defaultReminder(event, audience, ctx.now);
    if (custom && line && custom.length + line.length + 2 <= REMINDER_MESSAGE_MAX) message = `${custom}\n\n${line}`;

    const created = notifyMany(state, userIds, {
      type: 'deadline_reminder',
      title: `Reminder from the organisers of ${event.name}`,
      message,
      link: audience === 'missing_submissions' ? `/events/${event.id}/submit` : `/events/${event.id}`,
    });
    return { sent: created.length };
  });

  // ---------- Results (the reveal) ----------

  // ---------- Thank-you notes ----------

  function receivedGift(ctx, user) {
    const event = loadEvent(ctx);
    if (event.status !== 'completed') {
      throw httpError(409, 'You can thank your Secret Santa once the gifts are revealed.', 'NOT_COMPLETED');
    }
    const match = ctx.state.matches.find((m) => m.event === event.id && m.recipient === user.id && m.published);
    const submission = match && submissionForMatch(ctx.state, match.id);
    if (!submission) throw httpError(404, "There's no gift for you to thank in this event.", 'NOT_FOUND');
    return { event, submission };
  }

  router.put('/events/:eventId/thanks', (ctx) => {
    const user = ctx.requireAuth();
    const { event, submission } = receivedGift(ctx, user);
    const body = ctx.body || {};
    const message = readText(body.message, 'Thank-you note', LIMITS.thanksMessage, '');
    const reaction = body.reaction === undefined || body.reaction === null ? '' : String(body.reaction);
    if (reaction && !REACTION_VALUES.includes(reaction)) throw invalid('Pick a reaction from the list.');
    if (!message && !reaction) throw invalid('Write a note or pick a reaction.');
    const first = !submission.thanks?.at;
    submission.thanks = { message, reaction, at: ctx.now.toISOString() };
    if (first) {
      notify(ctx.state, submission.giver, {
        type: 'gift_thanked',
        title: `${miniOf(ctx.state, user.id).displayName} thanked you for your gift`,
        message: message || 'They reacted to the gift you made them.',
        link: `/events/${event.id}/results`,
      });
    }
    return { submission: submissionPublic(submission) };
  });

  router.delete('/events/:eventId/thanks', (ctx) => {
    const user = ctx.requireAuth();
    const { submission } = receivedGift(ctx, user);
    submission.thanks = { message: '', reaction: '', at: null };
    return { submission: submissionPublic(submission) };
  });

  router.get('/events/:eventId/results', (ctx) => {
    const user = ctx.requireAuth();
    const { state } = ctx;
    const event = loadEvent(ctx);
    const viewer = viewerContext(state, event, user);
    // Drafts and private events stay hidden from people who can't see them at all
    if (!canViewEvent(event, viewer)) throw httpError(404, 'Event not found.', 'NOT_FOUND');
    if (event.status !== 'completed') {
      throw httpError(409, 'Gifts are revealed once the organisers close the event.', 'NOT_COMPLETED');
    }
    if (!viewer.isOrganizer && !viewer.isParticipant) {
      throw httpError(403, 'Only the organisers and participants of this event can see the gifts.', 'ACCESS_DENIED');
    }

    const rows = adminMatches(state, event.id, { publishedOnly: true }).map((row) => ({
      ...row,
      submission: submissionForMatch(state, row.match.id),
    }));
    // Who actually made each gift: the backup when one took it over
    const madeBy = (r) => (r.submission && r.submission.giver !== r.match.giver && r.admin.backupGiver ? r.admin.backupGiver : r.admin.giver);
    const received = rows.find((r) => r.match.recipient === user.id);
    const given = rows.find((r) => r.match.giver === user.id);
    const handedOver = Boolean(given?.match.backupGiver);
    const backups = rows.filter((r) => r.submission && r.submission.giver === user.id && r.match.giver !== user.id);

    return {
      event: serializeEvent(state, event, user, viewer),
      received: received
        ? { giver: madeBy(received), submission: received.submission ? submissionPublic(received.submission) : null }
        : null,
      given: given
        ? {
            recipient: given.admin.recipient,
            handedOver,
            submission: given.submission && !handedOver ? submissionPublic(given.submission) : null,
          }
        : null,
      backups: backups.map((r) => ({ recipient: r.admin.recipient, submission: submissionPublic(r.submission) })),
      gallery: rows
        .filter((r) => r.submission)
        .map((r) => ({ giver: madeBy(r), recipient: r.admin.recipient, submission: submissionPublic(r.submission) })),
    };
  });
}
