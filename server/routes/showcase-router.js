const { Router } = require('express');
const User = require('../models/User.js');
const { userMini } = User;
const Event = require('../models/Event.js');
const Application = require('../models/Application.js');
const Submission = require('../models/Submission.js');
const Character = require('../models/Character.js');
const { optionalAuth } = require('../middleware/auth.js');
const { asyncHandler, apiErrorHandler } = require('../utils/helpers.js');
const { buildCommunities, buildFeed, GIFTS_MAX } = require('../../shared/showcase.mjs');

// The landing page showcase: GET /api/showcase → { stats, communities, feed, gifts }.
// Only public, non-draft, non-cancelled, non-disabled exchanges count, and gifts follow the same
// two-person consent as profile galleries.
const router = Router();

const SHOWN = { publicity: 'public', status: { $nin: ['draft', 'cancelled'] }, disabledAt: null };

// What the landing page shows of a gift: never the private note to the recipient or organiser checks
function giftItem(s, characterName) {
  const { id, title, type, images, thumbnails, imageDescriptions, contentWarnings, submittedAt, thanks } = s.toPublic();
  return {
    submission: { id, title, type, images, thumbnails, imageDescriptions, contentWarnings, submittedAt },
    event: { id: s.event._id.toString(), name: s.event.name },
    giver: { ...userMini(s.giver), cardColor: s.giver.toPublic().artistTags.cardColor },
    recipient: userMini(s.recipient),
    characterName,
    thanks: thanks ? { message: thanks.message, reaction: thanks.reaction } : null,
  };
}

// The recipient's character, when they offered exactly one in that exchange
async function characterNames(gifts) {
  const apps = await Application.find({
    $or: gifts.map((s) => ({ event: s.event._id, user: s.recipient._id })),
  }).select('event user offeredCharacters');
  const single = new Map();
  for (const a of apps) {
    if (a.offeredCharacters.length === 1) single.set(`${a.event}:${a.user}`, a.offeredCharacters[0]);
  }
  const chars = await Character.find({ _id: { $in: [...single.values()] } }).select('name');
  const nameOf = new Map(chars.map((c) => [c._id.toString(), c.name]));
  return gifts.map((s) => nameOf.get(String(single.get(`${s.event._id}:${s.recipient._id}`))) || '');
}

router.get('/', optionalAuth, asyncHandler(async (req, res) => {
  const events = await Event.find(SHOWN).select(
    'name status platform platformName signupDeadline submissionDeadline completedAt maxParticipants'
  );
  const ids = events.map((e) => e._id);
  const accepted = await Application.find({ event: { $in: ids }, status: 'accepted' }).select('event user');
  const artistsBy = new Map();
  for (const a of accepted) {
    const key = a.event.toString();
    if (!artistsBy.has(key)) artistsBy.set(key, []);
    artistsBy.get(key).push(a.user.toString());
  }
  const finished = events.filter((e) => e.status === 'completed').map((e) => e._id);

  const facts = events.map((e) => ({
    id: e._id.toString(),
    name: e.name,
    status: e.status,
    platform: e.platform,
    platformName: e.platformName,
    signupDeadline: e.signupDeadline,
    submissionDeadline: e.submissionDeadline,
    completedAt: e.completedAt,
    maxParticipants: e.maxParticipants,
    participants: (artistsBy.get(e._id.toString()) || []).length,
    artists: artistsBy.get(e._id.toString()) || [],
  }));

  const communities = buildCommunities(facts);
  const [giftsRevealed, agreed] = await Promise.all([
    Submission.countDocuments({ event: { $in: finished } }),
    User.distinct('_id', { status: 'active', 'profilePrivacy.showGifts': true }),
  ]);
  const consented = await Submission.find({ event: { $in: finished }, giver: { $in: agreed }, recipient: { $in: agreed } })
    .sort({ submittedAt: -1, _id: -1 })
    .limit(GIFTS_MAX)
    .populate('event', 'name')
    .populate('giver')
    .populate('recipient');
  const names = consented.length ? await characterNames(consented) : [];

  res.json({
    stats: {
      exchanges: events.length,
      artists: new Set(accepted.map((a) => a.user.toString())).size,
      giftsRevealed,
      communities: new Set(facts.map((e) => e.platformName.trim().toLowerCase()).filter(Boolean)).size,
    },
    communities,
    feed: buildFeed(facts),
    gifts: consented.map((s, i) => giftItem(s, names[i])),
  });
}));

router.use(apiErrorHandler);

module.exports = router;
