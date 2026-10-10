const jwt = require('jsonwebtoken');

const COOKIE = 'drawisicle_token';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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

function startSession(res, user) {
  const token = jwt.sign({ sub: user._id.toString(), v: user.sessionVersion || 0 }, secret(), {
    expiresIn: '7d',
  });
  res.cookie(COOKIE, token, { ...cookieOptions(), maxAge: MAX_AGE_MS });
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
