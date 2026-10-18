// /auth/*: email + password accounts (server/routes/auth-router.js).
// Google and Discord sign-in need the real server, so /auth/providers says they're off.
import { emptySocials, newId } from '../db.js';
import { userPublic } from '../model.js';
import { EMAIL_RE, httpError, invalid, passwordProblem } from '../util.js';

const DISPLAY_NAME_MAX = 60;
const normEmail = (e) => (typeof e === 'string' ? e.trim().toLowerCase() : '');
const localPart = (email) => email.split('@')[0].slice(0, DISPLAY_NAME_MAX);

// Turns "Mika.Draws!" into an unused username like "mika_draws" or "mika_draws2"
export function generateUsername(state, base) {
  let stem = String(base || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  if (stem.length < 3) stem = `artist_${stem}`.slice(0, 24);
  const taken = new Set(state.users.map((u) => u.username).filter(Boolean));
  let candidate = stem;
  for (let n = 2; taken.has(candidate); n++) candidate = `${stem}${n}`;
  return candidate;
}

// Logging back in within the grace period cancels a deactivation
function reactivate(user) {
  if (user.status !== 'deactivated') return false;
  user.status = 'active';
  user.deactivatedAt = null;
  return true;
}

export function register(router) {
  router.post('/auth/register', (ctx) => {
    const { state, body } = ctx;
    const email = normEmail(body.email);
    if (!EMAIL_RE.test(email) || email.length > 254) throw invalid('Enter a valid email address.');
    const pwError = passwordProblem(body.password);
    if (pwError) throw invalid(pwError);

    let displayName = '';
    if (body.displayName !== undefined && body.displayName !== null) {
      if (typeof body.displayName !== 'string') throw invalid('Display name must be text.');
      displayName = body.displayName.trim();
      if (displayName.length > DISPLAY_NAME_MAX) throw invalid(`Display name is too long (max ${DISPLAY_NAME_MAX}).`);
    }
    displayName = displayName || localPart(email);

    if (state.users.some((u) => u.email === email)) {
      throw httpError(409, 'An account with this email already exists. Try logging in.', 'EMAIL_TAKEN');
    }

    const now = ctx.now.toISOString();
    const user = {
      id: newId(),
      email,
      password: body.password,
      username: generateUsername(state, displayName),
      role: 'user',
      status: 'active',
      deactivatedAt: null,
      sessionVersion: 0,
      displayName,
      avatarUrl: null,
      bio: '',
      socials: emptySocials(),
      artistTags: { makes: [], themes: [], activity: '', cardColor: '' },
      defaultForm: { communityUsername: '', canCreate: [], wantsTypes: [], likes: '', avoid: '', cannotDraw: [] },
      notificationPrefs: { emailReminders: true, emailMatches: true, emailEventUpdates: false },
      createdAt: now,
      updatedAt: now,
    };
    state.users.push(user);
    ctx.startSession(user);
    ctx.status = 201;
    return { user: userPublic(user) };
  });

  router.post('/auth/login', (ctx) => {
    const email = normEmail(ctx.body.email);
    const { password } = ctx.body;
    const wrong = () => httpError(401, 'Wrong email or password.', 'WRONG_CREDENTIALS');
    if (!email || typeof password !== 'string' || !password) throw wrong();

    const user = ctx.state.users.find((u) => u.email === email);
    // Anonymised accounts have no password left, so they can't match
    if (!user || !user.password || user.password !== password) throw wrong();

    const reactivated = reactivate(user);
    if (reactivated) user.updatedAt = ctx.now.toISOString();
    ctx.startSession(user, { remember: typeof ctx.body.remember === 'boolean' ? ctx.body.remember : undefined });
    return reactivated ? { user: userPublic(user), reactivated: true } : { user: userPublic(user) };
  });

  router.post('/auth/logout', (ctx) => {
    ctx.endSession();
    return { ok: true };
  });

  router.get('/auth/me', (ctx) => ({ user: userPublic(ctx.requireAuth()) }));

  router.get('/auth/providers', () => ({ google: false, discord: false }));

  // No emails leave the browser, but the answer is the same as the server's either way
  router.post('/auth/forgot-password', (ctx) => {
    if (!EMAIL_RE.test(normEmail(ctx.body.email))) throw invalid('Enter a valid email address.');
    return { message: 'If an account exists for that email, a reset link is on its way.' };
  });

  // Mock mode never sends reset links, so no token can be valid. Same answers as the server
  // gives for a link that was used or replaced by a newer email.
  const usedLink = () =>
    httpError(
      400,
      'This reset link was already used, or a newer reset email replaced it. Request a new one if you still need it.',
      'INVALID_TOKEN',
      { reason: 'used' }
    );

  router.get('/auth/reset-password/check', () => {
    throw usedLink();
  });

  router.post('/auth/reset-password', (ctx) => {
    const { token, password } = ctx.body;
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw usedLink();
    const pwError = passwordProblem(password);
    if (pwError) throw invalid(pwError);
    throw usedLink();
  });

  router.post('/auth/change-password', (ctx) => {
    const user = ctx.requireAuth();
    const { currentPassword, newPassword } = ctx.body;
    if (user.password && currentPassword !== user.password) {
      throw httpError(401, 'Your current password is not right.', 'WRONG_PASSWORD');
    }
    const pwError = passwordProblem(newPassword);
    if (pwError) throw invalid(pwError);

    user.password = newPassword;
    user.sessionVersion = (user.sessionVersion || 0) + 1;
    user.updatedAt = ctx.now.toISOString();
    ctx.startSession(user);
    return { user: userPublic(user) };
  });
}
