// What happens to someone's events when they deactivate their account (profile-router.js).
// Sign-ups that haven't been matched yet are withdrawn, so organisers aren't left matching
// someone who is gone. Published matches stay: those gifts are already being made.
const Application = require('../models/Application.js');
const EventMember = require('../models/EventMember.js');
const Match = require('../models/Match.js');
const { userMini } = require('../models/User.js');
const { organizerIds } = require('./events.js');
const { notifyMany } = require('./notify.js');

const WITHDRAW_IN = ['draft', 'open', 'matching'];

// Returns how many applications were withdrawn
async function withdrawApplications(user) {
  const applications = await Application.find({ user: user._id, status: { $in: ['pending', 'accepted'] } })
    .populate('event', 'name status');
  const name = userMini(user).displayName;
  let withdrawn = 0;

  for (const application of applications) {
    const event = application.event;
    if (!event || !WITHDRAW_IN.includes(event.status)) continue;
    const wasAccepted = application.status === 'accepted';

    // updateOne: an old application shouldn't fail on validators added since it was saved
    await Application.updateOne({ _id: application._id }, { $set: { status: 'withdrawn' } });
    await EventMember.revoke(user._id, event._id, 'participant');
    withdrawn += 1;

    if (event.status !== 'matching' || !wasAccepted) continue;
    // Draft matches were made with this person in them
    const { deletedCount } = await Match.deleteMany({ event: event._id, published: false });
    const recipients = (await organizerIds(event._id)).filter((id) => !id.equals(user._id));
    try {
      await notifyMany(recipients, {
        type: 'application_withdrawn',
        title: `${name} left ${event.name}`,
        message: deletedCount
          ? 'Their account was deactivated, so their sign-up was withdrawn. Generate the matches again before publishing.'
          : 'Their account was deactivated, so their sign-up was withdrawn.',
        link: `/events/${event._id}/manage?tab=matching`,
      });
    } catch (err) {
      console.error('Notification failed:', err.message);
    }
  }
  return withdrawn;
}

module.exports = { withdrawApplications };
