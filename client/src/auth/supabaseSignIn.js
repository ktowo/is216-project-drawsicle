// Signing in through Supabase Auth when the server says so (AUTH_PROVIDER=supabase).
// Supabase proves who someone is; the server then gives them the app's own session in exchange for
// the Supabase access token (POST /api/auth/supabase, docs/adr/0001). With the app's own sign-in
// (and in demo mode) none of this runs, and supabase-js is never even downloaded.
import { api, ApiError } from '@/api';
import { signInMessage, callbackUrl } from '@/utils/supabaseAuth';

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
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
    });
  })();
  return clientPromise;
}

function fail(error) {
  throw new ApiError(signInMessage(error), error?.status || 400, error?.code || 'SUPABASE_AUTH');
}

// The app's session for this Supabase sign-in -> { user, reactivated }
export async function exchangeForSession(accessToken, { remember } = {}) {
  return api('/auth/supabase', { method: 'POST', body: { accessToken, remember } });
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

// Ends the Supabase session too (the app's own session is ended by the server)
export async function signOutOfSupabase() {
  if (!(await usingSupabase())) return;
  try {
    await (await supabase()).auth.signOut();
  } catch {
    // Already signed out, or Supabase unreachable: the app session is what matters
  }
}
