// Testing aid until the final presentation: the login page lists every demo account.
// To remove it: delete this file and components/TestLogins.vue, and their lines in LoginView.vue.
// To switch it off without touching code, build with VITE_TEST_LOGINS=false.
export const TEST_LOGINS_ENABLED = import.meta.env.VITE_TEST_LOGINS !== 'false';

const ROLE_NOTES = { admin: 'site admin', moderator: 'moderator' };

// The demo accounts, grouped for the dropdown. Loaded on demand so the demo data stays out of
// the main bundle.
export async function loadTestAccounts() {
  const { buildDemoData, DEMO_PASSWORD } = await import('@shared/demo-data.mjs');
  const data = buildDemoData();

  const organises = new Map();
  for (const event of data.events) {
    for (const key of event.organizers?.length ? event.organizers : [event.createdBy]) {
      organises.set(key, (organises.get(key) || 0) + 1);
    }
  }

  const accounts = data.users.map((u) => {
    const count = organises.get(u.key) || 0;
    const note = ROLE_NOTES[u.role] || (count ? `organises ${count} event${count === 1 ? '' : 's'}` : 'artist');
    return { email: u.email, name: u.displayName, role: u.role, organises: count, note, community: Boolean(u.community) };
  });
  // Site admin first, then moderators
  const staff = accounts.filter((a) => ROLE_NOTES[a.role]).sort((a, b) => (b.role === 'admin') - (a.role === 'admin'));
  const organisers = accounts
    .filter((a) => !ROLE_NOTES[a.role] && a.organises)
    .sort((a, b) => b.organises - a.organises);
  const artists = accounts.filter((a) => !ROLE_NOTES[a.role] && !a.organises && !a.community);
  // The OC Secret Santa crowd is 192 accounts: a few of them is plenty for trying things out
  const crowd = accounts.filter((a) => a.community);
  const crowdSample = crowd.slice(0, 6).map((a) => ({ ...a, note: 'OC Secret Santa sign-up' }));

  return {
    password: DEMO_PASSWORD,
    groups: [
      { label: 'Site staff', accounts: staff },
      { label: 'Organisers', accounts: organisers },
      { label: 'Artists', accounts: artists },
      { label: `OC Secret Santa sign-ups (6 of ${crowd.length})`, accounts: crowdSample },
    ].filter((g) => g.accounts.length),
  };
}
