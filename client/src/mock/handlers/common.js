// Access checks shared by the event-scoped mock handlers, in the same order as the
// server middleware: logged in -> event exists -> event visible -> event role.
import { canViewEvent, viewerContext } from '../model.js';
import { httpError } from '../util.js';

export const eventNotFound = () => httpError(404, 'Event not found.', 'NOT_FOUND');
export const noPermission = () => httpError(403, "You don't have permission to do that in this event.", 'ACCESS_DENIED');

export function loadEvent(ctx) {
  const event = ctx.state.events.find((e) => e.id === ctx.params.eventId);
  if (!event) throw eventNotFound();
  return event;
}

// Drafts and private events answer 404 to anyone who can't see them
export function visibleEvent(ctx, user) {
  const event = loadEvent(ctx);
  const viewer = viewerContext(ctx.state, event, user);
  const invite = typeof ctx.query.invite === 'string' ? ctx.query.invite : undefined;
  if (!canViewEvent(event, viewer, invite)) throw eventNotFound();
  return { event, viewer };
}

// Logged in, can see the event, and holds one of `roles` (admins always pass)
export function eventWithRole(ctx, ...roles) {
  const user = ctx.requireAuth();
  const { event, viewer } = visibleEvent(ctx, user);
  if (user.role !== 'admin' && !viewer.roles.some((r) => roles.includes(r))) throw noPermission();
  return { user, event, viewer };
}

export const organizerEvent = (ctx) => eventWithRole(ctx, 'organizer');

// The match and submission routes check the role without the visibility step,
// like server/routes/match-router.js (so a hidden event answers 403 there, not 404)
export function roleEvent(ctx, ...roles) {
  const user = ctx.requireAuth();
  const event = loadEvent(ctx);
  const viewer = viewerContext(ctx.state, event, user);
  if (user.role !== 'admin' && !viewer.roles.some((r) => roles.includes(r))) throw noPermission();
  return { user, event, viewer };
}

// An accepted participant of the event (requireParticipant on the server)
export function participantEvent(ctx) {
  const user = ctx.requireAuth();
  const event = loadEvent(ctx);
  const viewer = viewerContext(ctx.state, event, user);
  if (!viewer.isParticipant) {
    throw httpError(403, 'Only accepted participants can do that in this event.', 'ACCESS_DENIED');
  }
  return { user, event, viewer };
}

// My published match as a giver (loadMyMatch on the server)
export function myMatch(ctx, event, user) {
  if (!['active', 'completed'].includes(event.status)) {
    throw httpError(404, "Matches haven't been published for this event yet.", 'NO_MATCH');
  }
  const match = ctx.state.matches.find((m) => m.event === event.id && m.giver === user.id && m.published);
  if (!match) throw httpError(404, "You don't have a match in this event.", 'NO_MATCH');
  return match;
}
