import { reactive } from 'vue';
import { play } from '@/effects/sfx';
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
  UserPlus,
  MessageCircleQuestion,
  BellRing,
} from 'lucide-vue-next';
import { api, qs } from '../api';
import { notificationGroup } from '@shared/notification-groups.mjs';

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

// Icon and colour per type. Which filter group a type is in comes from shared/notification-groups.mjs,
// the same list the server filters with.
const KINDS = {
  application_received: { icon: Inbox, tone: 'info' },
  application_accepted: { icon: CircleCheck, tone: 'success' },
  application_rejected: { icon: Ban, tone: 'muted' },
  match_assigned: { icon: Gift, tone: 'pink' },
  gift_question: { icon: MessageCircleQuestion, tone: 'info' },
  gift_answer: { icon: MessageCircleQuestion, tone: 'pink' },
  submission_received: { icon: ImageUp, tone: 'info' },
  gift_revealed: { icon: PartyPopper, tone: 'pink' },
  gift_thanked: { icon: Heart, tone: 'pink' },
  backup_needed: { icon: LifeBuoy, tone: 'warning' },
  backup_assigned: { icon: Gift, tone: 'pink' },
  waitlist_promoted: { icon: CircleCheck, tone: 'success' },
  announcement: { icon: Megaphone, tone: 'info' },
  event_invite: { icon: MailPlus, tone: 'pink' },
  report_received: { icon: Flag, tone: 'warning' },
  report_handled: { icon: Flag, tone: 'success' },
  new_follower: { icon: UserPlus, tone: 'info' },
  new_friend: { icon: Users, tone: 'pink' },
  chat_muted: { icon: Flag, tone: 'muted' },
  deadline_reminder: { icon: Clock, tone: 'warning' },
  event_closing_soon: { icon: BellRing, tone: 'warning' },
  event_status: { icon: CalendarHeart, tone: 'pink' },
  organizer_added: { icon: Users, tone: 'info' },
  role_changed: { icon: ShieldCheck, tone: 'info' },
};
const OTHER_KIND = { icon: Bell, tone: 'muted' };

// notificationKind('match_assigned') -> { icon, group: 'matches', tone: 'pink' }
export function notificationKind(type) {
  return { ...(KINDS[type] || OTHER_KIND), group: notificationGroup(type) };
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

// ---------- Filtered view (the notifications page with a filter on) ----------
// Filters run on the server, so "Load more" pages through that filter only and nothing is
// missed because it wasn't loaded yet. The bell keeps using the unfiltered list above.

export const filtered = reactive({
  key: '', // which filter `items` belongs to, e.g. 'unread|matches'
  items: [],
  hasMore: false,
  loading: false,
  loadingMore: false,
});

// How many there are per filter chip, for the current read state: { all, signups, matches, ... }
export const groupCounts = reactive({ key: '', counts: null });

const filterKey = ({ show = 'all', group = '' } = {}) => `${show}|${group}`;
const filterParams = ({ show = 'all', group = '' } = {}) => ({
  unread: show === 'unread' ? 1 : undefined,
  group: group || undefined,
});

// First page for a filter. A slower answer for a filter the person has already moved away from is dropped.
export async function loadFiltered(filter, limit = PAGE_SIZE) {
  const key = filterKey(filter);
  if (filtered.key !== key) {
    filtered.items = [];
    filtered.hasMore = false;
  }
  filtered.key = key;
  filtered.loading = true;
  try {
    const data = await api(`/notifications${qs({ limit, ...filterParams(filter) })}`);
    if (filtered.key !== key) return;
    filtered.items = data.items || [];
    filtered.hasMore = typeof data.hasMore === 'boolean' ? data.hasMore : filtered.items.length >= limit;
    if (typeof data.unreadCount === 'number') notifications.unreadCount = data.unreadCount;
  } finally {
    if (filtered.key === key) filtered.loading = false;
  }
}

export async function loadMoreFiltered(filter, limit = PAGE_SIZE) {
  const key = filterKey(filter);
  const last = filtered.items[filtered.items.length - 1];
  if (filtered.key !== key || !last || filtered.loadingMore) return;
  filtered.loadingMore = true;
  try {
    const data = await api(`/notifications${qs({ limit, before: last.createdAt, ...filterParams(filter) })}`);
    if (filtered.key !== key) return;
    const known = new Set(filtered.items.map((n) => n.id));
    const older = (data.items || []).filter((n) => !known.has(n.id));
    filtered.items.push(...older);
    filtered.hasMore = older.length > 0 && (typeof data.hasMore === 'boolean' ? data.hasMore : older.length >= limit);
  } finally {
    filtered.loadingMore = false;
  }
}

// Chip counts for "All" or "Unread". Failing quietly is fine: the chips just show no numbers.
export async function loadGroupCounts(show = 'all') {
  const key = show;
  groupCounts.key = key;
  try {
    const data = await api(`/notifications${qs({ limit: 1, counts: 1, unread: show === 'unread' ? 1 : undefined })}`);
    if (groupCounts.key === key) groupCounts.counts = data.counts || null;
  } catch {
    if (groupCounts.key === key) groupCounts.counts = null;
  }
}

// The same notification can be in both lists; changes go to both
const copiesOf = (id) => [notifications.items, filtered.items].map((list) => list.find((n) => n.id === id)).filter(Boolean);

function adjustCounts(item, change) {
  const counts = groupCounts.counts;
  if (!counts) return;
  const group = notificationGroup(item.type);
  // On "Unread", reading one takes it out of the count; on "All", only deleting does
  if (change === 'read' && groupCounts.key !== 'unread') return;
  counts.all = Math.max(0, (counts.all || 0) - 1);
  counts[group] = Math.max(0, (counts[group] || 0) - 1);
}

// Errors are ignored (probably logged out) unless the caller asks for them,
// e.g. the bell wants to know when the session has run out.
export async function refreshUnreadCount({ throwErrors = false } = {}) {
  try {
    const { unreadCount } = await api('/notifications/unread-count');
    if (unreadCount > notifications.unreadCount && notifications.countKnown) play('ding');
    notifications.unreadCount = unreadCount;
    notifications.countKnown = true;
  } catch (e) {
    if (throwErrors) throw e;
  }
}

// ---------- Changes ----------

export async function markRead(id) {
  const copies = copiesOf(id);
  if (!copies.length || copies.every((n) => n.read)) return;
  copies.forEach((n) => (n.read = true));
  notifications.unreadCount = Math.max(0, notifications.unreadCount - 1);
  adjustCounts(copies[0], 'read');
  try {
    await api(`/notifications/${id}/read`, { method: 'PATCH' });
  } catch {
    // The server didn't take it: ask it for the real number rather than guess
    copies.forEach((n) => (n.read = false));
    refreshUnreadCount();
  }
}

export async function markAllRead() {
  const lists = [notifications.items, filtered.items];
  const previous = lists.map((list) => list.map((n) => n.read));
  const previousBeyond = notifications.unreadBeyond;
  const previousCounts = groupCounts.counts ? { ...groupCounts.counts } : null;
  lists.forEach((list) => list.forEach((n) => (n.read = true)));
  notifications.unreadCount = 0;
  notifications.unreadBeyond = 0;
  if (groupCounts.key === 'unread' && groupCounts.counts) {
    for (const key of Object.keys(groupCounts.counts)) groupCounts.counts[key] = 0;
  }
  try {
    await api('/notifications/read-all', { method: 'POST' });
  } catch (e) {
    lists.forEach((list, l) => list.forEach((n, i) => (n.read = previous[l][i] ?? n.read)));
    notifications.unreadBeyond = previousBeyond;
    if (previousCounts) groupCounts.counts = previousCounts;
    refreshUnreadCount();
    throw e;
  }
}

// Throws on failure so the page can tell the user; the list only changes once the server agrees
export async function removeNotification(id) {
  await api(`/notifications/${id}`, { method: 'DELETE' });
  let removed = null;
  for (const list of [notifications.items, filtered.items]) {
    const index = list.findIndex((n) => n.id === id);
    if (index !== -1) removed = list.splice(index, 1)[0];
  }
  if (!removed) return;
  if (!removed.read) notifications.unreadCount = Math.max(0, notifications.unreadCount - 1);
  adjustCounts(removed, 'delete');
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
  Object.assign(filtered, { key: '', items: [], hasMore: false, loading: false, loadingMore: false });
  Object.assign(groupCounts, { key: '', counts: null });
}
