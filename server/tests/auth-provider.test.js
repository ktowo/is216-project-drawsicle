// Which sign-in the app uses (AUTH_PROVIDER): today's own sign-in, or Supabase Auth
// (docs/specs/supabase-auth-email.md, ADR 0001).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { authProvider } = require('../utils/auth-provider.js');

test('uses the app\'s own sign-in unless told otherwise', () => {
  assert.equal(authProvider({}), 'local');
  assert.equal(authProvider({ AUTH_PROVIDER: '' }), 'local');
});

test('accepts supabase and local, ignoring case and spaces', () => {
  assert.equal(authProvider({ AUTH_PROVIDER: 'supabase' }), 'supabase');
  assert.equal(authProvider({ AUTH_PROVIDER: ' Supabase ' }), 'supabase');
  assert.equal(authProvider({ AUTH_PROVIDER: 'LOCAL' }), 'local');
});

test('refuses anything else with a message that says what is allowed', () => {
  assert.throws(() => authProvider({ AUTH_PROVIDER: 'firebase' }), /AUTH_PROVIDER.*local.*supabase/);
});
