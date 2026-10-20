const jwt = require('jsonwebtoken');

const COOKIE = 'drawsicle_token';
const DAY_MS = 24 * 60 * 60 * 1000;
// How long a log-in lasts:
//   remember: true   30 days, even after the browser closes ("Remember me" ticked)
//   remember: false  until the browser closes (and never more than 12 hours)
//   not said         7 days (signing up, Google/Discord, password resets)
const LENGTHS = {
  remembered: { cookieMs: 30 * DAY_MS, token: '30d' },
  browser: { cookieMs: null, token: '12h' },
  usual: { cookieMs: 7 * DAY_MS, token: '7d' },
};

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set in server/.env');
  return s;
}

function cookieOptions() {
  return {
    httpOnly: true, // JS in the browser can't read it, so XSS can't steal it
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}

function startSession(res, user, { remember } = {}) {
  const length = remember === true ? LENGTHS.remembered : remember === false ? LENGTHS.browser : LENGTHS.usual;
  const token = jwt.sign({ sub: user._id.toString(), v: user.sessionVersion || 0 }, secret(), {
    expiresIn: length.token,
  });
  // No maxAge makes it a browser-session cookie, gone when the browser closes
  res.cookie(COOKIE, token, { ...cookieOptions(), ...(length.cookieMs ? { maxAge: length.cookieMs } : {}) });
}

function endSession(res) {
  res.clearCookie(COOKIE, cookieOptions());
}

// Returns { userId, version } or null
function readSession(req) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, secret());
    return { userId: payload.sub, version: payload.v || 0 };
  } catch {
    return null;
  }
}

module.exports = { startSession, endSession, readSession };
