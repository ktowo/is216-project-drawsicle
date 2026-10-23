// The "Ways to sign in" rows on the account page, from the identities Supabase holds for someone
// (AUTH_PROVIDER=supabase). A way can be disconnected only while another one remains.
//   identities: Supabase identities ([{ provider: 'email' | 'google' | 'discord', ... }])
//   offered:    { google, discord } switched on for sign-in
// -> [{ key, label, connected, status, canConnect, canDisconnect, identity }]
const PROVIDERS = [
  ['google', 'Google'],
  ['discord', 'Discord'],
];

export function signInMethods(identities = [], offered = {}) {
  const byProvider = new Map(identities.map((i) => [i.provider, i]));
  const total = byProvider.size;
  const password = byProvider.get('email');
  const rows = [
    {
      key: 'password',
      label: 'Email and password',
      connected: Boolean(password),
      status: password ? 'Set up' : 'No password yet',
      canConnect: false,
      canDisconnect: Boolean(password) && total > 1,
      identity: password || null,
    },
  ];
  for (const [key, label] of PROVIDERS) {
    const identity = byProvider.get(key);
    if (!identity && !offered[key]) continue;
    rows.push({
      key,
      label,
      connected: Boolean(identity),
      status: identity ? 'Connected' : 'Not connected',
      canConnect: !identity && Boolean(offered[key]),
      canDisconnect: Boolean(identity) && total > 1,
      identity: identity || null,
    });
  }
  return rows;
}
