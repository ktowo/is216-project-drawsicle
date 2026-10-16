// Public artist facts shared by profiles (routes/user-router.js), Discover and hover cards
// (routes/discover-router.js): who has a public profile, which gifts may be shown, badges,
// and the compact "artist card".
const mongoose = require('mongoose');
const User = require('../models/User.js');
const Event = require('../models/Event.js');
const EventMember = require('../models/EventMember.js');
const Application = require('../models/Application.js');
const Submission = require('../models/Submission.js');
const Match = require('../models/Match.js');
const Follow = require('../models/Follow.js');
const { earnedBadges } = require('../../shared/badges.mjs');
const { httpError } = require('../utils/helpers.js');

// Exchanges and gifts only ever come from finished public events
const FINISHED = { publicity: 'public', status: 'completed', disabledAt: null };

const notFound = () => httpError(404, "We couldn't find that artist.", 'USER_NOT_FOUND');

// By username (any case); an id works too, for links made before someone picked a username
async function findProfileUser(handle) {
  const value = String(handle || '').trim().toLowerCase().replace(/^@/, '');
  let user = null;
  if (User.USERNAME_RE.test(value)) user = await User.findOne({ username: value });
  if (!user && mongoose.isObjectIdOrHexString(value)) user = await User.findById(value);
  return user;
}

// Deactivated and banned accounts have no public profile
async function visibleProfileUser(handle) {
  const user = await findProfileUser(handle);
  if (!user || (user.status || 'active') !== 'active') throw notFound();
  return user;
}

// Gifts this artist made that both they and the recipient agreed to show publicly,
// from finished public events. null when the artist doesn't show gifts at all.
async function publicGiftsFilter(user) {
  if (!user.profilePrivacy?.showGifts) return null;
  const [eventIds, recipientIds] = await Promise.all([
    Submission.distinct('event', { giver: user._id }),
    Submission.distinct('recipient', { giver: user._id }),
  ]);
  const [finished, agreed] = await Promise.all([
    Event.distinct('_id', { _id: { $in: eventIds }, ...FINISHED }),
    User.distinct('_id', { _id: { $in: recipientIds }, status: 'active', 'profilePrivacy.showGifts': true }),
  ]);
  return { giver: user._id, event: { $in: finished }, recipient: { $in: agreed } };
}

// Gifts they made in finished public events, as the facts shared/badges.mjs needs
async function badgeGifts(user) {
  const subs = await Submission.find({ giver: user._id })
    .select('event match late type thanks')
    .populate('event', 'status publicity disabledAt');
  const done = subs.filter(
    (s) => s.event && s.event.status === 'completed' && s.event.publicity === 'public' && !s.event.disabledAt
  );
  const matches = await Match.find({ _id: { $in: done.map((s) => s.match) } }).select('giver');
  const giverOf = new Map(matches.map((m) => [m._id.toString(), m.giver.toString()]));
  return done.map((s) => ({
    event: s.event._id.toString(),
    late: Boolean(s.late),
    type: s.type,
    thanked: Boolean(s.thanks?.at),
    asBackup: giverOf.get(s.match.toString()) !== user._id.toString(),
  }));
}


// Badges for a public profile or card. Hidden exchanges stay hidden: no badges that hint at them.
async function profileBadges(user) {
  const organizedIds = await EventMember.distinct('event', { user: user._id, roles: 'organizer' });
  const showExchanges = user.profilePrivacy?.showExchanges !== false;
  const [eventsRun, gifts] = await Promise.all([
    Event.countDocuments({ _id: { $in: organizedIds }, ...FINISHED }),
    showExchanges ? badgeGifts(user) : null,
  ]);
  return earnedBadges({ eventsRun, gifts });
}

const CARD_GIFTS = 3;

// The compact card used by Discover and hover cards. viewer may be null (logged out).
async function artistCard(user, viewer) {
  const showExchanges = user.profilePrivacy?.showExchanges !== false;
  const giftsFilter = await publicGiftsFilter(user);
  const [badges, joinedIds, gifts, following] = await Promise.all([
    profileBadges(user),
    showExchanges ? Application.distinct('event', { user: user._id, status: 'accepted' }) : [],
    giftsFilter
      ? Submission.find(giftsFilter).sort({ submittedAt: -1, _id: -1 }).limit(CARD_GIFTS)
      : [],
    viewer && !viewer._id.equals(user._id) ? Follow.exists({ follower: viewer._id, following: user._id }) : null,
  ]);
  const card = {
    user: user.toMini(),
    artistTags: user.toPublic().artistTags,
    badges,
    gifts: gifts.map((s) => {
      const { id, title, images, thumbnails, imageDescriptions, contentWarnings } = s.toPublic();
      return {
        id,
        title,
        image: thumbnails?.[0] || images[0] || null,
        alt: imageDescriptions?.[0] || '',
        contentWarnings: contentWarnings || [],
      };
    }),
  };
  if (showExchanges) {
    card.exchangesCompleted = await Event.countDocuments({ _id: { $in: joinedIds }, ...FINISHED });
  }
  if (viewer) card.following = Boolean(following);
  return card;
}

module.exports = {
  FINISHED,
  notFound,
  findProfileUser,
  visibleProfileUser,
  publicGiftsFilter,
  badgeGifts,
  profileBadges,
  artistCard,
};
