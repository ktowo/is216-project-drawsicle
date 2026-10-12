import { reactive } from 'vue';
import { api } from '../api';

// In-app notifications for the logged-in user. The bell and the notifications page share this list.
export const notifications = reactive({
  items: [],
  unreadCount: 0,
  loading: false,
  loaded: false,
});

export async function loadNotifications(limit = 20) {
  notifications.loading = true;
  try {
    const { items, unreadCount } = await api(`/notifications?limit=${limit}`);
    notifications.items = items;
    notifications.unreadCount = unreadCount;
    notifications.loaded = true;
  } finally {
    notifications.loading = false;
  }
}

// Errors are ignored (probably logged out) unless the caller asks for them,
// e.g. the bell wants to know when the session has run out.
export async function refreshUnreadCount({ throwErrors = false } = {}) {
  try {
    const { unreadCount } = await api('/notifications/unread-count');
    notifications.unreadCount = unreadCount;
  } catch (e) {
    if (throwErrors) throw e;
  }
}

export async function markRead(id) {
  const item = notifications.items.find((n) => n.id === id);
  if (!item || item.read) return;
  item.read = true;
  notifications.unreadCount = Math.max(0, notifications.unreadCount - 1);
  try {
    await api(`/notifications/${id}/read`, { method: 'PATCH' });
  } catch {
    // The server didn't take it: ask it for the real number rather than guess
    item.read = false;
    refreshUnreadCount();
  }
}

export async function markAllRead() {
  const previous = notifications.items.map((n) => n.read);
  notifications.items.forEach((n) => (n.read = true));
  notifications.unreadCount = 0;
  try {
    await api('/notifications/read-all', { method: 'POST' });
  } catch (e) {
    notifications.items.forEach((n, i) => (n.read = previous[i] ?? n.read));
    refreshUnreadCount();
    throw e;
  }
}

// Throws on failure so the page can tell the user; the list only changes once the server agrees
export async function removeNotification(id) {
  await api(`/notifications/${id}`, { method: 'DELETE' });
  const index = notifications.items.findIndex((n) => n.id === id);
  if (index === -1) return;
  const [removed] = notifications.items.splice(index, 1);
  if (!removed.read) notifications.unreadCount = Math.max(0, notifications.unreadCount - 1);
}

// Called on logout so the next person on this browser doesn't see the old list
export function resetNotifications() {
  notifications.items = [];
  notifications.unreadCount = 0;
  notifications.loading = false;
  notifications.loaded = false;
}
