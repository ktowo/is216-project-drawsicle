// Bringing existing accounts into Supabase Auth (pnpm supabase:import-users). A fake admin client
// stands in for Supabase and records what it was asked to create.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers.js');
const User = require('../models/User.js');
const { importUsers } = require('../scripts/supabase-import-users.js');

before(h.startTestDb);
after(h.stopTestDb);
beforeEach(h.clearDb);

function fakeAdmin({ existing = [] } = {}) {
  const created = [];
  let next = 1;
  return {
    created,
    async createUser(params) {
      if (existing.includes(params.email)) return { error: { code: 'email_exists', message: 'already registered' } };
      created.push(params);
      return { id: `sb-${next++}` };
    },
  };
}

const quiet = { log() {} };

test('creates a Supabase user per account, with the same email, password and name, and saves the link', async () => {
  const withPassword = await User.create({ email: 'mika@example.com', displayName: 'Mika', username: 'mika', passwordHash: '$2b$12$abcdefghijklmnopqrstuv' });
  const googleOnly = await User.create({ email: 'sol@example.com', displayName: 'Sol', username: 'sol', googleId: 'g-1' });
  const admin = fakeAdmin();

  const counts = await importUsers({ admin, out: quiet });
  assert.deepEqual(counts, { created: 2, skipped: 0, alreadyInSupabase: 0, failed: 0 });

  const mika = admin.created.find((p) => p.email === 'mika@example.com');
  assert.equal(mika.password_hash, '$2b$12$abcdefghijklmnopqrstuv');
  assert.equal(mika.email_confirm, true);
  assert.equal(mika.user_metadata.full_name, 'Mika');
  const sol = admin.created.find((p) => p.email === 'sol@example.com');
  assert.equal(sol.password_hash, undefined); // Google-only: no password to bring

  assert.equal((await User.findById(withPassword._id)).supabaseId, 'sb-1');
  assert.ok((await User.findById(googleOnly._id)).supabaseId);
});

test('is safe to run again: linked accounts are skipped, deleted and banned ones are left out', async () => {
  await User.create({ email: 'done@example.com', displayName: 'Done', username: 'done', supabaseId: 'sb-old' });
  await User.create({ email: 'deleted-1@deleted.invalid', displayName: 'Deleted user', status: 'deactivated' });
  await User.create({ email: 'banned@example.com', displayName: 'Banned', username: 'banned', status: 'banned' });
  const admin = fakeAdmin();

  const counts = await importUsers({ admin, out: quiet });
  assert.equal(counts.created, 1); // the banned account still gets an identity, so a ban can't be dodged by re-signing up
  assert.equal(counts.skipped, 1);
  assert.deepEqual(admin.created.map((p) => p.email), ['banned@example.com']);
});

test('an email already in Supabase is reported, not duplicated; other errors count as failures', async () => {
  await User.create({ email: 'there@example.com', displayName: 'There', username: 'there' });
  await User.create({ email: 'boom@example.com', displayName: 'Boom', username: 'boom' });
  const admin = fakeAdmin({ existing: ['there@example.com'] });
  const realCreate = admin.createUser;
  admin.createUser = async (p) => (p.email === 'boom@example.com' ? { error: { code: 'unexpected', message: 'server error' } } : realCreate(p));

  const counts = await importUsers({ admin, out: quiet });
  assert.deepEqual(counts, { created: 0, skipped: 0, alreadyInSupabase: 1, failed: 1 });
  assert.equal((await User.findOne({ email: 'there@example.com' })).supabaseId, undefined);
});

test('never prints password hashes', async () => {
  await User.create({ email: 'mika@example.com', displayName: 'Mika', username: 'mika', passwordHash: '$2b$12$SECRETSECRETSECRETSECRE' });
  const lines = [];
  await importUsers({ admin: fakeAdmin(), out: { log: (...a) => lines.push(a.join(' ')) } });
  assert.ok(lines.length > 0);
  assert.doesNotMatch(lines.join('\n'), /SECRETSECRET/);
});
