const { Router } = require('express');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const User = require('../models/User.js');
const { requireAuth } = require('../middleware/auth.js');
const { startSession, endSession } = require('../utils/session.js');
const { sendMail } = require('../services/mailer.js');
const { renderEmail } = require('../services/email-layout.js');
const { asyncHandler, apiErrorHandler, applyAdminList, clientUrl } = require('../utils/helpers.js');
const { authProvider } = require('../utils/auth-provider.js');
const { verifyIdentity } = require('../services/supabase-identity.js');

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_TTL_MS = 60 * 60 * 1000; // reset links last 1 hour
const DISPLAY_NAME_MAX = 60;
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
const normEmail = (e) => (typeof e === 'string' ? e.trim().toLowerCase() : '');
const isProd = () => process.env.NODE_ENV === 'production';
const localPart = (email) => email.split('@')[0].slice(0, DISPLAY_NAME_MAX);

// Slows down password guessing: 20 tries per 15 min per IP
const LIMITER_OPTIONS = {
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a few minutes.', code: 'RATE_LIMITED' },
  skip: () => process.env.NODE_ENV === 'test',
};
const authLimiter = rateLimit(LIMITER_OPTIONS);
// Logins only count the failed ones, so switching between accounts (the demo has eight) never locks anyone out
const loginLimiter = rateLimit({ ...LIMITER_OPTIONS, skipSuccessfulRequests: true });

function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 128) return 'Password is too long.';
  return null;
}

const isDuplicate = (err, field) => err?.code === 11000 && Boolean(err.keyPattern?.[field] || err.keyValue?.[field]);

// Saves a new account. Two sign-ups can pick the same free username at the same
// moment; the unique index catches that and we simply try the next one.
async function saveNewUser(user, nameBase) {
  for (let attempt = 0; ; attempt++) {
    user.username = await User.generateUsername(attempt ? `${nameBase}_${crypto.randomInt(100, 999)}` : nameBase);
    try {
      await user.save();
      return user;
    } catch (err) {
      if (!isDuplicate(err, 'username') || attempt >= 4) throw err;
    }
  }
}

// Banned accounts can't sign in by any method
function bannedBody(user) {
  const reason = user.banReason ? ` Reason: ${user.banReason}` : '';
  return { error: `This account has been suspended by the site admins.${reason}`, code: 'ACCOUNT_BANNED' };
}

// Logging back in within the grace period cancels a deactivation
function reactivate(user) {
  if (user.status !== 'deactivated') return false;
  user.status = 'active';
  user.deactivatedAt = null;
  return true;
}

// ---------- Email + password ----------

router.post('/register', authLimiter, asyncHandler(async (req, res) => {
  const email = normEmail(req.body.email);
  const { password } = req.body;

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Enter a valid email address.', code: 'VALIDATION' });
  }
  const pwError = passwordProblem(password);
  if (pwError) return res.status(400).json({ error: pwError, code: 'VALIDATION' });

  let displayName = '';
  if (req.body.displayName !== undefined && req.body.displayName !== null) {
    if (typeof req.body.displayName !== 'string') {
      return res.status(400).json({ error: 'Display name must be text.', code: 'VALIDATION' });
    }
    displayName = req.body.displayName.trim();
    if (displayName.length > DISPLAY_NAME_MAX) {
      return res
        .status(400)
        .json({ error: `Display name is too long (max ${DISPLAY_NAME_MAX}).`, code: 'VALIDATION' });
    }
  }
  displayName = displayName || localPart(email);

  const taken = () =>
    res
      .status(409)
      .json({ error: 'An account with this email already exists. Try logging in.', code: 'EMAIL_TAKEN' });

  if (await User.exists({ email })) return taken();

  const user = new User({
    email,
    passwordHash: await bcrypt.hash(password, 12),
    displayName,
  });
  applyAdminList(user);

  try {
    await saveNewUser(user, displayName);
  } catch (err) {
    if (isDuplicate(err, 'email')) return taken();
    throw err;
  }

  startSession(res, user);
  res.status(201).json({ user: user.toPublic() });
}));

router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const email = normEmail(req.body.email);
  const { password } = req.body;
  const wrong = () => res.status(401).json({ error: 'Wrong email or password.', code: 'WRONG_CREDENTIALS' });

  if (!email || typeof password !== 'string' || !password) return wrong();

  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user) return wrong();
  if (!user.passwordHash) {
    const via = [user.googleId && 'Google', user.discordId && 'Discord'].filter(Boolean).join(' or ') || 'Google or Discord';
    return res.status(400).json({
      error: `This account signs in with ${via}. Use that button, or reset your password to add one.`,
      code: 'USE_OAUTH',
    });
  }
  if (!(await bcrypt.compare(password, user.passwordHash))) return wrong();
  if (user.status === 'banned') return res.status(403).json(bannedBody(user));

  const reactivated = reactivate(user);
  applyAdminList(user);
  // Accounts from before usernames existed
  if (!user.username) user.username = await User.generateUsername(user.displayName || localPart(user.email));
  if (user.isModified()) await user.save();

  // "Remember me": true keeps them in for 30 days, false until the browser closes
  const remember = typeof req.body.remember === 'boolean' ? req.body.remember : undefined;
  startSession(res, user, { remember });
  res.json(reactivated ? { user: user.toPublic(), reactivated: true } : { user: user.toPublic() });
}));

router.post('/logout', (req, res) => {
  endSession(res);
  res.json({ ok: true });
});

// ---------- Supabase Auth (AUTH_PROVIDER=supabase) ----------
// The browser signs in with Supabase, then trades its access token here for the app's own session
// (docs/adr/0001). The account is the one linked to that Supabase user; otherwise the one with the
// same email, but only once Supabase has verified it; otherwise a new one.
router.post('/supabase', authLimiter, asyncHandler(async (req, res) => {
  if (authProvider() !== 'supabase') {
    return res.status(404).json({ error: 'Supabase sign-in is not switched on.', code: 'NOT_ENABLED' });
  }
  const identity = await verifyIdentity(req.body.accessToken);
  if (!identity?.id) {
    return res.status(401).json({ error: 'That sign-in has expired. Please sign in again.', code: 'INVALID_TOKEN' });
  }
  const email = normEmail(identity.email);

  let user = await User.findOne({ supabaseId: identity.id });
  let created = false;
  if (!user && email) {
    const sameEmail = await User.findOne({ email });
    if (sameEmail) {
      // Someone could sign up with your address; only a verified email may claim your account
      if (!identity.emailVerified) {
        return res.status(409).json({
          error: 'There is already an account with this email. Verify your email address first, then sign in again.',
          code: 'EMAIL_NOT_VERIFIED',
        });
      }
      if (sameEmail.supabaseId) {
        return res.status(409).json({
          error: 'This email belongs to an account that signs in another way. Use that, or link this one from your settings.',
          code: 'ACCOUNT_LINKED_ELSEWHERE',
        });
      }
      sameEmail.supabaseId = identity.id;
      user = sameEmail;
    }
  }

  if (!user) {
    if (!email) return res.status(400).json({ error: 'Your sign-in did not share an email address.', code: 'EMAIL_REQUIRED' });
    const displayName = (identity.name || localPart(email)).trim().slice(0, DISPLAY_NAME_MAX) || localPart(email);
    user = new User({ email, supabaseId: identity.id, displayName, avatarUrl: identity.avatarUrl || undefined });
    applyAdminList(user);
    try {
      await saveNewUser(user, displayName);
      created = true;
    } catch (err) {
      // Two sign-ins for the same new person at once: the other one won, so use it
      if (!isDuplicate(err, 'supabaseId') && !isDuplicate(err, 'email')) throw err;
      user = await User.findOne({ supabaseId: identity.id });
      if (!user) throw err;
    }
  }

  if (user.status === 'banned') return res.status(403).json(bannedBody(user));
  const reactivated = reactivate(user);
  applyAdminList(user);
  // Accounts from before usernames existed
  if (!user.username) user.username = await User.generateUsername(user.displayName || localPart(user.email));
  if (user.isModified()) await user.save();

  const remember = typeof req.body.remember === 'boolean' ? req.body.remember : undefined;
  startSession(res, user, { remember });
  const body = reactivated ? { user: user.toPublic(), reactivated: true } : { user: user.toPublic() };
  res.status(created ? 201 : 200).json(body);
}));

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toPublic() });
});

// Which "Continue with ..." buttons the login page should show
router.get('/providers', (req, res) => {
  if (authProvider() === 'supabase') {
    // Sign-in happens in the browser with Supabase: it needs the project's address and public key
    // (both meant to be public). SUPABASE_OAUTH_PROVIDERS lists the buttons switched on in Supabase.
    const oauth = (process.env.SUPABASE_OAUTH_PROVIDERS ?? 'google,discord').split(',').map((p) => p.trim().toLowerCase());
    return res.json({
      provider: 'supabase',
      google: oauth.includes('google'),
      discord: oauth.includes('discord'),
      supabaseUrl: (process.env.SUPABASE_URL || '').trim(),
      supabaseAnonKey: (process.env.SUPABASE_ANON_KEY || '').trim(),
    });
  }
  // The app's own sign-in (no "provider" field, as before: the browser reads that as local)
  res.json({
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    discord: Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET),
  });
});

// ---------- Password reset / change ----------

router.post('/forgot-password', authLimiter, asyncHandler(async (req, res) => {
  const email = normEmail(req.body.email);
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.', code: 'VALIDATION' });

  const user = await User.findOne({ email });
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    user.resetTokenHash = hashToken(token);
    user.resetTokenExpires = new Date(Date.now() + RESET_TTL_MS);
    await user.save();

    const link = `${clientUrl()}/reset-password?token=${token}`;
    const { html, text } = renderEmail({
      preheader: 'Your reset link works for 1 hour.',
      heading: 'Reset your Drawsicle password',
      paragraphs: ['Someone asked to reset your Drawsicle password. The link works for 1 hour.'],
      button: { label: 'Reset your password', url: link },
      footer: { text: "If this wasn't you, you can ignore this email: your password stays the same." },
    });
    await sendMail({ to: user.email, subject: 'Reset your Drawsicle password', text, html });
  }

  // Same answer either way, so nobody can use this to check who has an account
  res.json({ message: 'If an account exists for that email, a reset link is on its way.' });
}));

// Why a reset link can't be used, so the page can say so before anyone types a new password:
//   expired  the hour is up
//   used     already used, or replaced by a newer reset email (the old link stops working)
const RESET_LINK_PROBLEMS = {
  expired: 'This reset link has expired. Links work for 1 hour, so request a new one.',
  used: 'This reset link was already used, or a newer reset email replaced it. Request a new one if you still need it.',
};

function resetLinkError(res, reason) {
  return res.status(400).json({ error: RESET_LINK_PROBLEMS[reason], code: 'INVALID_TOKEN', reason });
}

// The account a reset link belongs to, or the reason it can't be used
async function userForResetToken(token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return { reason: 'used' };
  const user = await User.findOne({ resetTokenHash: hashToken(token) }).select('+resetTokenExpires');
  if (!user) return { reason: 'used' };
  if (!user.resetTokenExpires || user.resetTokenExpires <= new Date()) return { reason: 'expired' };
  return { user };
}

// "mika.draws@gmail.com" -> "mi•••@gmail.com", so people know which account they're resetting
// without the page giving the full address to whoever has the link
function maskEmail(email) {
  const [name, domain] = String(email).split('@');
  if (!domain) return '';
  return `${name.slice(0, Math.min(2, Math.max(1, name.length - 1)))}•••@${domain}`;
}

// Checked when the reset page opens. Doesn't use the link up.
router.get('/reset-password/check', authLimiter, asyncHandler(async (req, res) => {
  const { user, reason } = await userForResetToken(req.query.token);
  if (!user) return resetLinkError(res, reason);
  if (user.status === 'banned') return res.status(403).json(bannedBody(user));
  res.json({ ok: true, email: maskEmail(user.email), expiresAt: user.resetTokenExpires });
}));

router.post('/reset-password', authLimiter, asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return resetLinkError(res, 'used');
  const pwError = passwordProblem(password);
  if (pwError) return res.status(400).json({ error: pwError, code: 'VALIDATION' });

  const { user, reason } = await userForResetToken(token);
  if (!user) return resetLinkError(res, reason);
  if (user.status === 'banned') return res.status(403).json(bannedBody(user));

  user.passwordHash = await bcrypt.hash(password, 12);
  user.resetTokenHash = undefined;
  user.resetTokenExpires = undefined;
  user.sessionVersion = (user.sessionVersion || 0) + 1; // logs out every other device
  reactivate(user);
  await user.save();

  startSession(res, user);
  res.json({ user: user.toPublic() });
}));

// Change (or, for Google/Discord-only accounts, set) the password.
// Other devices are logged out; this one gets a fresh cookie.
router.post('/change-password', authLimiter, requireAuth, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+passwordHash');

  if (user.passwordHash) {
    const ok = typeof currentPassword === 'string' && (await bcrypt.compare(currentPassword, user.passwordHash));
    if (!ok) return res.status(401).json({ error: 'Your current password is not right.', code: 'WRONG_PASSWORD' });
  }

  const pwError = passwordProblem(newPassword);
  if (pwError) return res.status(400).json({ error: pwError, code: 'VALIDATION' });

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.resetTokenHash = undefined;
  user.resetTokenExpires = undefined;
  user.sessionVersion = (user.sessionVersion || 0) + 1;
  await user.save();

  startSession(res, user);
  res.json({ user: user.toPublic() });
}));

// ---------- Google / Discord sign-in ----------

const OAUTH_STATE_MAX_AGE = 10 * 60 * 1000;

function setStateCookie(res, name) {
  // Random state stops other sites from forging a login callback
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie(name, state, { httpOnly: true, sameSite: 'lax', secure: isProd(), maxAge: OAUTH_STATE_MAX_AGE });
  return state;
}

// Reads and clears the state cookie; true when the callback's state matches it
function checkState(req, res, name) {
  const expected = req.cookies?.[name];
  res.clearCookie(name, { httpOnly: true, sameSite: 'lax', secure: isProd() });
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  if (!expected || !state || state.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expected));
}

// Signs in the account that matches the provider profile, linking or creating one as needed.
//   profile: { idField: 'googleId', id, email, displayName, avatarUrl, socials }
async function signInWithProvider(res, profile) {
  // Same person might have signed up with email first, so link by (verified) email too
  let user = (await User.findOne({ [profile.idField]: profile.id })) || (await User.findOne({ email: profile.email }));
  let reactivated = false;

  if (!user) {
    const displayName = (profile.displayName || localPart(profile.email)).trim().slice(0, DISPLAY_NAME_MAX);
    user = new User({
      email: profile.email,
      [profile.idField]: profile.id,
      displayName: displayName || localPart(profile.email),
      avatarUrl: profile.avatarUrl || undefined,
      socials: profile.socials || {},
    });
    applyAdminList(user);
    try {
      await saveNewUser(user, user.displayName);
    } catch (err) {
      // Two callbacks for the same new account at once: the other one won, so use it
      if (!isDuplicate(err, 'email') && !isDuplicate(err, profile.idField)) throw err;
      user = await User.findOne({ [profile.idField]: profile.id });
      if (!user) throw err;
    }
  } else {
    if (!user[profile.idField]) user[profile.idField] = profile.id;
    if (!user.avatarUrl && profile.avatarUrl) user.avatarUrl = profile.avatarUrl;
    for (const [key, value] of Object.entries(profile.socials || {})) {
      if (value && !user.socials?.[key]) user.socials[key] = value;
    }
    // Accounts from before usernames existed
    if (!user.username) user.username = await User.generateUsername(user.displayName || localPart(user.email));
    if (user.status === 'banned') return res.redirect(`${clientUrl()}/login?error=account_banned`);
    reactivated = reactivate(user);
    applyAdminList(user);
    if (user.isModified()) await user.save();
  }

  startSession(res, user);
  res.redirect(`${clientUrl()}/dashboard${reactivated ? '?reactivated=1' : ''}`);
}

// Google

const googleRedirectUri = () =>
  process.env.GOOGLE_REDIRECT_URI || `${clientUrl()}/api/auth/google/callback`;
const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

router.get('/google', (req, res) => {
  if (!googleConfigured()) return res.redirect(`${clientUrl()}/login?error=google_not_configured`);

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state: setStateCookie(res, 'oauth_state'),
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/google/callback', asyncHandler(async (req, res) => {
  const fail = (reason) => res.redirect(`${clientUrl()}/login?error=${reason}`);
  const stateOk = checkState(req, res, 'oauth_state');

  if (!googleConfigured()) return fail('google_not_configured');
  if (req.query.error) return fail('google_cancelled');
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  if (!code || !stateOk) return fail('google_failed');

  let info;
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: googleRedirectUri(),
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) return fail('google_failed');
    const { access_token: accessToken } = await tokenRes.json();
    if (!accessToken) return fail('google_failed');

    const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!infoRes.ok) return fail('google_failed');
    info = await infoRes.json(); // { sub, email, email_verified, name, picture }
  } catch (err) {
    console.error('Google sign-in failed:', err.message);
    return fail('google_failed');
  }

  if (!info?.sub) return fail('google_failed');
  if (!info.email || info.email_verified !== true) return fail('google_unverified');

  await signInWithProvider(res, {
    idField: 'googleId',
    id: String(info.sub),
    email: normEmail(info.email),
    displayName: info.name,
    avatarUrl: typeof info.picture === 'string' && info.picture.startsWith('https://') ? info.picture : undefined,
  });
}));

// Discord

const discordRedirectUri = () =>
  process.env.DISCORD_REDIRECT_URI || `${clientUrl()}/api/auth/discord/callback`;
const discordConfigured = () => Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);

router.get('/discord', (req, res) => {
  if (!discordConfigured()) return res.redirect(`${clientUrl()}/login?error=discord_not_configured`);

  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: discordRedirectUri(),
    response_type: 'code',
    scope: 'identify email',
    state: setStateCookie(res, 'oauth_state_discord'),
    prompt: 'none',
  });
  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

router.get('/discord/callback', asyncHandler(async (req, res) => {
  const fail = (reason) => res.redirect(`${clientUrl()}/login?error=${reason}`);
  const stateOk = checkState(req, res, 'oauth_state_discord');

  if (!discordConfigured()) return fail('discord_not_configured');
  if (req.query.error) return fail('discord_cancelled');
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  if (!code || !stateOk) return fail('discord_failed');

  let info;
  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: discordRedirectUri(),
      }),
    });
    if (!tokenRes.ok) return fail('discord_failed');
    const { access_token: accessToken } = await tokenRes.json();
    if (!accessToken) return fail('discord_failed');

    const infoRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!infoRes.ok) return fail('discord_failed');
    info = await infoRes.json(); // { id, username, global_name, avatar, email, verified }
  } catch (err) {
    console.error('Discord sign-in failed:', err.message);
    return fail('discord_failed');
  }

  if (!info?.id) return fail('discord_failed');
  if (!info.email || info.verified !== true) return fail('discord_unverified');

  const id = String(info.id);
  const handle = typeof info.username === 'string' && /^[A-Za-z0-9_.-]{1,50}$/.test(info.username) ? info.username : '';
  const avatarUrl =
    typeof info.avatar === 'string' && /^[A-Za-z0-9_]+$/.test(info.avatar)
      ? `https://cdn.discordapp.com/avatars/${id}/${info.avatar}.png`
      : undefined;

  await signInWithProvider(res, {
    idField: 'discordId',
    id,
    email: normEmail(info.email),
    displayName: info.global_name || info.username,
    avatarUrl,
    socials: handle ? { discord: handle } : {},
  });
}));

router.use(apiErrorHandler);

module.exports = router;
module.exports.passwordProblem = passwordProblem;
