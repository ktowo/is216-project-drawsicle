const Follow = require('../models/Follow.js');
const Presence = require('../models/Presence.js');
const User = require('../models/User.js');

const { userMini } = User;

// How viewer and other relate: { following, followsYou, friends }
async function relation(viewerId, otherId) {
  if (!viewerId || !otherId || String(viewerId) === String(otherId)) return null;
  const [following, followsYou] = await Promise.all([
    Follow.exists({ follower: viewerId, following: otherId }),
    Follow.exists({ follower: otherId, following: viewerId }),
  ]);
  return { following: Boolean(following), followsYou: Boolean(followsYou), friends: Boolean(following && followsYou) };
}

async function followCounts(userId) {
  const [followers, following] = await Promise.all([
    Follow.countDocuments({ following: userId }),
    Follow.countDocuments({ follower: userId }),
  ]);
  return { followers, following };
}

// Where each of these people is in the museum, if they're there now: Map(id -> { label, link })
async function whereabouts(userIds) {
  const since = new Date(Date.now() - Presence.FRESH_MS);
  const rows = await Presence.find({ user: { $in: userIds }, updatedAt: { $gte: since } }).select('user label link');
  return new Map(rows.map((r) => [r.user.toString(), { label: r.label, link: r.link }]));
}

// The friend list: friends (both follow), followers you haven't followed back, and people you
// follow who haven't followed back. Only active accounts.
async function friendList(userId) {
  const [outgoing, incoming] = await Promise.all([
    Follow.find({ follower: userId }).populate('following', 'displayName username avatarUrl status'),
    Follow.find({ following: userId }).populate('follower', 'displayName username avatarUrl status'),
  ]);
  const active = (u) => u && (u.status || 'active') === 'active';
  const out = new Map(outgoing.filter((f) => active(f.following)).map((f) => [f.following._id.toString(), f]));
  const inc = new Map(incoming.filter((f) => active(f.follower)).map((f) => [f.follower._id.toString(), f]));
  const where = await whereabouts([...new Set([...out.keys(), ...inc.keys()])]);
  const entry = (user, since) => ({ user: userMini(user), since, online: where.get(user._id.toString()) || null });
  const byName = (a, b) =>
    Number(Boolean(b.online)) - Number(Boolean(a.online)) || a.user.displayName.localeCompare(b.user.displayName);

  const friends = [];
  const following = [];
  for (const [id, f] of out) {
    if (inc.has(id)) friends.push(entry(f.following, f.createdAt > inc.get(id).createdAt ? f.createdAt : inc.get(id).createdAt));
    else following.push(entry(f.following, f.createdAt));
  }
  const followers = [...inc].filter(([id]) => !out.has(id)).map(([, f]) => entry(f.follower, f.createdAt));
  return { friends: friends.sort(byName), followers: followers.sort(byName), following: following.sort(byName) };
}

module.exports = { relation, followCounts, friendList, whereabouts };
