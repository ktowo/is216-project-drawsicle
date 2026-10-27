// /events/:eventId/announcements, /invite-from and /invites (server/routes/outreach-router.js).
// Discord posts don't exist in the demo: there's no server to send them.
import { LIMITS } from '@shared/constants.mjs';
import { newId } from '../db.js';
import { canViewEvent, findUser, miniOf, notify, notifyMany, viewerContext } from '../model.js';
import { formatDay, httpError, invalid } from '../util.js';
import { loadEvent, roleEvent } from './common.js';

const MEMBER_STATUSES = ['pending', 'accepted', 'waitlisted'];

const announcementJson = (state, row) => ({
  id: row.id,
  message: row.message,
  createdAt: row.createdAt,
  author: miniOf(state, row.author),
});

const ACTIVITY_MAX = 60;

export function register(router) {
  // The activity timeline on the manage page (same as GET /activity in outreach-router.js)
  router.get('/events/:eventId/activity', (ctx) => {
    const { state } = ctx;
    const { event } = roleEvent(ctx, 'organizer');
    const mini = (id) => (id ? miniOf(state, id) : null);
    const applications = state.applications.filter((a) => a.event === event.id);
    const items = [
      ...(event.statusHistory || []).map((h) => ({ kind: 'status', status: h.status, at: h.at, by: mini(h.by) })),
      ...applications.map((a) => ({ kind: 'signup', at: a.createdAt, user: mini(a.user) })),
      ...applications
        .filter((a) => a.status === 'withdrawn')
        .map((a) => ({ kind: 'withdrawn', at: a.updatedAt || a.createdAt, user: mini(a.user) })),
      ...state.announcements
        .filter((a) => a.event === event.id)
        .map((a) => ({ kind: 'announcement', at: a.createdAt, by: mini(a.author), text: a.message.slice(0, 140) })),
      ...state.submissions
        .filter((s) => s.event === event.id)
        .map((s) => ({ kind: 'gift', at: s.submittedAt, user: mini(s.giver), late: Boolean(s.late) })),
      ...state.matches
        .filter((m) => m.event === event.id && m.backupGiver && m.backupAssignedAt)
        .map((m) => ({ kind: 'backup', at: m.backupAssignedAt, user: mini(m.backupGiver) })),
    ]
      .filter((item) => item.at)
      .sort((a, b) => new Date(b.at) - new Date(a.at));
    return { items: items.slice(0, ACTIVITY_MAX), total: items.length };
  });

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

  // ---------- Inviting one artist ----------

  const inviteLink = (event) => `/events/${event.id}${event.publicity === 'private' ? `?invite=${event.inviteCode}` : ''}`;
  const inviteJson = (state, row) => {
    const joined = state.applications.some((a) => a.event === row.event && a.user === row.artist && a.status !== 'withdrawn');
    return { id: row.id, artist: miniOf(state, row.artist), message: row.message, at: row.createdAt, joined };
  };

  router.get('/events/:eventId/invites', (ctx) => {
    const { event } = roleEvent(ctx, 'organizer');
    const rows = ctx.state.invites
      .filter((i) => i.event === event.id)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id.localeCompare(a.id));
    return { invites: rows.map((r) => inviteJson(ctx.state, r)) };
  });

  router.post('/events/:eventId/invites', (ctx) => {
    const { user, event } = roleEvent(ctx, 'organizer');
    const { state } = ctx;
    const body = ctx.body || {};
    const notFound = () => httpError(404, "We couldn't find that artist.", 'NOT_FOUND');
    if (typeof body.artistId !== 'string') throw notFound();
    if (body.artistId === user.id) throw invalid("You can't invite yourself.");
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (message.length > LIMITS.inviteMessage) throw invalid(`Keep your message to ${LIMITS.inviteMessage} characters or fewer.`);
    if (event.status !== 'open' || new Date(event.signupDeadline) <= ctx.now) {
      throw httpError(409, 'You can invite artists while sign-ups are open.', 'WRONG_STATUS');
    }

    const artist = findUser(state, body.artistId);
    const blocked = artist && (artist.blockedUsers || []).includes(user.id);
    if (!artist || (artist.status || 'active') !== 'active' || artist.profilePrivacy?.listInDiscover === false || blocked) {
      throw notFound();
    }
    const isOrganiser = state.members.some((m) => m.event === event.id && m.user === artist.id && m.roles.includes('organizer'));
    const applied = state.applications.some((a) => a.event === event.id && a.user === artist.id && a.status !== 'withdrawn');
    if (isOrganiser || applied) throw httpError(409, `${artist.displayName} is already part of this event.`, 'ALREADY_JOINED');
    if (state.invites.some((i) => i.event === event.id && i.artist === artist.id)) {
      throw httpError(409, `You've already invited ${artist.displayName}.`, 'ALREADY_INVITED');
    }
    if (state.invites.filter((i) => i.event === event.id).length >= LIMITS.invitesPerEvent) {
      throw httpError(409, `You can invite up to ${LIMITS.invitesPerEvent} artists to one event.`, 'LIMIT');
    }

    const row = { id: newId(), event: event.id, artist: artist.id, invitedBy: user.id, message, createdAt: ctx.now.toISOString() };
    state.invites.push(row);
    notify(state, artist.id, {
      type: 'event_invite',
      title: `${user.displayName} invited you to ${event.name}`,
      message: message || `They found you on Discover. Sign-ups close ${formatDay(event.signupDeadline)}.`,
      link: inviteLink(event),
    });
    ctx.status = 201;
    return { invite: inviteJson(state, row) };
  });

  router.delete('/events/:eventId/invites/:inviteId', (ctx) => {
    const { event } = roleEvent(ctx, 'organizer');
    const index = ctx.state.invites.findIndex((i) => i.id === ctx.params.inviteId && i.event === event.id);
    if (index === -1) throw httpError(404, 'That invite is already gone.', 'NOT_FOUND');
    ctx.state.invites.splice(index, 1);
    return { ok: true };
  });
}
