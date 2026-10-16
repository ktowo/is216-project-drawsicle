import { reactive } from 'vue';
import {
  Bell,
  Inbox,
  CircleCheck,
  Ban,
  CalendarHeart,
  Users,
  ShieldCheck,
  Gift,
  Clock,
  ImageUp,
  PartyPopper,
  Heart,
  Megaphone,
  MailPlus,
  LifeBuoy,
  Flag,
} from 'lucide-vue-next';
import { api, qs } from '../api';

// In-app notifications for the logged-in user. The bell and the notifications page share this list.
export const notifications = reactive({
  items: [],
  unreadCount: 0,
  // Unread ones older than what we've loaded, so the page can tell "new since you loaded" apart from "further back"
  unreadBeyond: 0,
  loading: false,
  loaded: false,
  hasMore: false,
  loadingMore: false,
});

export const PAGE_SIZE = 20;

// ---------- Types: icon, colour and which filter they belong to ----------

export const NOTIFICATION_GROUPS = [
  { key: 'signups', label: 'Sign-ups' },
  { key: 'matches', label: 'Matches' },
  { key: 'reminders', label: 'Reminders' },
  { key: 'events', label: 'Event updates' },
];

const KINDS = {
  application_received: { icon: Inbox, group: 'signups', tone: 'info' },
  application_accepted: { icon: CircleCheck, group: 'signups', tone: 'success' },
  application_rejected: { icon: Ban, group: 'signups', tone: 'muted' },
  match_assigned: { icon: Gift, group: 'matches', tone: 'pink' },
  submission_received: { icon: ImageUp, group: 'matches', tone: 'info' },
  gift_revealed: { icon: PartyPopper, group: 'matches', tone: 'pink' },
  gift_thanked: { icon: Heart, group: 'matches', tone: 'pink' },
  backup_needed: { icon: LifeBuoy, group: 'matches', tone: 'warning' },
  backup_assigned: { icon: Gift, group: 'matches', tone: 'pink' },
  waitlist_promoted: { icon: CircleCheck, group: 'signups', tone: 'success' },
  announcement: { icon: Megaphone, group: 'events', tone: 'info' },
  event_invite: { icon: MailPlus, group: 'events', tone: 'pink' },
  report_received: { icon: Flag, group: 'events', tone: 'warning' },
  report_handled: { icon: Flag, group: 'events', tone: 'success' },
  deadline_reminder: { icon: Clock, group: 'reminders', tone: 'warning' },
  event_status: { icon: CalendarHeart, group: 'events', tone: 'pink' },
  organizer_added: { icon: Users, group: 'events', tone: 'info' },
  role_changed: { icon: ShieldCheck, group: 'events', tone: 'info' },
};
const OTHER_KIND = { icon: Bell, group: 'events', tone: 'muted' };

// notificationKind('match_assigned') -> { icon, group: 'matches', tone: 'pink' }
export function notificationKind(type) {
  return KINDS[type] || OTHER_KIND;
}

// Notification links are in-app paths like /events/123; anything else is ignored
export function isInternalLink(link) {
  return typeof link === 'string' && link.startsWith('/') && !link.startsWith('//');
}

// ---------- Loading ----------

const loadedUnread = () => notifications.items.filter((n) => !n.read).length;

function noteUnreadBeyond() {
  notifications.unreadBeyond = notifications.hasMore ? Math.max(0, notifications.unreadCount - loadedUnread()) : 0;
}

// Newest page. When the page has already loaded further back ("Load more") and the new page
// overlaps it, the older items are kept so the bell refreshing doesn't throw them away.
export async function loadNotifications(limit = PAGE_SIZE) {
  notifications.loading = true;
  try {
    const data = await api(`/notifications${qs({ limit })}`);
    const latest = data.items || [];
    const current = notifications.items;
    const oldest = latest[latest.length - 1];
    const joinAt = oldest && latest.length >= limit ? current.findIndex((n) => n.id === oldest.id) : -1;

    if (joinAt !== -1 && current.length > joinAt + 1) {
      notifications.items = [...latest, ...current.slice(joinAt + 1)];
    } else {
      notifications.items = latest;
      notifications.hasMore = typeof data.hasMore === 'boolean' ? data.hasMore : latest.length >= limit;
    }
    notifications.unreadCount = data.unreadCount ?? 0;
    notifications.loaded = true;
    noteUnreadBeyond();
  } finally {
    notifications.loading = false;
  }
}

// Next page, older than the last one we have (the `before` cursor)
export async function loadMoreNotifications(limit = PAGE_SIZE) {
  const last = notifications.items[notifications.items.length - 1];
  if (!last || notifications.loadingMore) return;
  notifications.loadingMore = true;
  try {
    const data = await api(`/notifications${qs({ limit, before: last.createdAt })}`);
    const known = new Set(notifications.items.map((n) => n.id));
    const older = (data.items || []).filter((n) => !known.has(n.id));
    notifications.items.push(...older);
    if (typeof data.unreadCount === 'number') notifications.unreadCount = data.unreadCount;
    // Nothing we didn't already have means we've reached the end, whatever the server says
    notifications.hasMore =
      older.length > 0 && (typeof data.hasMore === 'boolean' ? data.hasMore : older.length >= limit);
    noteUnreadBeyond();
  } finally {
    notifications.loadingMore = false;
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

// ---------- Changes ----------

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
  const previousBeyond = notifications.unreadBeyond;
  notifications.items.forEach((n) => (n.read = true));
  notifications.unreadCount = 0;
  notifications.unreadBeyond = 0;
  try {
    await api('/notifications/read-all', { method: 'POST' });
  } catch (e) {
    notifications.items.forEach((n, i) => (n.read = previous[i] ?? n.read));
    notifications.unreadBeyond = previousBeyond;
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
  notifications.unreadBeyond = 0;
  notifications.loading = false;
  notifications.loaded = false;
  notifications.hasMore = false;
  notifications.loadingMore = false;
}
