// /events/:eventId/rating: rating the organiser after an exchange (server/routes/rating-router.js)
import { LIMITS } from '@shared/constants.mjs';
import { newId } from '../db.js';
import { canViewEvent, miniOf, notify, viewerContext } from '../model.js';
import { httpError } from '../util.js';
import { loadEvent } from './common.js';

// ---------- Scores (server/services/ratings.js) ----------

// { average, count }: average is null until there is a rating, rounded to one decimal
export function organiserSummary(state, organiserId) {
  const rows = (state.ratings || []).filter((r) => r.organiser === organiserId);
  if (!rows.length) return { average: null, count: 0 };
  const total = rows.reduce((sum, r) => sum + r.stars, 0);
  return { average: Math.round((total / rows.length) * 10) / 10, count: rows.length };
}

// Newest written comments. The artist who wrote one stays anonymous.
export function recentComments(state, organiserId, limit = 5) {
  return (state.ratings || [])
    .filter((r) => r.organiser === organiserId && r.comment)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)) || b.id.localeCompare(a.id))
    .slice(0, limit)
    .map((r) => ({
      stars: r.stars,
      comment: r.comment,
      eventName: state.events.find((e) => e.id === r.event)?.name || 'an exchange',
      at: r.updatedAt,
    }));
}

const ratingJson = (row) => (row ? { id: row.id, stars: row.stars, comment: row.comment, at: row.updatedAt } : null);

// Why this person can't rate yet, or null when they can
function whyNotRate(event, user, viewer) {
  if (event.status !== 'completed') {
    return httpError(409, 'You can rate the organiser once the gifts are revealed.', 'NOT_COMPLETED');
  }
  if (user.id === event.createdBy) return httpError(403, 'You cannot rate yourself.', 'FORBIDDEN');
  if (viewer.roles.includes('organizer')) {
    return httpError(403, 'Organisers cannot rate their own exchange.', 'FORBIDDEN');
  }
  if (!viewer.roles.includes('participant')) {
    return httpError(403, 'Only people who took part can rate the organiser.', 'FORBIDDEN');
  }
  return null;
}

export function register(router) {
  router.get('/events/:eventId/rating', (ctx) => {
    const { state } = ctx;
    const user = ctx.currentUser();
    const event = loadEvent(ctx);
    const viewer = viewerContext(state, event, user);
    const invite = typeof ctx.query.invite === 'string' ? ctx.query.invite : undefined;
    if (!canViewEvent(event, viewer, invite)) throw httpError(404, 'Event not found.', 'NOT_FOUND');

    const body = {
      organiser: miniOf(state, event.createdBy),
      summary: organiserSummary(state, event.createdBy),
      rating: null,
      canRate: false,
    };
    if (user) {
      body.rating = ratingJson(state.ratings.find((r) => r.event === event.id && r.rater === user.id));
      body.canRate = !whyNotRate(event, user, viewer);
    }
    return body;
  });

  router.put('/events/:eventId/rating', (ctx) => {
    const { state } = ctx;
    const user = ctx.requireAuth();
    const event = loadEvent(ctx);
    const blocked = whyNotRate(event, user, viewerContext(state, event, user));
    if (blocked) throw blocked;

    const stars = Number(ctx.body?.stars);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw httpError(400, 'Pick 1 to 5 stars.', 'VALIDATION');
    const comment = typeof ctx.body?.comment === 'string' ? ctx.body.comment.trim() : '';
    if (comment.length > LIMITS.ratingComment) {
      throw httpError(400, `Keep your comment to ${LIMITS.ratingComment} characters or fewer.`, 'VALIDATION');
    }

    const at = ctx.now.toISOString();
    let row = state.ratings.find((r) => r.event === event.id && r.rater === user.id);
    const first = !row;
    if (row) {
      Object.assign(row, { organiser: event.createdBy, stars, comment, updatedAt: at });
    } else {
      row = { id: newId(), event: event.id, organiser: event.createdBy, rater: user.id, stars, comment, createdAt: at, updatedAt: at };
      state.ratings.push(row);
    }

    // The organiser hears about a new rating once, without who gave it
    if (first) {
      notify(state, event.createdBy, {
        type: 'organiser_rated',
        title: `You got a ${stars}-star rating for ${event.name}`,
        message: comment || 'An artist who took part rated how it went.',
        link: `/events/${event.id}`,
      });
    }
    return { rating: ratingJson(row), summary: organiserSummary(state, event.createdBy) };
  });

  router.delete('/events/:eventId/rating', (ctx) => {
    const { state } = ctx;
    const user = ctx.requireAuth();
    const event = loadEvent(ctx);
    state.ratings = state.ratings.filter((r) => !(r.event === event.id && r.rater === user.id));
    return { rating: null, summary: organiserSummary(state, event.createdBy) };
  });
}
