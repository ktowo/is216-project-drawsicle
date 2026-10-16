// Badges on public profiles (server/routes/user-router.js and the demo copy in client/src/mock).
// Only ever things to be proud of: nothing shows for what someone hasn't done, and tiers replace
// each other so a profile never reads like a scorecard.
//
// Everything is worked out from finished public exchanges, so a badge can't give away a secret
// match or a private event.

export const BADGES = [
  { key: 'first_exchange', icon: 'gift', label: 'First exchange', description: 'Made a gift in a finished exchange' },
  { key: 'exchanges_5', icon: 'sparkles', label: '5 exchanges', description: 'Made gifts in 5 finished exchanges' },
  { key: 'exchanges_10', icon: 'trophy', label: '10 exchanges', description: 'Made gifts in 10 finished exchanges' },
  { key: 'on_time', icon: 'clock', label: 'Always on time', description: 'Every one of 3 or more gifts arrived before the deadline' },
  { key: 'backup_hero', icon: 'lifebuoy', label: 'Backup hero', description: 'Stepped in to make a gift when another artist couldn’t' },
  { key: 'much_loved', icon: 'heart', label: 'Much loved', description: 'Got thank-you notes for 3 or more gifts' },
  { key: 'versatile', icon: 'palette', label: 'Versatile', description: 'Made more than one kind of gift (art, writing, adoptables)' },
  { key: 'organiser', icon: 'flag', label: 'Organiser', description: 'Ran an exchange all the way to the reveal' },
  { key: 'community_pillar', icon: 'crown', label: 'Community pillar', description: 'Ran 3 or more exchanges to the reveal' },
];

// eventsRun: finished public events they organised
// gifts: gifts they made in finished public events, or null when they hide their exchanges:
//   [{ event: id, late: bool, type: 'art' | ..., thanked: bool, asBackup: bool }]
export function earnedBadges({ eventsRun = 0, gifts = null } = {}) {
  const keys = new Set();
  if (gifts && gifts.length) {
    const exchanges = new Set(gifts.map((g) => String(g.event))).size;
    if (exchanges >= 10) keys.add('exchanges_10');
    else if (exchanges >= 5) keys.add('exchanges_5');
    else keys.add('first_exchange');
    if (gifts.length >= 3 && gifts.every((g) => !g.late)) keys.add('on_time');
    if (gifts.some((g) => g.asBackup)) keys.add('backup_hero');
    if (gifts.filter((g) => g.thanked).length >= 3) keys.add('much_loved');
    if (new Set(gifts.map((g) => g.type)).size >= 2) keys.add('versatile');
  }
  if (eventsRun >= 3) keys.add('community_pillar');
  else if (eventsRun >= 1) keys.add('organiser');
  return BADGES.filter((b) => keys.has(b.key)).map(({ key, icon, label, description }) => ({ key, icon, label, description }));
}
