// GET /dashboard (server/routes/dashboard-router.js) and GET /health
import { eventMini, miniOf } from '../model.js';
import { toMs } from '../util.js';

const DAY = 24 * 60 * 60 * 1000;
const RECENTLY_COMPLETED_DAYS = 30;
const MAX_UPCOMING = 10;

// The date an organiser cares about next, for sorting their events
function nextDate(event) {
  if (event.status === 'completed') return toMs(event.completedAt || event.updatedAt);
  return toMs(['draft', 'open'].includes(event.status) ? event.signupDeadline : event.submissionDeadline);
}

function organizerStats(state, event, now) {
  const apps = state.applications.filter((a) => a.event === event.id && a.status !== 'withdrawn');
  const matches = state.matches.filter((m) => m.event === event.id);
  const submittedIds = new Set(state.submissions.filter((s) => s.event === event.id).map((s) => s.match));
  const published = matches.filter((m) => m.published);
  const submitted = published.filter((m) => submittedIds.has(m.id)).length;
  const missing = published.length - submitted;
  return {
    applications: apps.length,
    pending: apps.filter((a) => a.status === 'pending').length,
    accepted: apps.filter((a) => a.status === 'accepted').length,
    matched: matches.length,
    submitted,
    missing,
    overdue: now.getTime() > toMs(event.submissionDeadline) ? missing : 0,
  };
}

export function register(router) {
  router.get('/health', () => ({ ok: true, db: 'browser', time: new Date().toISOString() }));

  router.get('/dashboard', (ctx) => {
    const user = ctx.requireAuth();
    const { state, now } = ctx;

    const organizingIds = new Set(
      state.members.filter((m) => m.user === user.id && m.roles.includes('organizer')).map((m) => m.event)
    );
    const applications = state.applications.filter(
      (a) => a.user === user.id && ['pending', 'accepted', 'waitlisted'].includes(a.status)
    );
    const applicationByEvent = new Map(applications.map((a) => [a.event, a]));
    // Gifts I make: my own matches, plus any I took over as a backup
    const myMatches = state.matches.filter((m) => (m.giver === user.id || m.backupGiver === user.id) && m.published);
    const unreadNotifications = state.notifications.filter((n) => n.user === user.id && !n.readAt).length;
    const allIds = new Set([...organizingIds, ...applicationByEvent.keys(), ...myMatches.map((m) => m.event)]);

    // Older finished events never show up on the dashboard
    const since = now.getTime() - RECENTLY_COMPLETED_DAYS * DAY;
    const events = state.events.filter(
      (e) =>
        allIds.has(e.id) &&
        (e.status !== 'completed' ||
          (e.completedAt ? toMs(e.completedAt) >= since : toMs(e.updatedAt) >= since))
    );
    const eventById = new Map(events.map((e) => [e.id, e]));

    // Events I organise: everything still running, plus anything completed in the last 30 days
    const organizing = events
      .filter((e) => organizingIds.has(e.id))
      .sort((a, b) => {
        const doneA = a.status === 'completed' ? 1 : 0;
        const doneB = b.status === 'completed' ? 1 : 0;
        if (doneA !== doneB) return doneA - doneB;
        return doneA ? nextDate(b) - nextDate(a) : nextDate(a) - nextDate(b);
      });

    // My gifts to make: published matches in active events.
    // late: handed in after the deadline, or not handed in and the deadline has passed
    const assignments = myMatches
      .filter((m) => eventById.get(m.event)?.status === 'active' && !(m.giver === user.id && m.backupGiver))
      .map((m) => {
        const event = eventById.get(m.event);
        const submission = state.submissions.find((s) => s.match === m.id);
        return {
          event: eventMini(event),
          recipientName: miniOf(state, m.recipient).displayName,
          backupMatchId: m.giver === user.id ? null : m.id,
          submitted: Boolean(submission),
          late: submission ? Boolean(submission.late) : now.getTime() > toMs(event.submissionDeadline),
        };
      })
      .sort((a, b) => toMs(a.event.submissionDeadline) - toMs(b.event.submissionDeadline));

    // Deadlines still ahead in events I organise or am signed up for
    const upcoming = [];
    for (const event of events) {
      const application = applicationByEvent.get(event.id);
      const isOrganizer = organizingIds.has(event.id);
      if (event.status === 'open' && (isOrganizer || application) && toMs(event.signupDeadline) > now.getTime()) {
        upcoming.push({ eventId: event.id, eventName: event.name, kind: 'signup', at: event.signupDeadline });
      }
      if (
        event.status === 'active' &&
        (isOrganizer || application?.status === 'accepted') &&
        toMs(event.submissionDeadline) > now.getTime()
      ) {
        upcoming.push({ eventId: event.id, eventName: event.name, kind: 'submission', at: event.submissionDeadline });
      }
    }
    upcoming.sort((a, b) => toMs(a.at) - toMs(b.at));

    const participating = applications.filter(
      (a) => a.status === 'accepted' && eventById.has(a.event) && eventById.get(a.event).status !== 'completed'
    ).length;

    return {
      assignments,
      organizing: organizing.map((event) => ({ event: eventMini(event), stats: organizerStats(state, event, now) })),
      upcoming: upcoming.slice(0, MAX_UPCOMING),
      counts: {
        organizing: organizing.filter((e) => e.status !== 'completed').length,
        participating,
        unreadNotifications,
      },
    };
  });
}
