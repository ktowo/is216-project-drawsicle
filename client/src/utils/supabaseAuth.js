// Small pure helpers for signing in through Supabase (docs/specs/supabase-auth-email.md).

const MESSAGES = {
  invalid_credentials: 'Wrong email or password.',
  email_not_confirmed: 'Please confirm your email first: we sent you a link when you signed up.',
  user_already_exists: 'There is already an account with this email. Log in instead, or reset your password.',
  email_exists: 'There is already an account with this email. Log in instead, or reset your password.',
  weak_password: 'Password must be at least 8 characters.',
  over_request_rate_limit: 'Too many attempts. Try again in a few minutes.',
  over_email_send_rate_limit: 'Too many emails sent. Try again in a few minutes.',
};

// A Supabase auth error (or nothing) in the app's own words
export function signInMessage(error) {
  if (error?.code && MESSAGES[error.code]) return MESSAGES[error.code];
  if (/invalid login credentials/i.test(error?.message || '')) return MESSAGES.invalid_credentials;
  if (/email not confirmed/i.test(error?.message || '')) return MESSAGES.email_not_confirmed;
  return "We couldn't sign you in just now. Please try again.";
}

// Only paths on this site; anything else lands on the dashboard
export function safeRedirect(path) {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : '/dashboard';
}

// Where Supabase sends people back to after Google / Discord / an email link
export function callbackUrl(origin, base, redirect) {
  const url = `${origin}${base.endsWith('/') ? base : `${base}/`}auth/callback`;
  return redirect && safeRedirect(redirect) === redirect ? `${url}?redirect=${encodeURIComponent(redirect)}` : url;
}

// A reset or confirmation link Supabase refused, as the reset page's reasons: 'expired' or 'used'
export function linkProblem(error) {
  if (error?.code === 'otp_expired' || /expired/i.test(error?.message || '')) return 'expired';
  return 'used';
}

// The kinds of email link the app accepts (token_hash links in the Supabase email templates)
const LINK_TYPES = ['recovery', 'signup', 'email'];
export function emailLinkType(type) {
  return LINK_TYPES.includes(type) ? type : null;
}
