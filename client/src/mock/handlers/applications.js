// /events/:eventId/application(s): signing up and organiser review
// (server/routes/application-router.js)
import { APPLICATION_STATUSES, CREATION_TYPES, LIMITS, labelFor, normalizeTags, signupsOpen } from '@shared/constants.mjs';
import { newId } from '../db.js';
import { promoteFromWaitlist } from '../waitlist.js';
import {
  applicationJson,
  characterPublic,
  grantRole,
  notify,
  notifyMany,
  organizerIds,
  participantCount,
  revokeRole,
  userMini,
} from '../model.js';
import { httpError, invalid, readCharacterInput, readList, readText } from '../util.js';
import { buildCharacter } from './characters.js';
import { organizerEvent, visibleEvent } from './common.js';

const signupsClosed = () => httpError(409, 'Sign-ups for this event are closed.', 'SIGNUPS_CLOSED');
const rejected = () => httpError(403, "The organisers didn't accept your application for this event.", 'APPLICATION_REJECTED');
const eventFull = () => httpError(409, 'This event is full.', 'EVENT_FULL');

const isFull = (state, event) => participantCount(state, event.id) >= event.maxParticipants;

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

function readCharacterIds(value) {
  const list = readList(value, 'Offered characters').map((id) => String(id).trim().toLowerCase());
  const ids = [...new Set(list.filter(Boolean))];
  if (ids.some((id) => !/^[a-f\d]{24}$/.test(id))) throw invalid("One of the characters you picked isn't in your library.");
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
  };
}

export function register(router) {
  router.get('/events/:eventId/application', (ctx) => {
    const user = ctx.requireAuth();
    const { viewer } = visibleEvent(ctx, user);
    return { application: viewer.application ? applicationJson(ctx.state, viewer.application) : null };
  });

  router.put('/events/:eventId/application', (ctx) => {
    const user = ctx.requireAuth();
    const { state } = ctx;
    const { event, viewer } = visibleEvent(ctx, user);
    if (!signupsOpen(event, ctx.now)) throw signupsClosed();

    const existing = viewer.application;
    if (existing?.status === 'rejected') throw rejected();
    const isNew = !existing || existing.status === 'withdrawn';
    let joinWaitlist = false;
    if (isNew && isFull(state, event)) {
      if (ctx.body?.waitlist !== true) throw eventFull();
      joinWaitlist = true;
    }

    const form = readSignupForm(ctx.body, event);
    if (isNew && event.adultOnly && ctx.body?.confirmAdult !== true) {
      throw httpError(400, "This event is for adults. Confirm you're 18 or older to sign up.", 'AGE_CONFIRM');
    }

    // Characters from the library: mine, and not archived unless they're already on this application
    const picked = form.offeredCharacterIds.map((id) => state.characters.find((c) => c.id === id && c.owner === user.id));
    if (picked.some((c) => !c)) throw invalid("One of the characters you picked isn't in your library.");
    // A withdrawn application starts over, so its old characters get no exception
    const alreadyOffered = new Set(isNew ? [] : existing.offeredCharacters || []);
    const archived = picked.find((c) => c.archivedAt && !alreadyOffered.has(c.id));
    if (archived) throw invalid(`${archived.name} is archived. Restore it in your library to offer it.`);

    const total = picked.length + form.newCharacters.length;
    if (total < LIMITS.offeredCharactersMin || total > LIMITS.offeredCharactersMax) {
      throw invalid(`Offer between ${LIMITS.offeredCharactersMin} and ${LIMITS.offeredCharactersMax} characters.`);
    }

    // Check every new character before saving any, so a bad one doesn't leave the others behind
    const created = form.newCharacters.map((input) => buildCharacter(readCharacterInput(input), user.id, ctx.now));
    const offered = [...picked, ...created];
    state.characters.push(...created);

    const at = ctx.now.toISOString();
    const application = existing || {
      id: newId(),
      event: event.id,
      user: user.id,
      status: 'pending',
      reviewedBy: null,
      reviewedAt: null,
      createdAt: at,
    };
    Object.assign(application, {
      communityUsername: form.communityUsername,
      canCreate: form.canCreate,
      wantsTypes: form.wantsTypes,
      offeredCharacters: offered.map((c) => c.id),
      likes: form.likes,
      avoid: form.avoid,
      cannotDraw: form.cannotDraw,
      notes: form.notes,
      canBackup: form.canBackup,
      updatedAt: at,
    });
    if (isNew) {
      application.status = joinWaitlist ? 'waitlisted' : event.requireApproval ? 'pending' : 'accepted';
      application.waitlistedAt = joinWaitlist ? at : null;
      application.reviewedBy = null;
      application.reviewedAt = null;
    }
    if (!existing) state.applications.push(application);

    if (application.status === 'accepted') grantRole(state, user.id, event.id, 'participant');

    if (form.saveAsDefault) {
      user.defaultForm = {
        communityUsername: form.communityUsername,
        canCreate: [...form.canCreate],
        wantsTypes: [...form.wantsTypes],
        likes: form.likes,
        avoid: form.avoid,
        cannotDraw: [...form.cannotDraw],
      };
      user.updatedAt = at;
    }

    if (isNew) {
      const name = userMini(user).displayName;
      notifyMany(
        state,
        organizerIds(state, event.id).filter((id) => id !== user.id),
        {
          type: 'application_received',
          title: `New sign-up for ${event.name}`,
          message:
            application.status === 'waitlisted'
              ? `${name} joined the waitlist.`
              : application.status === 'pending'
                ? `${name} applied and is waiting for your review.`
                : `${name} joined the exchange.`,
          link: `/events/${event.id}/manage?tab=participants`,
        }
      );
    }

    ctx.status = isNew ? 201 : 200;
    return {
      application: applicationJson(state, application),
      createdCharacters: created.map((c) => characterPublic(c, { inUse: true, eventCount: 1 })),
    };
  });

  router.delete('/events/:eventId/application', (ctx) => {
    const user = ctx.requireAuth();
    const { event, viewer } = visibleEvent(ctx, user);
    const application = viewer.application;
    if (!application || application.status === 'withdrawn') {
      throw httpError(404, "You haven't signed up for this event.", 'NOT_FOUND');
    }
    // Withdrawing and re-applying would get around the rejection
    if (application.status === 'rejected') throw rejected();
    if (!signupsOpen(event, ctx.now)) throw signupsClosed();

    const freedPlace = application.status === 'accepted';
    application.status = 'withdrawn';
    application.waitlistedAt = null;
    application.updatedAt = ctx.now.toISOString();
    revokeRole(ctx.state, user.id, event.id, 'participant');
    if (freedPlace) promoteFromWaitlist(ctx.state, event, ctx.now);
    return { ok: true };
  });

  // ---------- Organiser review ----------

  router.get('/events/:eventId/applications', (ctx) => {
    const { event } = organizerEvent(ctx);
    const status = typeof ctx.query.status === 'string' ? ctx.query.status.trim() : '';
    if (status && !APPLICATION_STATUSES.includes(status)) {
      throw invalid(`status must be one of: ${APPLICATION_STATUSES.join(', ')}.`);
    }
    const all = ctx.state.applications.filter((a) => a.event === event.id);
    const counts = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0]));
    for (const a of all) counts[a.status] += 1;

    const applications = all
      .filter((a) => !status || a.status === status)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id))
      .map((a) => applicationJson(ctx.state, a));
    return { applications, counts };
  });

  router.patch('/events/:eventId/applications/:applicationId', (ctx) => {
    const { user, event } = organizerEvent(ctx);
    const { state } = ctx;
    const status = ctx.body.status;
    if (status !== 'accepted' && status !== 'rejected') throw invalid('status must be accepted or rejected.');
    if (!['open', 'matching'].includes(event.status)) {
      throw httpError(409, 'Applications can only be reviewed until the matches are published.', 'EVENT_LOCKED');
    }

    const application = state.applications.find((a) => a.id === ctx.params.applicationId && a.event === event.id);
    if (!application) throw httpError(404, 'Application not found.', 'NOT_FOUND');
    if (application.status === 'withdrawn') {
      throw httpError(409, 'This person withdrew their application.', 'APPLICATION_WITHDRAWN');
    }

    let matchesCleared = false;
    const freedPlace = application.status === 'accepted' && status === 'rejected';
    if (application.status !== status) {
      if (status === 'accepted' && isFull(state, event)) throw eventFull();

      application.status = status;
      application.waitlistedAt = null;
      application.reviewedBy = user.id;
      application.reviewedAt = ctx.now.toISOString();
      application.updatedAt = application.reviewedAt;

      if (status === 'accepted') grantRole(state, application.user, event.id, 'participant');
      else revokeRole(state, application.user, event.id, 'participant');

      // Draft matches were made from the old participant list
      if (event.status === 'matching') {
        const before = state.matches.length;
        state.matches = state.matches.filter((m) => !(m.event === event.id && !m.published));
        matchesCleared = state.matches.length < before;
      }

      notify(
        state,
        application.user,
        status === 'accepted'
          ? {
              type: 'application_accepted',
              title: `You're in! Your sign-up for ${event.name} was accepted`,
              message: "You'll be told who you're making a gift for once matches are published.",
              link: `/events/${event.id}`,
            }
          : {
              type: 'application_rejected',
              title: `Your sign-up for ${event.name} wasn't accepted`,
              message: 'The organisers decided not to include you in this exchange. Thanks for your interest.',
              link: `/events/${event.id}`,
            }
      );
    }

    if (freedPlace) promoteFromWaitlist(state, event, ctx.now);
    const body = { application: applicationJson(state, application) };
    if (event.status === 'matching') body.matchesCleared = matchesCleared;
    return body;
  });
}
