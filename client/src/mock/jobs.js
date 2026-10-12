// The server runs a reminder job every hour (server/services/reminders.js). The mock has
// no background process, so the same checks run at the start of every request instead.
// Each reminder fires once per event, tracked in event.remindersSent like on the server.
import { LIMITS } from '@shared/constants.mjs';
import { emptySocials } from './db.js';
import { acceptedUserIds, notifyMany, organizerIds, setStatus } from './model.js';
import { plural, timeLeft, toMs } from './util.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const KEYS = {
  signupWarning: 'signup-48h',
  signupClosed: 'signup-closed',
  submission72h: 'submission-72h',
  submission24h: 'submission-24h',
  overdue: 'submission-overdue',
};

function claim(event, ...keys) {
  if (keys.every((k) => event.remindersSent.includes(k))) return false;
  for (const key of keys) if (!event.remindersSent.includes(key)) event.remindersSent.push(key);
  return true;
}

function missingGivers(state, eventId) {
  const done = new Set(state.submissions.filter((s) => s.event === eventId).map((s) => s.match));
  return state.matches.filter((m) => m.event === eventId && m.published && !done.has(m.id));
}

const countApps = (state, eventId, status) =>
  state.applications.filter((a) => a.event === eventId && a.status === status).length;

function autoCloseSignups(state, now) {
  let changed = false;
  for (const event of state.events) {
    if (event.status !== 'open' || toMs(event.signupDeadline) > now.getTime()) continue;
    setStatus(event, 'matching', null);
    claim(event, KEYS.signupClosed);
    changed = true;

    const accepted = countApps(state, event.id, 'accepted');
    const pending = countApps(state, event.id, 'pending');
    const parts = [`${plural(accepted, 'participant is', 'participants are')} in.`];
    if (pending) parts.push(`${plural(pending, 'application is', 'applications are')} still waiting for review.`);
    if (accepted < Math.max(event.minParticipants, 2)) {
      parts.push(`That's below your minimum of ${event.minParticipants}; you can reopen sign-ups with a later deadline.`);
    } else {
      parts.push('Generate matches when you are ready.');
    }
    notifyMany(state, organizerIds(state, event.id), {
      type: 'event_status',
      title: `Sign-ups closed for ${event.name}`,
      message: parts.join(' '),
      link: `/events/${event.id}/manage?tab=matching`,
    });

    // Same message participants get when an organiser closes sign-ups by hand
    const organizers = new Set(organizerIds(state, event.id));
    notifyMany(
      state,
      acceptedUserIds(state, event.id).filter((id) => !organizers.has(id)),
      {
        type: 'event_status',
        title: `Sign-ups closed for ${event.name}, matches are on the way`,
        message: "You'll get a notification as soon as you can see who you're making a gift for.",
        link: `/events/${event.id}`,
      }
    );
  }
  return changed;
}

function warnSignupsClosing(state, now) {
  let changed = false;
  for (const event of state.events) {
    const left = toMs(event.signupDeadline) - now.getTime();
    if (event.status !== 'open' || left <= 0 || left > 48 * HOUR) continue;
    if (!claim(event, KEYS.signupWarning)) continue;
    changed = true;
    const accepted = countApps(state, event.id, 'accepted');
    const pending = countApps(state, event.id, 'pending');
    let message = `${plural(accepted, 'person has', 'people have')} signed up so far.`;
    if (pending) message += ` ${plural(pending, 'application needs', 'applications need')} your review.`;
    notifyMany(state, organizerIds(state, event.id), {
      type: 'deadline_reminder',
      title: `Sign-ups for ${event.name} close ${timeLeft(event.signupDeadline, now)}`,
      message,
      link: `/events/${event.id}/manage`,
    });
  }
  return changed;
}

function remindGivers(state, now) {
  let changed = false;
  for (const event of state.events) {
    const left = toMs(event.submissionDeadline) - now.getTime();
    if (event.status !== 'active' || left <= 0 || left > 72 * HOUR) continue;
    if (event.remindersSent.includes(KEYS.submission24h)) continue;
    const within24h = left <= 24 * HOUR;
    if (!within24h && event.remindersSent.includes(KEYS.submission72h)) continue;
    // If the 72 h window was missed, only the 24 h one goes out
    const keys = within24h ? [KEYS.submission24h, KEYS.submission72h] : [KEYS.submission72h];
    if (!claim(event, ...keys)) continue;
    changed = true;
    const pending = missingGivers(state, event.id);
    if (!pending.length) continue;
    notifyMany(
      state,
      pending.map((m) => m.giver),
      {
        type: 'deadline_reminder',
        title: `Your gift for ${event.name} is due ${timeLeft(event.submissionDeadline, now)}`,
        message: within24h
          ? 'Last call! Upload your finished gift before the deadline so your giftee gets it on time.'
          : 'A friendly reminder to finish and upload your gift before the deadline.',
        link: `/events/${event.id}/submit`,
      }
    );
  }
  return changed;
}

function reportOverdue(state, now) {
  let changed = false;
  for (const event of state.events) {
    if (event.status !== 'active' || toMs(event.submissionDeadline) > now.getTime()) continue;
    if (!claim(event, KEYS.overdue)) continue;
    changed = true;
    const missing = missingGivers(state, event.id).length;
    const total = state.matches.filter((m) => m.event === event.id && m.published).length;
    notifyMany(state, organizerIds(state, event.id), {
      type: 'deadline_reminder',
      title: missing
        ? `${plural(missing, 'gift is', 'gifts are')} missing for ${event.name}`
        : `Every gift is in for ${event.name}`,
      message: missing
        ? `The submission deadline has passed and ${missing} of ${total} gifts haven't been uploaded. ` +
          'You can send a reminder or follow up in your community.'
        : 'The submission deadline has passed and all gifts are in. Check them over, then complete the event to reveal them.',
      link: `/events/${event.id}/manage?tab=submissions`,
    });
  }
  return changed;
}

// Accounts past the grace period keep their row but lose everything that identifies them
function purgeDeactivated(state, now) {
  let changed = false;
  const cutoff = now.getTime() - LIMITS.deactivationGraceDays * DAY;
  for (const user of state.users) {
    if (user.status !== 'deactivated' || !user.deactivatedAt || toMs(user.deactivatedAt) > cutoff) continue;
    if (user.email.endsWith('@deleted.invalid')) continue;
    Object.assign(user, {
      email: `deleted-${user.id}@deleted.invalid`,
      displayName: 'Deleted user',
      username: null,
      avatarUrl: null,
      bio: '',
      password: '',
      socials: emptySocials(),
      defaultForm: { communityUsername: '', canCreate: [], wantsTypes: [], likes: '', avoid: '', cannotDraw: [] },
      sessionVersion: (user.sessionVersion || 0) + 1,
    });
    changed = true;
  }
  return changed;
}

// Returns true when something changed (so the caller saves)
export function runJobs(state, now = new Date()) {
  let changed = false;
  for (const event of state.events) event.remindersSent ||= [];
  changed = autoCloseSignups(state, now) || changed;
  changed = warnSignupsClosing(state, now) || changed;
  changed = remindGivers(state, now) || changed;
  changed = reportOverdue(state, now) || changed;
  changed = purgeDeactivated(state, now) || changed;
  return changed;
}
