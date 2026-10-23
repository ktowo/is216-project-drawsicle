// Who a Supabase access token belongs to (docs/adr/0001). Asks Supabase itself (GET /auth/v1/user),
// so the token's signature, expiry and project are all checked by Supabase and no signing secret is
// needed here. Tests swap the check for a fake with setIdentityVerifier().
//
//   const identity = await verifyIdentity(accessToken);
//   // null when the token isn't valid, otherwise:
//   // { id, email, emailVerified, name, avatarUrl }

async function askSupabase(accessToken) {
  const base = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  // The public (anon) key is enough for this call; the service role key works too
  const apiKey = (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!base || !apiKey) throw new Error('Supabase sign-in needs SUPABASE_URL and SUPABASE_ANON_KEY.');

  const res = await fetch(`${base}/auth/v1/user`, {
    headers: { apikey: apiKey, Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`Supabase couldn't check the sign-in (HTTP ${res.status}).`);

  const user = await res.json();
  const meta = user.user_metadata || {};
  return {
    id: user.id,
    email: typeof user.email === 'string' ? user.email.trim().toLowerCase() : '',
    emailVerified: Boolean(user.email_confirmed_at),
    name: meta.full_name || meta.name || meta.user_name || '',
    avatarUrl: meta.avatar_url || meta.picture || '',
    inviteCode: meta.invite_code || '',
  };
}

let verifier = askSupabase;

async function verifyIdentity(accessToken) {
  if (typeof accessToken !== 'string' || !accessToken.trim()) return null;
  return verifier(accessToken.trim());
}

// Tests only: replace the check (pass nothing to restore the real one)
function setIdentityVerifier(fn) {
  verifier = fn || askSupabase;
}

module.exports = { verifyIdentity, setIdentityVerifier };
