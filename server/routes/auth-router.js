const { Router } = require('express');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const User = require('../models/User.js');
const { requireAuth } = require('../middleware/auth.js');
const { startSession, endSession } = require('../utils/session.js');
const { sendMail } = require('../services/mailer.js');
const { asyncHandler, apiErrorHandler, applyAdminList, clientUrl } = require('../utils/helpers.js');

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESET_TTL_MS = 60 * 60 * 1000; // reset links last 1 hour
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
const normEmail = (e) => String(e || '').trim().toLowerCase();
const isProd = () => process.env.NODE_ENV === 'production';

// Slows down password guessing: 20 tries per 15 min per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Try again in a few minutes.' },
});

function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 128) return 'Password is too long.';
  return null;
}

// ---------- Email + password ----------

router.post('/register', authLimiter, asyncHandler(async (req, res) => {
  const email = normEmail(req.body.email);
  const { password } = req.body;

  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  const pwError = passwordProblem(password);
  if (pwError) return res.status(400).json({ error: pwError });

  if (await User.exists({ email })) {
    return res.status(409).json({ error: 'An account with this email already exists. Try logging in.' });
  }

  const user = new User({
    email,
    passwordHash: await bcrypt.hash(password, 12),
    displayName: email.split('@')[0],
  });
  applyAdminList(user);

  try {
    await user.save();
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'An account with this email already exists. Try logging in.' });
    }
    throw err;
  }

  startSession(res, user);
  res.status(201).json({ user: user.toPublic() });
}));

router.post('/login', authLimiter, asyncHandler(async (req, res) => {
  const email = normEmail(req.body.email);
  const { password } = req.body;
  const wrong = () => res.status(401).json({ error: 'Wrong email or password.' });

  if (!email || typeof password !== 'string') return wrong();

  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user) return wrong();
  if (!user.passwordHash) {
    return res.status(400).json({ error: 'This account uses Google sign-in. Click "Continue with Google".' });
  }
  if (!(await bcrypt.compare(password, user.passwordHash))) return wrong();

  applyAdminList(user);
  if (user.isModified()) await user.save();

  startSession(res, user);
  res.json({ user: user.toPublic() });
}));

router.post('/logout', (req, res) => {
  endSession(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toPublic() });
});

// ---------- Password reset ----------

router.post('/forgot-password', authLimiter, asyncHandler(async (req, res) => {
  const email = normEmail(req.body.email);
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });

  const user = await User.findOne({ email });
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    user.resetTokenHash = hashToken(token);
    user.resetTokenExpires = new Date(Date.now() + RESET_TTL_MS);
    await user.save();

    const link = `${clientUrl()}/reset-password?token=${token}`;
    await sendMail({
      to: user.email,
      subject: 'Reset your Drawisicle password',
      text: `Someone asked to reset your Drawisicle password.\n\nReset it here (link works for 1 hour):\n${link}\n\nIf this wasn't you, ignore this email.`,
      html: `<p>Someone asked to reset your Drawisicle password.</p><p><a href="${link}">Reset your password</a> (link works for 1 hour)</p><p>If this wasn't you, ignore this email.</p>`,
    });
  }

  // Same answer either way, so nobody can use this to check who has an account
  res.json({ message: 'If an account exists for that email, a reset link is on its way.' });
}));

router.post('/reset-password', authLimiter, asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  const invalid = () =>
    res.status(400).json({ error: 'This reset link has expired or was already used.', code: 'INVALID_TOKEN' });

  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return invalid();
  const pwError = passwordProblem(password);
  if (pwError) return res.status(400).json({ error: pwError });

  const user = await User.findOne({
    resetTokenHash: hashToken(token),
    resetTokenExpires: { $gt: new Date() },
  });
  if (!user) return invalid();

  user.passwordHash = await bcrypt.hash(password, 12);
  user.resetTokenHash = undefined;
  user.resetTokenExpires = undefined;
  user.sessionVersion = (user.sessionVersion || 0) + 1; // logs out every other device
  await user.save();

  startSession(res, user);
  res.json({ user: user.toPublic() });
}));

// ---------- Google OAuth ----------

const googleRedirectUri = () =>
  process.env.GOOGLE_REDIRECT_URI || `${clientUrl()}/api/auth/google/callback`;

router.get('/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.redirect(`${clientUrl()}/login?error=google_not_configured`);
  }

  // Random state stops other sites from forging a login callback
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd(),
    maxAge: 10 * 60 * 1000,
  });

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/google/callback', asyncHandler(async (req, res) => {
  const fail = (reason) => res.redirect(`${clientUrl()}/login?error=${reason}`);
  const code = typeof req.query.code === 'string' ? req.query.code : null;
  const state = typeof req.query.state === 'string' ? req.query.state : null;
  const expectedState = req.cookies?.oauth_state;
  res.clearCookie('oauth_state');

  if (req.query.error) return fail('google_cancelled');
  if (!code || !state || state !== expectedState) return fail('google_failed');

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

  const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!infoRes.ok) return fail('google_failed');
  const info = await infoRes.json(); // { sub, email, email_verified, name, picture }

  if (!info.email || !info.email_verified) return fail('google_unverified');
  const email = info.email.toLowerCase();

  // Same person might have signed up with email first, so link by email too
  let user = (await User.findOne({ googleId: info.sub })) || (await User.findOne({ email }));
  if (!user) {
    user = new User({
      email,
      googleId: info.sub,
      displayName: info.name || email.split('@')[0],
      avatarUrl: info.picture,
    });
  } else {
    if (!user.googleId) user.googleId = info.sub;
    if (!user.avatarUrl && info.picture) user.avatarUrl = info.picture;
  }
  applyAdminList(user);
  await user.save();

  startSession(res, user);
  res.redirect(`${clientUrl()}/dashboard`);
}));

router.use(apiErrorHandler);

module.exports = router;
