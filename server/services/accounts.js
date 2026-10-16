// What happens to someone's events when they deactivate their account (profile-router.js).
// Sign-ups that haven't been matched yet are withdrawn, so organisers aren't left matching
// someone who is gone. Published matches stay: those gifts are already being made.
const Application = require('../models/Application.js');
const Event = require('../models/Event.js');
const EventMember = require('../models/EventMember.js');
const Match = require('../models/Match.js');
const User = require('../models/User.js');
const Follow = require('../models/Follow.js');
const Presence = require('../models/Presence.js');
const ChatMessage = require('../models/ChatMessage.js');
const { userMini } = User;
const { organizerIds } = require('./events.js');
const { notifyMany } = require('./notify.js');
const { promoteFromWaitlist } = require('./waitlist.js');

const WITHDRAW_IN = ['draft', 'open', 'matching'];

// Returns how many applications were withdrawn
async function withdrawApplications(user) {
  const applications = await Application.find({ user: user._id, status: { $in: ['pending', 'accepted', 'waitlisted'] } })
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
    // Their place goes to whoever has waited longest
    if (wasAccepted && event.status === 'open') await promoteFromWaitlist(await Event.findById(event._id));

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

// Strips everything personal from an account but keeps the document, so events, matches
// and gifts that point at it stay valid. Used by the 30-day purge and by admin deletes.
// filter narrows the update (e.g. { status: 'deactivated' }); returns true if it changed.
async function anonymiseUser(userId, filter = {}) {
  const socials = Object.fromEntries(User.SOCIAL_KEYS.map((key) => [key, '']));
  const result = await User.updateOne(
    { _id: userId, ...filter },
    {
      $set: {
        email: `deleted-${userId}@deleted.invalid`,
        displayName: 'Deleted user',
        bio: '',
        socials,
        defaultForm: { communityUsername: '', canCreate: [], wantsTypes: [], likes: '', avoid: '', cannotDraw: [] },
        // A deleted account can't agree to anything being shown
        profilePrivacy: { showExchanges: false, showGifts: false },
      },
      $unset: {
        username: 1,
        avatarUrl: 1,
        googleId: 1,
        discordId: 1,
        passwordHash: 1,
        resetTokenHash: 1,
        resetTokenExpires: 1,
      },
      $inc: { sessionVersion: 1 },
    }
  );
  if (result.modifiedCount > 0) {
    // A deleted account follows nobody and is nobody's friend
    await Promise.all([
      Follow.deleteMany({ $or: [{ follower: userId }, { following: userId }] }),
      Presence.deleteMany({ user: userId }),
    ]);
    // Chat logs keep their messages (moderators may need them) but no longer show in rooms
    await ChatMessage.updateMany({ user: userId, hiddenAt: null }, { $set: { hiddenAt: new Date() } });
  }
  return result.modifiedCount > 0;
}

module.exports = { withdrawApplications, anonymiseUser };
