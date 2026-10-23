// /admin: the site admin tools in demo mode (server/routes/admin-router.js). Same routes, rules,
// error codes and response shapes. Who can use what is in shared/permissions.mjs: moderators get
// reports, chat and lookups; admins get everything. Every change goes into the audit log.
import { ALL_EVENT_STATUSES, REPORT_STATUSES, SITE_ROLES, USER_STATUSES } from '@shared/constants.mjs';
import { can } from '@shared/permissions.mjs';
import { MUTE_OPTIONS } from '@shared/chat.mjs';
import { emptySocials, newId } from '../db.js';
import { withdrawApplications } from '../accounts.js';
import { eventMini, findUser, notify, notifyMany, organizerIds, serializeEvent, setStatus, userMini } from '../model.js';
import { escapeRegex, httpError, queryParam } from '../util.js';

const ROLE_RANK = { user: 0, moderator: 1, admin: 2 };
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const byNewest = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);

function allowed(ctx, permission) {
  const user = ctx.requireAuth();
  if (!can(user, 'admin.access') || !can(user, permission)) {
    throw httpError(403, "You don't have permission to do that.", 'ACCESS_DENIED');
  }
  return user;
}

function paging(query) {
  const page = Math.max(1, Number.parseInt(queryParam(query, 'page'), 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(queryParam(query, 'limit'), 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

const pageOf = (rows, { page, limit, skip }) => ({ rows: rows.slice(skip, skip + limit), total: rows.length, page, pages: Math.max(1, Math.ceil(rows.length / limit)) });

function readReason(body, required) {
  const reason = str(body?.reason).slice(0, 500);
  if (required && !reason) throw httpError(400, 'Add a short reason. The people affected will see it.', 'VALIDATION');
  return reason;
}

function audit(ctx, actor, action, targetType, targetId, targetLabel, reason = '') {
  ctx.state.audit.push({ id: newId(), actor: actor.id, action, targetType, targetId, targetLabel, reason, createdAt: ctx.now.toISOString() });
}

const mutedUntil = (user, now) => (user.chatMutedUntil && new Date(user.chatMutedUntil) > now ? user.chatMutedUntil : null);

function adminUser(user, now, extra = {}) {
  return {
    ...userMini(user),
    email: user.email,
    role: user.role,
    status: user.status || 'active',
    bannedAt: user.bannedAt || null,
    banReason: user.banReason || '',
    deactivatedAt: user.deactivatedAt || null,
    chatMutedUntil: mutedUntil(user, now),
    chatMuteReason: user.chatMuteReason || '',
    createdAt: user.createdAt,
    ...extra,
  };
}

function findUserOr404(ctx) {
  const user = findUser(ctx.state, ctx.params.userId);
  if (!user) throw httpError(404, 'User not found.', 'USER_NOT_FOUND');
  return user;
}

function findEventOr404(ctx) {
  const event = ctx.state.events.find((e) => e.id === ctx.params.eventId);
  if (!event) throw httpError(404, 'Event not found.', 'NOT_FOUND');
  return event;
}

function notSelf(me, user, message) {
  if (user.id === me.id) throw httpError(400, message, 'SELF');
}

// Organisers plus accepted participants, without duplicates
function everyoneIn(state, eventId) {
  const accepted = state.applications.filter((a) => a.event === eventId && a.status === 'accepted').map((a) => a.user);
  return [...new Set([...organizerIds(state, eventId), ...accepted])];
}

const textMatch = (re, ...values) => values.some((v) => re.test(String(v || '')));

// ---------- Reports ----------

// What a report points at, as it is now (server/services/reports.js)
function describeTarget(state, type, id) {
  switch (type) {
    case 'submission': {
      const sub = state.submissions.find((s) => s.id === id);
      if (!sub) return null;
      const by = findUser(state, sub.giver)?.displayName || 'someone';
      const event = state.events.find((e) => e.id === sub.event);
      return {
        label: `${sub.title ? `"${sub.title}"` : 'A gift'} by ${by}${event ? ` in ${event.name}` : ''}`,
        link: event ? `/events/${event.id}/results` : '',
        preview: {
          title: sub.title || '',
          type: sub.type,
          message: sub.message || '',
          images: [...(sub.images || [])].slice(0, 4),
          links: (sub.links || []).map((l) => l.url),
          contentWarnings: [...(sub.contentWarnings || [])],
        },
      };
    }
    case 'user': {
      const user = findUser(state, id);
      if (!user) return null;
      return {
        label: user.username ? `${user.displayName} (@${user.username})` : user.displayName || 'An account',
        link: user.username && (user.status || 'active') === 'active' ? `/users/${user.username}` : '',
        preview: { bio: user.bio || '', status: user.status || 'active' },
      };
    }
    case 'character': {
      const c = state.characters.find((x) => x.id === id);
      if (!c) return null;
      return {
        label: c.species ? `${c.name} (${c.species})` : c.name,
        link: '',
        preview: {
          description: c.description || '',
          notesForArtists: c.notesForArtists || '',
          referenceLinks: (c.referenceLinks || []).map((l) => l.url),
          contentWarnings: [...(c.contentWarnings || [])],
        },
      };
    }
    case 'event': {
      const e = state.events.find((x) => x.id === id);
      if (!e) return null;
      return {
        label: e.name,
        link: `/events/${e.id}`,
        preview: { description: (e.description || '').slice(0, 600), status: e.status, disabled: Boolean(e.disabledAt) },
      };
    }
    default:
      return null;
  }
}

function reportJson(state, report) {
  const target = describeTarget(state, report.targetType, report.targetId);
  const event = report.event ? state.events.find((e) => e.id === report.event) : null;
  return {
    id: report.id,
    targetType: report.targetType,
    targetId: report.targetId,
    targetLabel: target?.label || report.targetLabel,
    targetGone: !target,
    link: target?.link || '',
    preview: target?.preview || null,
    owner: report.targetOwner ? userMini(findUser(state, report.targetOwner)) : null,
    event: event ? { id: event.id, name: event.name } : null,
    reason: report.reason,
    details: report.details || '',
    status: report.status,
    reporter: userMini(findUser(state, report.reporter)),
    handledBy: report.handledBy ? userMini(findUser(state, report.handledBy)) : null,
    handledAt: report.handledAt || null,
    resolution: report.resolution || '',
    createdAt: report.createdAt,
  };
}

const REPORT_DONE_MESSAGES = {
  resolved: 'An admin looked into it and took action. Thanks for helping keep Drawsicle friendly.',
  dismissed: "An admin looked into it and found it doesn't break the community guidelines. Thanks for letting us know.",
};

// ---------- Museum chat ----------

function chatRow(state, m, now) {
  const user = findUser(state, m.user);
  const hider = m.hiddenBy ? findUser(state, m.hiddenBy) : null;
  return {
    id: m.id,
    room: m.room,
    roomLabel: m.roomLabel,
    link: String(m.room).startsWith('wing:') ? `/museum/${m.event}` : `/events/${m.event}/museum`,
    user: user ? { ...userMini(user), email: user.email, role: user.role, chatMutedUntil: mutedUntil(user, now) } : userMini(null),
    kind: m.kind,
    emote: m.emote || '',
    text: m.text,
    createdAt: m.createdAt,
    hidden: Boolean(m.hiddenAt),
    hiddenAt: m.hiddenAt || null,
    hiddenBy: hider ? userMini(hider) : null,
  };
}

function findMessage(ctx) {
  const message = ctx.state.chats.find((m) => m.id === ctx.params.messageId);
  if (!message) throw httpError(404, 'Message not found.', 'NOT_FOUND');
  return message;
}

// ---------- Vision ----------

// Demo mode runs in the browser, so there is no Ollama to look at
function demoVisionReport(state, now) {
  const profiles = (state.styleProfiles || []).length;
  return {
    configured: false,
    host: '',
    protected: false,
    reachable: false,
    latencyMs: null,
    version: '',
    error: 'Demo mode runs entirely in your browser, so it has no Ollama server to check. Art style matching uses colours only here.',
    models: [],
    visionModel: { name: 'qwen2.5vl:3b', installed: false },
    embedModel: { name: 'nomic-embed-text', installed: false },
    checkedAt: now.toISOString(),
    profiles: { total: profiles, withVision: 0, colourOnly: profiles, lastAnalysedAt: null },
  };
}

// ---------- Routes ----------

export function register(router) {
  // Overview
  router.get('/admin/stats', (ctx) => {
    allowed(ctx, 'stats.view');
    const { state, now } = ctx;
    const users = Object.fromEntries(USER_STATUSES.map((s) => [s, 0]));
    for (const u of state.users) users[u.status || 'active'] = (users[u.status || 'active'] || 0) + 1;
    const byStatus = Object.fromEntries(ALL_EVENT_STATUSES.map((s) => [s, 0]));
    for (const e of state.events) byStatus[e.status] = (byStatus[e.status] || 0) + 1;
    return {
      users: {
        ...users,
        total: state.users.length,
        admins: state.users.filter((u) => u.role === 'admin').length,
        moderators: state.users.filter((u) => u.role === 'moderator').length,
      },
      events: { byStatus, total: state.events.length, disabled: state.events.filter((e) => e.disabledAt).length },
      applications: state.applications.filter((a) => a.status !== 'withdrawn').length,
      matches: state.matches.filter((m) => m.published).length,
      submissions: state.submissions.length,
      openReports: state.reports.filter((r) => r.status === 'open').length,
      invites: {
        codes: state.inviteCodes.length,
        capacity: state.inviteCodes.reduce((sum, invite) => sum + invite.capacity, 0),
        used: state.inviteCodes.reduce((sum, invite) => sum + invite.signups.length, 0),
      },
      recent: {
        users: [...state.users].sort(byNewest).slice(0, 5).map((u) => adminUser(u, now)),
        events: [...state.events].sort(byNewest).slice(0, 5).map(eventMini),
      },
    };
  });

  router.get('/admin/invites', (ctx) => {
    allowed(ctx, 'invites.manage');
    return {
      invites: [...state.inviteCodes].sort(byNewest).map((invite) => ({
        ...invite,
        used: invite.signups.length,
        signups: invite.signups.map((signup) => ({ ...signup, user: userMini(findUser(state, signup.user)) })),
      })),
    };
  });

  router.post('/admin/invites', (ctx) => {
    const actor = allowed(ctx, 'invites.manage');
    const code = str(ctx.body?.code).toUpperCase();
    const capacity = Number(ctx.body?.capacity);
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) throw httpError(400, 'Use 3-40 letters, numbers, hyphens or underscores.', 'VALIDATION');
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000) throw httpError(400, 'Capacity must be a whole number from 1 to 10,000.', 'VALIDATION');
    if (state.inviteCodes.some((invite) => invite.code === code)) throw httpError(409, 'That invite code already exists.', 'INVITE_TAKEN');
    const invite = { id: newId(), code, capacity, signups: [], createdAt: ctx.now.toISOString(), updatedAt: ctx.now.toISOString() };
    state.inviteCodes.push(invite);
    audit(ctx, actor, 'invite.create', 'invite', invite.id, code, `Capacity: ${capacity}`);
    return { invite: { ...invite, used: 0 } };
  });

  router.patch('/admin/invites/:inviteId', (ctx) => {
    allowed(ctx, 'invites.manage');
    const invite = state.inviteCodes.find((row) => row.id === ctx.params.inviteId);
    if (!invite) throw httpError(404, 'Invite code not found.', 'NOT_FOUND');
    const capacity = Number(ctx.body?.capacity);
    if (!Number.isInteger(capacity) || capacity < invite.signups.length || capacity > 10000) throw httpError(400, `Capacity must be a whole number from ${invite.signups.length} to 10,000.`, 'VALIDATION');
    invite.capacity = capacity;
    invite.updatedAt = ctx.now.toISOString();
    return { invite: { ...invite, used: invite.signups.length } };
  });

  // Users
  router.get('/admin/users', (ctx) => {
    allowed(ctx, 'users.view');
    const { state, query, now } = ctx;
    let rows = [...state.users];
    const q = str(queryParam(query, 'q')).slice(0, 100);
    if (q) {
      const re = new RegExp(escapeRegex(q), 'i');
      rows = rows.filter((u) => textMatch(re, u.displayName, u.username, u.email));
    }
    const status = queryParam(query, 'status');
    if (USER_STATUSES.includes(status)) rows = rows.filter((u) => (u.status || 'active') === status);
    const role = queryParam(query, 'role');
    if (SITE_ROLES.includes(role)) rows = rows.filter((u) => u.role === role);
    rows.sort(byNewest);
    const { rows: page, ...meta } = pageOf(rows, paging(query));
    const organising = (id) => state.members.filter((m) => m.user === id && m.roles.includes('organizer')).length;
    return { users: page.map((u) => adminUser(u, now, { eventsOrganized: organising(u.id) })), ...meta };
  });

  router.patch('/admin/users/:userId', (ctx) => {
    const me = allowed(ctx, 'users.roles');
    const user = findUserOr404(ctx);
    const role = ctx.body?.role;
    if (!SITE_ROLES.includes(role)) throw httpError(400, `role must be one of: ${SITE_ROLES.join(', ')}.`, 'VALIDATION');
    notSelf(me, user, "You can't change your own role. Ask another admin.");
    if (user.status === 'banned' && role !== 'user') throw httpError(400, 'Unban this account before giving it a site role.', 'VALIDATION');
    if (user.role !== role) {
      const was = user.role;
      user.role = role;
      user.updatedAt = ctx.now.toISOString();
      audit(ctx, me, ROLE_RANK[role] > ROLE_RANK[was] ? 'user.promote' : 'user.demote', 'user', user.id, user.displayName || user.email, `${was} → ${role}`);
    }
    return { user: adminUser(user, ctx.now) };
  });

  router.post('/admin/users/:userId/ban', (ctx) => {
    const me = allowed(ctx, 'users.manage');
    const user = findUserOr404(ctx);
    const reason = readReason(ctx.body, true);
    notSelf(me, user, "You can't ban yourself.");
    if (user.role !== 'user') throw httpError(400, 'Take away their site role before banning them.', 'VALIDATION');
    if (user.status === 'banned') throw httpError(409, 'This account is already banned.', 'ALREADY_BANNED');
    Object.assign(user, {
      status: 'banned',
      bannedAt: ctx.now.toISOString(),
      banReason: reason,
      bannedBy: me.id,
      sessionVersion: (user.sessionVersion || 0) + 1, // logs them out everywhere
    });
    const withdrawn = withdrawApplications(ctx.state, user, ctx.now);
    audit(ctx, me, 'user.ban', 'user', user.id, user.displayName || user.email, reason);
    return { user: adminUser(user, ctx.now), withdrawnApplications: withdrawn };
  });

  router.post('/admin/users/:userId/unban', (ctx) => {
    const me = allowed(ctx, 'users.manage');
    const user = findUserOr404(ctx);
    if (user.status !== 'banned') throw httpError(409, "This account isn't banned.", 'NOT_BANNED');
    Object.assign(user, { status: 'active', bannedAt: null, banReason: '', bannedBy: null });
    audit(ctx, me, 'user.unban', 'user', user.id, user.displayName || user.email, readReason(ctx.body, false));
    return { user: adminUser(user, ctx.now) };
  });

  // Deleting keeps the account row (anonymised) so past events, matches and gifts stay intact
  router.delete('/admin/users/:userId', (ctx) => {
    const me = allowed(ctx, 'users.manage');
    const { state, now } = ctx;
    const user = findUserOr404(ctx);
    notSelf(me, user, "You can't delete your own account from here.");
    if (user.role !== 'user') throw httpError(400, 'Take away their site role before deleting the account.', 'VALIDATION');
    const label = user.displayName || user.email;
    withdrawApplications(state, user, now);
    for (const c of state.characters) if (c.owner === user.id && !c.archivedAt) c.archivedAt = now.toISOString();
    state.notifications = state.notifications.filter((n) => n.user !== user.id);
    Object.assign(user, {
      status: 'deactivated',
      deactivatedAt: now.toISOString(),
      bannedAt: null,
      banReason: '',
      bannedBy: null,
      email: `deleted-${user.id}@deleted.invalid`,
      displayName: 'Deleted user',
      username: null,
      avatarUrl: null,
      bio: '',
      password: '',
      socials: emptySocials(),
      defaultForm: { communityUsername: '', canCreate: [], wantsTypes: [], likes: '', adoptWishlist: '', avoid: '', cannotDraw: [] },
      profilePrivacy: { showExchanges: false, showGifts: false, listInDiscover: false },
      artistTags: { makes: [], themes: [], activity: '', cardColor: '' },
      sessionVersion: (user.sessionVersion || 0) + 1,
    });
    audit(ctx, me, 'user.delete', 'user', user.id, label, readReason(ctx.body, false));
    return { ok: true };
  });

  // Events
  router.get('/admin/events', (ctx) => {
    const me = allowed(ctx, 'events.moderate');
    const { state, query } = ctx;
    let rows = [...state.events];
    const q = str(queryParam(query, 'q')).slice(0, 100);
    if (q) {
      const re = new RegExp(escapeRegex(q), 'i');
      rows = rows.filter((e) => textMatch(re, e.name, e.theme));
    }
    const status = queryParam(query, 'status');
    if (ALL_EVENT_STATUSES.includes(status)) rows = rows.filter((e) => e.status === status);
    const moderation = queryParam(query, 'moderation');
    if (moderation === 'disabled') rows = rows.filter((e) => e.disabledAt);
    if (moderation === 'none') rows = rows.filter((e) => !e.disabledAt);
    rows.sort(byNewest);
    const { rows: page, ...meta } = pageOf(rows, paging(query));
    return {
      events: page.map((e) => ({ ...serializeEvent(state, e, me), createdBy: userMini(findUser(state, e.createdBy)) })),
      ...meta,
    };
  });

  router.post('/admin/events/:eventId/disable', (ctx) => {
    const me = allowed(ctx, 'events.moderate');
    const { state } = ctx;
    const event = findEventOr404(ctx);
    const reason = readReason(ctx.body, true);
    if (event.disabledAt) throw httpError(409, 'This event is already disabled.', 'ALREADY_DISABLED');
    Object.assign(event, { disabledAt: ctx.now.toISOString(), disabledReason: reason, disabledBy: me.id, updatedAt: ctx.now.toISOString() });
    notifyMany(state, organizerIds(state, event.id), {
      type: 'event_status',
      title: `${event.name} was disabled by the site admins`,
      message: `Only organisers can see it until it's turned back on. Reason: ${reason}`,
      link: `/events/${event.id}`,
    });
    audit(ctx, me, 'event.disable', 'event', event.id, event.name, reason);
    return { event: serializeEvent(state, event, me) };
  });

  router.post('/admin/events/:eventId/enable', (ctx) => {
    const me = allowed(ctx, 'events.moderate');
    const { state } = ctx;
    const event = findEventOr404(ctx);
    if (!event.disabledAt) throw httpError(409, "This event isn't disabled.", 'NOT_DISABLED');
    Object.assign(event, { disabledAt: null, disabledReason: '', disabledBy: null, updatedAt: ctx.now.toISOString() });
    notifyMany(state, organizerIds(state, event.id), {
      type: 'event_status',
      title: `${event.name} is visible again`,
      message: 'The site admins turned your event back on.',
      link: `/events/${event.id}`,
    });
    audit(ctx, me, 'event.enable', 'event', event.id, event.name, readReason(ctx.body, false));
    return { event: serializeEvent(state, event, me) };
  });

  router.post('/admin/events/:eventId/cancel', (ctx) => {
    const me = allowed(ctx, 'events.moderate');
    const { state } = ctx;
    const event = findEventOr404(ctx);
    const reason = readReason(ctx.body, true);
    if (event.status === 'cancelled') throw httpError(409, 'This event is already cancelled.', 'ALREADY_CANCELLED');
    event.statusBeforeCancel = event.status;
    setStatus(event, 'cancelled', me.id);
    Object.assign(event, { cancelledAt: ctx.now.toISOString(), cancelReason: reason, cancelledBy: me.id });
    notifyMany(state, everyoneIn(state, event.id), {
      type: 'event_status',
      title: `${event.name} was cancelled`,
      message: `The site admins cancelled this event. Reason: ${reason}`,
      link: `/events/${event.id}`,
    });
    audit(ctx, me, 'event.cancel', 'event', event.id, event.name, reason);
    return { event: serializeEvent(state, event, me) };
  });

  router.post('/admin/events/:eventId/restore', (ctx) => {
    const me = allowed(ctx, 'events.moderate');
    const { state } = ctx;
    const event = findEventOr404(ctx);
    if (event.status !== 'cancelled') throw httpError(409, "This event isn't cancelled.", 'NOT_CANCELLED');
    setStatus(event, event.statusBeforeCancel || 'draft', me.id);
    Object.assign(event, { statusBeforeCancel: null, cancelledAt: null, cancelReason: '', cancelledBy: null });
    notifyMany(state, everyoneIn(state, event.id), {
      type: 'event_status',
      title: `${event.name} is back on`,
      message: 'The site admins restored this event.',
      link: `/events/${event.id}`,
    });
    audit(ctx, me, 'event.restore', 'event', event.id, event.name, readReason(ctx.body, false));
    return { event: serializeEvent(state, event, me) };
  });

  router.delete('/admin/events/:eventId', (ctx) => {
    const me = allowed(ctx, 'events.moderate');
    const { state } = ctx;
    const event = findEventOr404(ctx);
    const reason = readReason(ctx.body, false);
    notifyMany(state, everyoneIn(state, event.id), {
      type: 'event_status',
      title: `${event.name} was removed`,
      message: reason ? `The site admins removed this event. Reason: ${reason}` : 'The site admins removed this event.',
      link: '/my-events',
    });
    state.applications = state.applications.filter((a) => a.event !== event.id);
    state.matches = state.matches.filter((m) => m.event !== event.id);
    state.submissions = state.submissions.filter((s) => s.event !== event.id);
    state.members = state.members.filter((m) => m.event !== event.id);
    state.events = state.events.filter((e) => e.id !== event.id);
    audit(ctx, me, 'event.delete', 'event', event.id, event.name, reason);
    return { ok: true };
  });

  // Reports
  router.get('/admin/reports', (ctx) => {
    allowed(ctx, 'reports.review');
    const { state, query } = ctx;
    const wanted = queryParam(query, 'status');
    const status = REPORT_STATUSES.includes(wanted) ? wanted : 'open';
    // Open reports oldest first, so nothing waits forever; handled ones newest first
    const rows = state.reports.filter((r) => r.status === status).sort((a, b) => (status === 'open' ? -byNewest(a, b) : byNewest(a, b)));
    const { rows: page, ...meta } = pageOf(rows, paging(query));
    const counts = Object.fromEntries(REPORT_STATUSES.map((s) => [s, state.reports.filter((r) => r.status === s).length]));
    return { reports: page.map((r) => reportJson(state, r)), counts, ...meta };
  });

  router.patch('/admin/reports/:reportId', (ctx) => {
    const me = allowed(ctx, 'reports.review');
    const { state } = ctx;
    const report = state.reports.find((r) => r.id === ctx.params.reportId);
    if (!report) throw httpError(404, 'Report not found.', 'NOT_FOUND');
    const status = ctx.body?.status;
    if (!REPORT_STATUSES.includes(status)) throw httpError(400, 'Pick open, resolved or dismissed.', 'VALIDATION');
    const resolution = str(ctx.body?.resolution).slice(0, 500);
    const was = report.status;
    Object.assign(report, {
      status,
      resolution: status === 'open' ? '' : resolution,
      handledBy: status === 'open' ? null : me.id,
      handledAt: status === 'open' ? null : ctx.now.toISOString(),
    });
    const action = { open: 'report.reopen', resolved: 'report.resolve', dismissed: 'report.dismiss' }[status];
    audit(ctx, me, action, 'report', report.id, report.targetLabel, resolution);
    // Let the reporter know it was looked at (once, when it first leaves the queue)
    if (was === 'open' && status !== 'open') {
      notify(state, report.reporter, {
        type: 'report_handled',
        title: `Your report about ${report.targetLabel} was reviewed`.slice(0, 120),
        message: REPORT_DONE_MESSAGES[status],
        link: '',
      });
    }
    return { report: reportJson(state, report) };
  });

  // Museum chat
  router.get('/admin/chat', (ctx) => {
    allowed(ctx, 'chat.logs');
    const { state, query, now } = ctx;
    let rows = [...state.chats];
    const q = str(queryParam(query, 'q')).slice(0, 100);
    if (q) {
      const re = new RegExp(escapeRegex(q), 'i');
      rows = rows.filter((m) => re.test(m.text || ''));
    }
    const person = str(queryParam(query, 'person')).slice(0, 100);
    if (person) {
      const re = new RegExp(escapeRegex(person), 'i');
      const ids = new Set(state.users.filter((u) => textMatch(re, u.displayName, u.username, u.email)).map((u) => u.id));
      rows = rows.filter((m) => ids.has(m.user));
    }
    const show = queryParam(query, 'show');
    if (show === 'hidden') rows = rows.filter((m) => m.hiddenAt);
    if (show === 'visible') rows = rows.filter((m) => !m.hiddenAt);
    rows.sort(byNewest);
    const { rows: page, ...meta } = pageOf(rows, paging(query));
    return { messages: page.map((m) => chatRow(state, m, now)), ...meta };
  });

  router.post('/admin/chat/:messageId/hide', (ctx) => {
    const me = allowed(ctx, 'chat.moderate');
    const message = findMessage(ctx);
    if (!message.hiddenAt) {
      Object.assign(message, { hiddenAt: ctx.now.toISOString(), hiddenBy: me.id });
      audit(ctx, me, 'chat.hide', 'chat', message.id, String(message.text || '').slice(0, 80), readReason(ctx.body, false));
    }
    return { ok: true };
  });

  router.post('/admin/chat/:messageId/unhide', (ctx) => {
    const me = allowed(ctx, 'chat.moderate');
    const message = findMessage(ctx);
    if (message.hiddenAt) {
      Object.assign(message, { hiddenAt: null, hiddenBy: null });
      audit(ctx, me, 'chat.unhide', 'chat', message.id, String(message.text || '').slice(0, 80));
    }
    return { ok: true };
  });

  // Pause someone's museum chat for a while (they can still walk around and look)
  router.post('/admin/users/:userId/mute', (ctx) => {
    const me = allowed(ctx, 'chat.moderate');
    const user = findUserOr404(ctx);
    notSelf(me, user, "You can't mute yourself.");
    if (user.role !== 'user') throw httpError(400, "Moderators and admins can't be muted.", 'VALIDATION');
    const minutes = Number(ctx.body?.minutes);
    const option = MUTE_OPTIONS.find((o) => o.minutes === minutes);
    if (!option) throw httpError(400, `Pick how long: ${MUTE_OPTIONS.map((o) => o.label).join(', ')}.`, 'VALIDATION');
    const reason = readReason(ctx.body, true);
    user.chatMutedUntil = new Date(ctx.now.getTime() + minutes * 60 * 1000).toISOString();
    user.chatMuteReason = reason;
    audit(ctx, me, 'user.mute', 'user', user.id, user.displayName || user.email, `${option.label}: ${reason}`);
    notifyMany(ctx.state, [user.id], {
      type: 'chat_muted',
      title: 'Your museum chat is paused for a while',
      message: `A moderator paused your chat: ${reason}`.slice(0, 500),
      link: '/museum',
    });
    return { user: adminUser(user, ctx.now) };
  });

  router.post('/admin/users/:userId/unmute', (ctx) => {
    const me = allowed(ctx, 'chat.moderate');
    const user = findUserOr404(ctx);
    if (user.chatMutedUntil) {
      user.chatMutedUntil = null;
      user.chatMuteReason = '';
      audit(ctx, me, 'user.unmute', 'user', user.id, user.displayName || user.email);
    }
    return { user: adminUser(user, ctx.now) };
  });

  // Vision (Ollama): nothing to reach in the browser, so it says so
  router.get('/admin/vision', (ctx) => {
    allowed(ctx, 'stats.view');
    return { report: demoVisionReport(ctx.state, ctx.now) };
  });

  router.post('/admin/vision/test', (ctx) => {
    allowed(ctx, 'stats.view');
    return {
      result: { ok: false, step: 'connect', error: 'Demo mode has no Ollama server to test. Run the app with Start-all and an Ollama server to try it.', timings: {} },
    };
  });

  // Audit log
  router.get('/admin/audit', (ctx) => {
    allowed(ctx, 'audit.view');
    const { state, query } = ctx;
    let rows = [...state.audit];
    const targetType = queryParam(query, 'targetType');
    if (['user', 'event', 'report', 'chat'].includes(targetType)) rows = rows.filter((e) => e.targetType === targetType);
    rows.sort(byNewest);
    const { rows: page, ...meta } = pageOf(rows, paging(query));
    return {
      entries: page.map((e) => ({
        id: e.id,
        action: e.action,
        targetType: e.targetType,
        targetId: e.targetId,
        targetLabel: e.targetLabel,
        reason: e.reason || '',
        actor: userMini(findUser(state, e.actor)),
        createdAt: e.createdAt,
      })),
      ...meta,
    };
  });
}
