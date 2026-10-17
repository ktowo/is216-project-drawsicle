// Quick login: the accounts that logged in on this device with "Remember me" ticked, so the
// login page can offer them with one click. Only the email, name and picture are kept, never a
// password (the browser's password manager fills that in).
const KEY = 'drawsicle:recent-logins';
const PREFERENCE = 'drawsicle:remember-me';
const MAX = 4;

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((a) => a && typeof a.email === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // Not kept; quick login just won't offer it
  }
}

export const recentLogins = () => read();

export function rememberLogin(user) {
  if (!user?.email) return;
  const entry = { email: user.email, displayName: user.displayName || '', avatarUrl: user.avatarUrl || null, at: new Date().toISOString() };
  write([entry, ...read().filter((a) => a.email !== user.email)]);
}

export function forgetLogin(email) {
  write(read().filter((a) => a.email !== email));
}

// The last choice for "Remember me" on this device (ticked unless they unticked it)
export function rememberPreference() {
  try {
    return localStorage.getItem(PREFERENCE) !== 'no';
  } catch {
    return true;
  }
}

export function setRememberPreference(on) {
  try {
    localStorage.setItem(PREFERENCE, on ? 'yes' : 'no');
  } catch {
    // Asked again next time
  }
}
