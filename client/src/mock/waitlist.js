// The waitlist for full events (server/services/waitlist.js): when a place opens, the people who
// have waited longest move in and are told.
import { grantRole, notify, participantCount } from './model.js';

export function promoteFromWaitlist(state, event, now = new Date()) {
  if (!event || event.status !== 'open' || event.disabledAt) return 0;
  const free = event.maxParticipants - participantCount(state, event.id);
  if (free <= 0) return 0;

  const queue = state.applications
    .filter((a) => a.event === event.id && a.status === 'waitlisted')
    .sort(
      (a, b) =>
        String(a.waitlistedAt || a.createdAt).localeCompare(String(b.waitlistedAt || b.createdAt)) || a.id.localeCompare(b.id)
    )
    .slice(0, free);

  for (const application of queue) {
    const status = event.requireApproval ? 'pending' : 'accepted';
    application.status = status;
    application.waitlistedAt = null;
    application.updatedAt = now.toISOString();
    if (status === 'accepted') grantRole(state, application.user, event.id, 'participant');
    notify(state, application.user, {
      type: 'waitlist_promoted',
      title: status === 'accepted' ? `A place opened up: you're in ${event.name}!` : `A place opened up in ${event.name}`,
      message:
        status === 'accepted'
          ? "You've moved off the waitlist and are taking part. Matches come out after sign-ups close."
          : 'You moved off the waitlist. Your sign-up is now waiting for the organisers to review it.',
      link: `/events/${event.id}`,
    });
  }
  return queue.length;
}
