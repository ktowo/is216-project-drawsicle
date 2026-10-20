// Which sign-in the app uses (docs/specs/supabase-auth-email.md, docs/adr/0001):
//   local     the app's own email + password, Google and Discord sign-in (default; tests, offline)
//   supabase  Supabase Auth proves who someone is; the app still issues its own session
const PROVIDERS = ['local', 'supabase'];

function authProvider(env = process.env) {
  const value = String(env.AUTH_PROVIDER || '').trim().toLowerCase() || 'local';
  if (!PROVIDERS.includes(value)) {
    throw new Error(`AUTH_PROVIDER must be "local" or "supabase" (got "${env.AUTH_PROVIDER}").`);
  }
  return value;
}

module.exports = { authProvider, AUTH_PROVIDERS: PROVIDERS };
