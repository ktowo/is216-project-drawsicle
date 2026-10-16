// What happens to someone's events when they deactivate their account (server/services/accounts.js).
// Sign-ups that haven't been matched yet are withdrawn, so organisers aren't left matching
// someone who is gone. Published matches stay: those gifts are already being made.
import { notifyMany, organizerIds, revokeRole, userMini } from './model.js';
import { promoteFromWaitlist } from './waitlist.js';

const WITHDRAW_IN = ['draft', 'open', 'matching'];

// Returns how many applications were withdrawn
export function withdrawApplications(state, user, now) {
  const name = userMini(user).displayName;
  let withdrawn = 0;

  for (const application of state.applications) {
    if (application.user !== user.id || !['pending', 'accepted', 'waitlisted'].includes(application.status)) continue;
    const event = state.events.find((e) => e.id === application.event);
    if (!event || !WITHDRAW_IN.includes(event.status)) continue;
    const wasAccepted = application.status === 'accepted';

    application.status = 'withdrawn';
    application.updatedAt = now.toISOString();
    revokeRole(state, user.id, event.id, 'participant');
    withdrawn += 1;
    if (wasAccepted && event.status === 'open') promoteFromWaitlist(state, event, now);

    if (event.status !== 'matching' || !wasAccepted) continue;
    // Draft matches were made with this person in them
    const before = state.matches.length;
    state.matches = state.matches.filter((m) => !(m.event === event.id && !m.published));
    const deleted = before - state.matches.length;
    const recipients = organizerIds(state, event.id).filter((id) => id !== user.id);
    notifyMany(state, recipients, {
      type: 'application_withdrawn',
      title: `${name} left ${event.name}`,
      message: deleted
        ? 'Their account was deactivated, so their sign-up was withdrawn. Generate the matches again before publishing.'
        : 'Their account was deactivated, so their sign-up was withdrawn.',
      link: `/events/${event.id}/manage?tab=matching`,
    });
  }
  return withdrawn;
}
