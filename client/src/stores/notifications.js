import { reactive } from 'vue';
import { api } from '../api';

export const notifications = reactive({
  items: [],
  unreadCount: 0,
  loading: false,
});

export async function loadNotifications() {
  notifications.loading = true;
  try {
    const { items, unreadCount } = await api('/notifications?limit=20');
    notifications.items = items;
    notifications.unreadCount = unreadCount;
  } finally {
    notifications.loading = false;
  }
}

export async function refreshUnreadCount() {
  try {
    const { unreadCount } = await api('/notifications/unread-count');
    notifications.unreadCount = unreadCount;
  } catch {
    /* ignore: probably logged out */
  }
}

export async function markRead(id) {
  const item = notifications.items.find((n) => n.id === id);
  if (!item || item.read) return;
  item.read = true;
  notifications.unreadCount = Math.max(0, notifications.unreadCount - 1);
  await api(`/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {});
}

export async function markAllRead() {
  notifications.items.forEach((n) => (n.read = true));
  notifications.unreadCount = 0;
  await api('/notifications/read-all', { method: 'POST' }).catch(() => {});
}
