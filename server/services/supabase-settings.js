// Which sign-in methods the Supabase project has switched on (its public GET /auth/v1/settings),
// so the app only shows buttons that work. Remembered for a few minutes; if Supabase can't be
// reached, SUPABASE_OAUTH_PROVIDERS (default "google,discord") is used instead.
// Tests swap the fetch with setSettingsFetcher().
const CACHE_MS = 5 * 60 * 1000;

async function fetchSettings() {
  const base = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (process.env.SUPABASE_ANON_KEY || '').trim();
  if (!base || !key) throw new Error('Supabase is not configured.');
  const res = await fetch(`${base}/auth/v1/settings`, { headers: { apikey: key }, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Supabase settings answered HTTP ${res.status}.`);
  return res.json();
}

let fetcher = fetchSettings;
let cached = null; // { at, value }

function fromSetting() {
  const list = (process.env.SUPABASE_OAUTH_PROVIDERS ?? 'google,discord').split(',').map((p) => p.trim().toLowerCase());
  return { google: list.includes('google'), discord: list.includes('discord') };
}

// -> { google, discord }
async function oauthProviders(now = Date.now()) {
  if (cached && now - cached.at < CACHE_MS) return cached.value;
  let value;
  try {
    const external = (await fetcher())?.external || {};
    value = { google: Boolean(external.google), discord: Boolean(external.discord) };
  } catch (err) {
    console.warn(`Couldn't read Supabase's sign-in settings (${err.message}); using SUPABASE_OAUTH_PROVIDERS.`);
    return fromSetting();
  }
  cached = { at: now, value };
  return value;
}

// Tests only: replace the fetch (pass nothing to restore the real one) and forget the cache
function setSettingsFetcher(fn) {
  fetcher = fn || fetchSettings;
  cached = null;
}

module.exports = { oauthProviders, setSettingsFetcher };
