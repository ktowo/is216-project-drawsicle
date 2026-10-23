// Signing in through Supabase Auth when the server says so (AUTH_PROVIDER=supabase).
// Supabase proves who someone is; the server then gives them the app's own session in exchange for
// the Supabase access token (POST /api/auth/supabase, docs/adr/0001). With the app's own sign-in
// (and in demo mode) none of this runs, and supabase-js is never even downloaded.
import { api, ApiError } from '@/api';
import { signInMessage, callbackUrl, linkProblem } from '@/utils/supabaseAuth';

let configPromise = null;
let clientPromise = null;

// { provider: 'local' | 'supabase', google, discord, supabaseUrl?, supabaseAnonKey? }
export function authConfig() {
  configPromise ??= api('/auth/providers')
    .then((c) => ({ ...c, provider: c.provider === 'supabase' ? 'supabase' : 'local' }))
    .catch((err) => {
      configPromise = null;
      throw err;
    });
  return configPromise;
}

export async function usingSupabase() {
  try {
    return (await authConfig()).provider === 'supabase';
  } catch {
    return false;
  }
}

async function supabase() {
  clientPromise ??= (async () => {
    const config = await authConfig();
    if (!config.supabaseUrl || !config.supabaseAnonKey) throw new ApiError("Supabase sign-in isn't set up on the server yet.", 503);
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(config.supabaseUrl, config.supabaseAnonKey, {
      // PKCE: the redirect brings back a one-time code, swapped for a session on /auth/callback
      // The Supabase session is kept (and refreshed) so the account page can link more sign-ins
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  })();
  return clientPromise;
}

function fail(error) {
  throw new ApiError(signInMessage(error), error?.status || 400, error?.code || 'SUPABASE_AUTH');
}

// The app's session for this Supabase sign-in -> { user, reactivated }
// passwordReset: just changed the password, so the server logs out the account's other devices
export async function exchangeForSession(accessToken, { remember, passwordReset } = {}) {
  return api('/auth/supabase', { method: 'POST', body: { accessToken, remember, passwordReset } });
}

export async function signInWithPassword(email, password) {
  const { data, error } = await (await supabase()).auth.signInWithPassword({ email, password });
  if (error) fail(error);
  return data.session.access_token;
}

// -> the access token, or null when Supabase wants the email confirmed first
export async function signUpWithPassword(email, password, displayName) {
  const { data, error } = await (await supabase()).auth.signUp({
    email,
    password,
    options: {
      data: displayName ? { full_name: displayName } : {},
      emailRedirectTo: callbackUrl(window.location.origin, import.meta.env.BASE_URL, ''),
    },
  });
  if (error) fail(error);
  return data.session?.access_token || null;
}

// Leaves the page for Google or Discord; they come back to /auth/callback
export async function startProviderSignIn(provider, redirect = '') {
  const { error } = await (await supabase()).auth.signInWithOAuth({
    provider,
    options: { redirectTo: callbackUrl(window.location.origin, import.meta.env.BASE_URL, redirect) },
  });
  if (error) fail(error);
}

// On /auth/callback: the one-time code from the redirect -> the access token
export async function finishRedirect(code) {
  const { data, error } = await (await supabase()).auth.exchangeCodeForSession(code);
  if (error) fail(error);
  return data.session.access_token;
}

// ---------- Email links: confirming an address, resetting a password ----------
// The Supabase email templates link with a one-time token_hash (not the PKCE code), so a link works
// in any browser, e.g. requested on a laptop and opened on a phone (docs/SUPABASE.md).

export async function sendPasswordReset(email) {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  const { error } = await (await supabase()).auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}${base}reset-password`,
  });
  // Rate limits are worth saying; anything else stays quiet so nobody learns who has an account
  if (error && /rate/i.test(error.code || error.message || '')) fail(error);
}

// -> { accessToken, email } for a confirmation or reset link, or throws with code 'expired' | 'used'
export async function verifyEmailLink(tokenHash, type) {
  const { data, error } = await (await supabase()).auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data.session) throw new ApiError(signInMessage(error), 400, linkProblem(error));
  return { accessToken: data.session.access_token, email: data.user?.email || '' };
}

// After a reset link: the new password, then the token for the app session
export async function setNewPassword(password) {
  const client = await signedInClient();
  const { error } = await client.auth.updateUser({ password });
  if (error) fail(error);
  const { data } = await client.auth.getSession();
  return data.session.access_token;
}

export async function resendConfirmation(email) {
  const { error } = await (await supabase()).auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: callbackUrl(window.location.origin, import.meta.env.BASE_URL, '') },
  });
  if (error) fail(error);
}

// ---------- Linked sign-ins (account page) ----------

async function signedInClient() {
  const client = await supabase();
  const { data } = await client.auth.getSession();
  if (!data.session) throw new ApiError('Please log out and in again to change your sign-in methods.', 401, 'SUPABASE_SESSION_EXPIRED');
  return client;
}

// -> the Supabase identities of whoever is signed in ([{ provider, identity_id, ... }])
export async function linkedIdentities() {
  const { data, error } = await (await signedInClient()).auth.getUserIdentities();
  if (error) fail(error);
  return data.identities || [];
}

// Leaves the page for Google or Discord, comes back to /auth/callback and on to `redirect`
export async function linkProvider(provider, redirect = '/account') {
  const { error } = await (await signedInClient()).auth.linkIdentity({
    provider,
    options: { redirectTo: callbackUrl(window.location.origin, import.meta.env.BASE_URL, redirect) },
  });
  if (error) fail(error);
}

export async function unlinkIdentity(identity) {
  const { error } = await (await signedInClient()).auth.unlinkIdentity(identity);
  if (error) fail(error);
}

// Ends the Supabase session too (the app's own session is ended by the server)
export async function signOutOfSupabase() {
  if (!(await usingSupabase())) return;
  try {
    await (await supabase()).auth.signOut();
  } catch {
    // Already signed out, or Supabase unreachable: the app session is what matters
  }
}
