// One-click unsubscribe (docs/specs/supabase-auth-email.md, ticket 10). Every notification and
// digest email carries a link that turns off just that email type for just that person, without
// logging in. The link is signed with the server secret, so it can't be pointed at anyone else.
//
//   type: 'reminders' | 'matches' | 'eventUpdates', or 'digest' (every type set to Daily)
const crypto = require('node:crypto');
const User = require('../models/User.js');
const { EMAIL_TYPES, EMAIL_MODES, emailModesOf } = require('../../shared/email-types.mjs');
const { clientUrl } = require('../utils/helpers.js');

const TYPES = [...EMAIL_TYPES.map((t) => t.key), 'digest'];
const LABELS = { ...Object.fromEntries(EMAIL_TYPES.map((t) => [t.key, t.label])), digest: 'the daily digest' };

function sign(payload) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set in server/.env');
  return crypto.createHmac('sha256', `unsubscribe:${secret}`).update(payload).digest('base64url');
}

function unsubscribeToken(userId, type) {
  const payload = Buffer.from(`${userId}:${type}`).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

// -> { userId, type } or null when the link was changed or made up
function readUnsubscribeToken(token) {
  if (typeof token !== 'string') return null;
  const [payload, sig, extra] = token.split('.');
  if (!payload || !sig || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  const [userId, type] = Buffer.from(payload, 'base64url').toString().split(':');
  return /^[0-9a-f]{24}$/i.test(userId || '') && TYPES.includes(type) ? { userId, type } : null;
}

// The page people land on, and the address Gmail's own button posts to
const unsubscribePageUrl = (token) => `${clientUrl()}/unsubscribe?t=${token}`;
const unsubscribeApiUrl = (token) => `${clientUrl()}/api/unsubscribe?t=${token}`;

// What to put in an email for this person and type: a footer line and the List-Unsubscribe headers
function unsubscribeFor(userId, type) {
  const token = unsubscribeToken(userId, type);
  return {
    label: `Unsubscribe from ${LABELS[type]}`,
    url: unsubscribePageUrl(token),
    headers: {
      'List-Unsubscribe': `<${unsubscribeApiUrl(token)}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

// The email types a link switches off: its own, or for the digest every type set to Daily
function typesFor(type, modes) {
  if (type !== 'digest') return [type];
  return EMAIL_TYPES.map((t) => t.key).filter((k) => modes[k] === 'digest');
}

function setModes(user, changes) {
  for (const [key, mode] of Object.entries(changes)) {
    const type = EMAIL_TYPES.find((t) => t.key === key);
    user.notificationPrefs.emailModes[key] = mode;
    user.notificationPrefs[type.legacy] = mode !== 'off';
  }
}

// -> { type, label, previous: { [emailType]: mode } } (previous is what Undo puts back), or null
async function unsubscribe(token) {
  const link = readUnsubscribeToken(token);
  if (!link) return null;
  const user = await User.findById(link.userId);
  if (!user) return null;
  const modes = emailModesOf(user.notificationPrefs);
  const previous = Object.fromEntries(typesFor(link.type, modes).filter((k) => modes[k] !== 'off').map((k) => [k, modes[k]]));
  setModes(user, Object.fromEntries(Object.keys(previous).map((k) => [k, 'off'])));
  await user.save();
  return { type: link.type, label: LABELS[link.type], previous };
}

// Puts back what unsubscribe() turned off. Only for the link's own types, only real modes.
// -> true, false for a bad link, or 'invalid' for a bad `previous`
async function undoUnsubscribe(token, previous) {
  const link = readUnsubscribeToken(token);
  if (!link) return false;
  if (!previous || typeof previous !== 'object' || Array.isArray(previous)) return 'invalid';
  const allowed = link.type === 'digest' ? EMAIL_TYPES.map((t) => t.key) : [link.type];
  const entries = Object.entries(previous);
  if (entries.some(([k, m]) => !allowed.includes(k) || !EMAIL_MODES.includes(m))) return 'invalid';
  if (link.type === 'digest' && entries.some(([, m]) => m !== 'digest')) return 'invalid';
  const user = await User.findById(link.userId);
  if (!user) return false;
  setModes(user, previous);
  await user.save();
  return true;
}

module.exports = { unsubscribeToken, readUnsubscribeToken, unsubscribeFor, unsubscribe, undoUnsubscribe };
