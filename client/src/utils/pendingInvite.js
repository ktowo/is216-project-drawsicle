// New accounts need an invite code. Google sign-in leaves the site and comes back, so a code typed on
// the sign-up page is kept in this tab's sessionStorage for the round trip and handed to the
// exchange on /auth/callback (once). Storage that's blocked just means the callback asks again.
const KEY = 'drawsicle-pending-invite';
const tabStorage = () => (typeof sessionStorage === 'undefined' ? null : sessionStorage);

export function keepInvite(code, storage = tabStorage()) {
  const clean = typeof code === 'string' ? code.trim().toUpperCase() : '';
  try {
    if (clean) storage?.setItem(KEY, clean);
    else storage?.removeItem(KEY);
  } catch {
    // Private mode or blocked storage: the callback page will ask for the code
  }
}

export function takeInvite(storage = tabStorage()) {
  try {
    const code = storage?.getItem(KEY) || '';
    storage?.removeItem(KEY);
    return code;
  } catch {
    return '';
  }
}

// The exchange refused a new account because of its invite code (missing, wrong or full)
export function isInviteProblem(error) {
  return ['INVITE_REQUIRED', 'INVITE_INVALID', 'INVITE_FULL'].includes(error?.code);
}
