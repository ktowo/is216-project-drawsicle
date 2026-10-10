import { reactive } from 'vue';
import { api } from '../api';

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

export async function login(email, password) {
  const { user } = await api('/auth/login', { method: 'POST', body: { email, password } });
  auth.user = user;
  return user;
}

export async function register(email, password) {
  const { user } = await api('/auth/register', { method: 'POST', body: { email, password } });
  auth.user = user;
  return user;
}

export async function logout() {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  auth.user = null;
}

export function setUser(user) {
  auth.user = user;
}

// Event roles helper for teammates' pages:
//   hasEventRole(memberships, eventId, 'organizer')
export function hasEventRole(memberships, eventId, ...roles) {
  if (auth.user?.role === 'admin') return true;
  const m = memberships.find((x) => x.eventId === eventId);
  return Boolean(m && m.roles.some((r) => roles.includes(r)));
}
