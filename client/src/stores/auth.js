import { reactive } from 'vue';
import { api } from '../api';
import { resetNotifications } from './notifications';

// Shared logged-in user. Import `auth` anywhere and read auth.user.
export const auth = reactive({
  user: null,
  checked: false, // true once we've asked the server who's logged in
});

export async function loadUser() {
  try {
    const { user } = await api('/auth/me');
    auth.user = user;
  } catch {
    auth.user = null;
  } finally {
    auth.checked = true;
  }
  return auth.user;
}

// Fetch the user again (e.g. after something on the server changed it).
// Only a 401 logs the person out here; a network blip keeps the user we have.
export async function refreshUser() {
  try {
    const { user } = await api('/auth/me');
    setUser(user);
  } catch (e) {
    if (e.status === 401) setUser(null);
  } finally {
    auth.checked = true;
  }
  return auth.user;
}

// -> { user, reactivated } (reactivated is true when this login woke up a deactivated account)
// remember: stay logged in for 30 days (true) or until the browser closes (false)
export async function login(email, password, { remember } = {}) {
  const { user, reactivated } = await api('/auth/login', { method: 'POST', body: { email, password, remember } });
  resetNotifications();
  auth.user = user;
  auth.checked = true;
  return { user, reactivated: Boolean(reactivated) };
}

export async function register(email, password, displayName) {
  const body = { email, password };
  const name = typeof displayName === 'string' ? displayName.trim() : '';
  if (name) body.displayName = name;
  const { user } = await api('/auth/register', { method: 'POST', body });
  resetNotifications();
  auth.user = user;
  auth.checked = true;
  return user;
}

export async function logout() {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  setUser(null);
}

// Pass null to clear the user (logout, deactivation). A different account than before
// (e.g. a password reset while someone else was logged in) also starts with a clean bell.
export function setUser(user) {
  if (!user || user.id !== auth.user?.id) resetNotifications();
  auth.user = user;
  auth.checked = true;
}

// Event roles helper for teammates' pages:
//   hasEventRole(memberships, eventId, 'organizer')
export function hasEventRole(memberships, eventId, ...roles) {
  if (auth.user?.role === 'admin') return true;
  const m = (memberships || []).find((x) => x.eventId === eventId);
  return Boolean(m && m.roles.some((r) => roles.includes(r)));
}
