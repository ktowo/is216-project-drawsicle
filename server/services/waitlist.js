// The waitlist for full events. When a place opens (someone withdraws, is removed, or the
// organisers raise the limit) the people who have waited longest move in and are told.
const Application = require('../models/Application.js');
const EventMember = require('../models/EventMember.js');
const { participantCount } = require('./events.js');
const { notify } = require('./notify.js');

// Fills free places from the waitlist while sign-ups are open. Returns how many moved in.
// Approval events move people to "pending" so the organisers still decide.
async function promoteFromWaitlist(event) {
  if (!event || event.status !== 'open' || event.disabledAt) return 0;
  const free = event.maxParticipants - (await participantCount(event._id));
  if (free <= 0) return 0;

  const queue = await Application.find({ event: event._id, status: 'waitlisted' })
    .sort({ waitlistedAt: 1, createdAt: 1, _id: 1 })
    .limit(free);

  let moved = 0;
  for (const application of queue) {
    const status = event.requireApproval ? 'pending' : 'accepted';
    // Only if nobody else moved them in the meantime
    const { modifiedCount } = await Application.updateOne(
      { _id: application._id, status: 'waitlisted' },
      { $set: { status, waitlistedAt: null } }
    );
    if (!modifiedCount) continue;
    moved += 1;
    if (status === 'accepted') await EventMember.grant(application.user, event._id, 'participant');
    try {
      await notify(application.user, {
        type: 'waitlist_promoted',
        title: status === 'accepted' ? `A place opened up: you're in ${event.name}!` : `A place opened up in ${event.name}`,
        message:
          status === 'accepted'
            ? "You've moved off the waitlist and are taking part. Matches come out after sign-ups close."
            : 'You moved off the waitlist. Your sign-up is now waiting for the organisers to review it.',
        link: `/events/${event._id}`,
        email: 'eventUpdates',
      });
    } catch (err) {
      console.error('Waitlist notification failed:', err.message);
    }
  }
  return moved;
}

module.exports = { promoteFromWaitlist };
