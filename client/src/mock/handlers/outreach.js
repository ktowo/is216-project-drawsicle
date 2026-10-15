// /events/:eventId/announcements and /invite-from (server/routes/outreach-router.js).
// Discord posts don't exist in the demo: there's no server to send them.
import { LIMITS } from '@shared/constants.mjs';
import { newId } from '../db.js';
import { canViewEvent, findUser, miniOf, notifyMany, viewerContext } from '../model.js';
import { formatDay, httpError, invalid } from '../util.js';
import { loadEvent, roleEvent } from './common.js';

const MEMBER_STATUSES = ['pending', 'accepted', 'waitlisted'];

const announcementJson = (state, row) => ({
  id: row.id,
  message: row.message,
  createdAt: row.createdAt,
  author: miniOf(state, row.author),
});

export function register(router) {
  router.get('/events/:eventId/announcements', (ctx) => {
    const { state } = ctx;
    const event = loadEvent(ctx);
    const viewer = viewerContext(state, event, ctx.currentUser());
    const invite = typeof ctx.query.invite === 'string' ? ctx.query.invite : undefined;
    if (!canViewEvent(event, viewer, invite)) throw httpError(404, 'Event not found.', 'NOT_FOUND');
    const rows = state.announcements
      .filter((a) => a.event === event.id)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, LIMITS.announcementsShown);
    return { announcements: rows.map((row) => announcementJson(state, row)) };
  });

  router.post('/events/:eventId/announcements', (ctx) => {
    const { user, event } = roleEvent(ctx, 'organizer');
    const { state } = ctx;
    const body = ctx.body || {};
    if (typeof body.message !== 'string' || !body.message.trim()) throw invalid('Write your update first.');
    const message = body.message.trim();
    if (message.length > LIMITS.announcement) throw invalid(`Keep updates under ${LIMITS.announcement} characters.`);

    const row = { id: newId(), event: event.id, author: user.id, message, createdAt: ctx.now.toISOString() };
    state.announcements.push(row);
    if (body.notify !== false && event.status !== 'draft') {
      const members = state.applications
        .filter((a) => a.event === event.id && MEMBER_STATUSES.includes(a.status) && a.user !== user.id)
        .map((a) => a.user);
      notifyMany(state, members, {
        type: 'announcement',
        title: `Update from ${event.name}`,
        message,
        link: `/events/${event.id}`,
      });
    }
    ctx.status = 201;
    return { announcement: announcementJson(state, row) };
  });

  router.delete('/events/:eventId/announcements/:announcementId', (ctx) => {
    const { event } = roleEvent(ctx, 'organizer');
    const { state } = ctx;
    const index = state.announcements.findIndex((a) => a.id === ctx.params.announcementId && a.event === event.id);
    if (index === -1) throw httpError(404, 'That update is already gone.', 'NOT_FOUND');
    state.announcements.splice(index, 1);
    return { ok: true };
  });

  router.post('/events/:eventId/discord/test', (ctx) => {
    roleEvent(ctx, 'organizer');
    throw httpError(501, 'Discord posts need the real server, so they are not part of demo mode.', 'NOT_IN_DEMO');
  });

  router.post('/events/:eventId/invite-from', (ctx) => {
    const { user, event } = roleEvent(ctx, 'organizer');
    const { state } = ctx;
    const fromId = ctx.body?.fromEventId;
    const notFound = () => httpError(404, "We couldn't find that exchange among the ones you organise.", 'NOT_FOUND');
    if (typeof fromId !== 'string') throw notFound();
    if (fromId === event.id) throw invalid('Pick a different exchange to invite people from.');
    const source = state.events.find((e) => e.id === fromId);
    if (!source) throw notFound();
    const organises = state.members.some((m) => m.user === user.id && m.event === source.id && m.roles.includes('organizer'));
    if (user.role !== 'admin' && !organises) throw notFound();
    if (event.status !== 'open') {
      throw httpError(409, 'Open sign-ups first, so the people you invite can join straight away.', 'WRONG_STATUS');
    }
    event.invitedFrom ||= [];
    if (event.invitedFrom.includes(source.id)) {
      throw httpError(409, `You've already invited the people from ${source.name}.`, 'ALREADY_INVITED');
    }

    const here = new Set(state.applications.filter((a) => a.event === event.id).map((a) => a.user));
    for (const m of state.members) if (m.event === event.id && m.roles.includes('organizer')) here.add(m.user);
    here.add(user.id);
    const people = [
      ...new Set(state.applications.filter((a) => a.event === source.id && a.status === 'accepted').map((a) => a.user)),
    ].filter((id) => !here.has(id) && (findUser(state, id)?.status || 'active') === 'active');

    const link = `/events/${event.id}${event.publicity === 'private' ? `?invite=${event.inviteCode}` : ''}`;
    notifyMany(state, people, {
      type: 'event_invite',
      title: `You're invited to ${event.name}`,
      message: `The organisers of ${source.name} are running another exchange. Sign-ups close ${formatDay(event.signupDeadline)}.`,
      link,
    });
    event.invitedFrom.push(source.id);
    return { sent: people.length };
  });
}
