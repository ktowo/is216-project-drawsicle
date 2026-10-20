// /reports: flag something for the site admins (server/routes/report-router.js).
// They go into the same queue the demo's admin tools work through (handlers/admin.js).
import { LIMITS, REPORT_REASON_VALUES, REPORT_TARGETS } from '@shared/constants.mjs';
import { newId } from '../db.js';
import { notifyMany } from '../model.js';
import { httpError, invalid } from '../util.js';

const DAY = 24 * 60 * 60 * 1000;

// Same idea as describeTarget in server/services/reports.js: { label, owner } or null when it's gone
function describeTarget(state, type, id) {
  switch (type) {
    case 'submission': {
      const sub = state.submissions.find((s) => s.id === id);
      if (!sub) return null;
      const by = state.users.find((u) => u.id === sub.giver)?.displayName || 'someone';
      const event = state.events.find((e) => e.id === sub.event);
      return {
        label: `${sub.title ? `"${sub.title}"` : 'A gift'} by ${by}${event ? ` in ${event.name}` : ''}`,
        owner: sub.giver,
      };
    }
    case 'user': {
      const user = state.users.find((u) => u.id === id);
      return user ? { label: user.username ? `${user.displayName} (@${user.username})` : user.displayName, owner: user.id } : null;
    }
    case 'character': {
      const c = state.characters.find((x) => x.id === id);
      return c ? { label: c.species ? `${c.name} (${c.species})` : c.name, owner: c.owner } : null;
    }
    case 'event': {
      const e = state.events.find((x) => x.id === id);
      return e ? { label: e.name, owner: e.createdBy } : null;
    }
    default:
      return null;
  }
}

export function register(router) {
  router.post('/reports', (ctx) => {
    const { state } = ctx;
    const user = ctx.requireAuth();
    const body = ctx.body || {};
    const { targetType, targetId, reason } = body;
    if (!REPORT_TARGETS.includes(targetType)) throw invalid("That can't be reported.");
    if (!REPORT_REASON_VALUES.includes(reason)) throw invalid('Pick a reason from the list.');
    if (body.details !== undefined && typeof body.details !== 'string') throw invalid('Details must be text.');
    const details = (body.details || '').trim();
    if (details.length > LIMITS.reportDetails) throw invalid(`Details are too long (max ${LIMITS.reportDetails} characters).`);
    if (reason === 'other' && !details) throw invalid('Tell the admins a little about what is wrong.');

    const target = typeof targetId === 'string' ? describeTarget(state, targetType, targetId) : null;
    if (!target) throw httpError(404, "We couldn't find what you're reporting. It may have been removed.", 'NOT_FOUND');
    if (target.owner === user.id) throw invalid("You can't report your own things.");

    const mine = state.reports.filter((r) => r.reporter === user.id);
    if (mine.some((r) => r.targetType === targetType && r.targetId === targetId && r.status === 'open')) {
      throw httpError(409, "You've already reported this. The admins will look at it soon.", 'ALREADY_REPORTED');
    }
    const since = ctx.now.getTime() - DAY;
    if (mine.filter((r) => new Date(r.createdAt).getTime() >= since).length >= LIMITS.reportsPerDay) {
      throw httpError(429, "You've sent a lot of reports today. Try again tomorrow, or email the admins.", 'TOO_MANY');
    }

    const report = {
      id: newId(),
      reporter: user.id,
      targetType,
      targetId,
      targetLabel: target.label.slice(0, 200),
      targetOwner: target.owner || null,
      reason,
      details,
      status: 'open',
      createdAt: ctx.now.toISOString(),
    };
    state.reports.push(report);

    const admins = state.users.filter((u) => u.role === 'admin' && (u.status || 'active') === 'active').map((u) => u.id);
    notifyMany(state, admins, {
      type: 'report_received',
      title: `New report: ${target.label}`,
      message: details.slice(0, 200),
      link: '/admin?tab=reports',
    });

    ctx.status = 201;
    return { report: { id: report.id, status: report.status } };
  });
}
