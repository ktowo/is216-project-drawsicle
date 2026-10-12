<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import { Bell, CheckCheck, ArrowRight, Loader2, RotateCcw } from 'lucide-vue-next';
import { auth, refreshUser } from '@/stores/auth';
import {
  notifications,
  loadNotifications,
  refreshUnreadCount,
  markRead,
  markAllRead,
  notificationKind,
  isInternalLink,
} from '@/stores/notifications';
import { toast } from '@/stores/toast';
import { timeAgo, formatDateTime } from '@/utils/format';

const POLL_MS = 60000;
const SHOWN = 8;

const router = useRouter();
const open = ref(false);
const root = ref(null);
const button = ref(null);
const loadError = ref(false);
const now = ref(Date.now());
let timer = null;

const shown = computed(() => notifications.items.slice(0, SHOWN));
const badge = computed(() => (notifications.unreadCount > 9 ? '9+' : String(notifications.unreadCount)));
// Unread ones that don't fit in the panel
const moreUnread = computed(() => {
  const inPanel = shown.value.filter((n) => !n.read).length;
  return Math.max(0, notifications.unreadCount - inPanel);
});

async function refreshPanel() {
  loadError.value = false;
  now.value = Date.now();
  try {
    await loadNotifications(20);
  } catch {
    loadError.value = true;
  }
}

async function toggle() {
  open.value = !open.value;
  if (open.value) await refreshPanel();
}

function close({ focusButton = false } = {}) {
  open.value = false;
  if (focusButton) button.value?.focus();
}

async function openItem(n) {
  close();
  markRead(n.id);
  if (isInternalLink(n.link)) router.push(n.link);
}

async function onMarkAll() {
  try {
    await markAllRead();
  } catch (e) {
    toast.error(e.message);
  }
}

function onClickOutside(e) {
  if (open.value && root.value && !root.value.contains(e.target)) close();
}

function onKeydown(e) {
  if (e.key === 'Escape' && open.value) close({ focusButton: true });
}

// Poll only while someone is logged in and the tab is visible. Each poll is a small
// request, so a hidden tab costs nothing and catches up as soon as it's shown again.
const isVisible = () => document.visibilityState !== 'hidden';

async function poll() {
  if (!auth.user || !isVisible()) return;
  try {
    await refreshUnreadCount({ throwErrors: true });
  } catch (e) {
    if (e.status === 401) sessionLost();
  }
}

// The cookie expired or the password was changed on another device: tell the person
// instead of leaving a page that quietly fails on every request.
async function sessionLost() {
  if (!auth.user) return;
  stopPolling();
  const user = await refreshUser();
  if (user) {
    startPolling();
    return;
  }
  toast.info('Your session has ended. Please log in again.');
  const current = router.currentRoute.value;
  if (current.meta.requiresAuth) router.push({ name: 'login', query: { redirect: current.fullPath } });
}

function startPolling() {
  stopPolling();
  if (!auth.user || !isVisible()) return;
  poll();
  timer = setInterval(poll, POLL_MS);
}

function stopPolling() {
  clearInterval(timer);
  timer = null;
}

function onVisibility() {
  if (isVisible()) startPolling();
  else stopPolling();
}

watch(
  () => auth.user?.id,
  (id) => {
    if (id) startPolling();
    else {
      stopPolling();
      open.value = false;
    }
  }
);

onMounted(() => {
  startPolling();
  document.addEventListener('click', onClickOutside);
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('visibilitychange', onVisibility);
});

onBeforeUnmount(() => {
  stopPolling();
  document.removeEventListener('click', onClickOutside);
  document.removeEventListener('keydown', onKeydown);
  document.removeEventListener('visibilitychange', onVisibility);
});

// Closing on navigation keeps the panel from hanging around over the next page
watch(
  () => router.currentRoute.value.fullPath,
  () => close()
);
</script>

<template>
  <div ref="root" class="bell-wrap">
    <button
      ref="button"
      type="button"
      class="icon-btn"
      :aria-label="
        notifications.unreadCount ? `Notifications, ${notifications.unreadCount} unread` : 'Notifications'
      "
      :aria-expanded="open ? 'true' : 'false'"
      aria-controls="notification-panel"
      @click="toggle"
    >
      <Bell :size="22" aria-hidden="true" />
      <span v-if="notifications.unreadCount" class="dot" aria-hidden="true">{{ badge }}</span>
    </button>

    <div v-if="open" id="notification-panel" class="panel card" role="region" aria-label="Notifications">
      <div class="panel-head">
        <strong>Notifications</strong>
        <button
          v-if="notifications.unreadCount"
          type="button"
          class="btn btn-ghost btn-xs"
          @click="onMarkAll"
        >
          <CheckCheck :size="16" aria-hidden="true" /> Mark all read
        </button>
      </div>

      <p v-if="notifications.loading && !notifications.items.length" class="empty" role="status">
        <Loader2 :size="18" class="spin" aria-hidden="true" /> Loading…
      </p>
      <div v-else-if="loadError && !notifications.items.length" class="empty" role="alert">
        <p>Couldn't load your notifications.</p>
        <button type="button" class="btn btn-outline btn-xs" @click="refreshPanel">
          <RotateCcw :size="14" aria-hidden="true" /> Try again
        </button>
      </div>
      <div v-else-if="!notifications.items.length" class="empty">
        <p class="empty-title">You're all caught up</p>
        <p>Sign-up decisions, matches and reminders will show up here.</p>
      </div>

      <ul v-else class="list">
        <li v-for="n in shown" :key="n.id">
          <button type="button" class="item" :class="{ unread: !n.read }" @click="openItem(n)">
            <span class="item-icon" :class="`tone-${notificationKind(n.type).tone}`" aria-hidden="true">
              <component :is="notificationKind(n.type).icon" :size="16" />
            </span>
            <span class="item-body">
              <span class="item-title">
                <span v-if="!n.read" class="sr-only">Unread:</span>
                {{ n.title }}
              </span>
              <span v-if="n.message" class="item-msg">{{ n.message }}</span>
              <time class="item-time" :datetime="n.createdAt" :title="formatDateTime(n.createdAt)">
                {{ timeAgo(n.createdAt, now) }}
              </time>
            </span>
            <span v-if="!n.read" class="unread-dot" aria-hidden="true" />
          </button>
        </li>
      </ul>

      <RouterLink to="/notification" class="see-all" @click="close()">
        See all notifications
        <span v-if="moreUnread" class="see-all-count">({{ moreUnread }} more unread)</span>
        <ArrowRight :size="16" aria-hidden="true" />
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.bell-wrap {
  position: relative;
}
.icon-btn {
  position: relative;
  border: 0;
  background: none;
  color: var(--text);
  cursor: pointer;
  padding: 9px;
  border-radius: 12px;
  display: grid;
  place-items: center;
}
.icon-btn:hover,
.icon-btn[aria-expanded='true'] {
  background: var(--hover);
}
.dot {
  position: absolute;
  top: 2px;
  right: 0;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--pink);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  display: grid;
  place-items: center;
  box-shadow: 0 0 0 2px var(--surface);
}
.panel {
  position: absolute;
  right: 0;
  top: calc(100% + 10px);
  width: min(370px, calc(100vw - 24px));
  max-height: min(480px, calc(100vh - 100px));
  display: flex;
  flex-direction: column;
  padding: 8px;
  z-index: 60;
}
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
}
.empty {
  margin: 0;
  padding: 24px 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  color: var(--muted);
}
.empty p {
  margin: 0;
}
.empty .empty-title {
  color: var(--text);
  font-weight: 700;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
.item {
  width: 100%;
  display: flex;
  gap: 10px;
  text-align: left;
  border: 0;
  background: none;
  padding: 12px 10px;
  border-radius: 12px;
  cursor: pointer;
  color: var(--text);
}
.item:hover {
  background: var(--hover);
}
.item.unread {
  background: var(--pink-tint);
}
.item.unread:hover {
  background: var(--pink-tint);
}
.item-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.tone-pink {
  background: var(--pink-soft);
  color: var(--pink-dark);
}
.tone-info {
  background: var(--info-soft);
  color: var(--info);
}
.tone-success {
  background: var(--success-soft);
  color: var(--success);
}
.tone-warning {
  background: var(--warning-soft);
  color: var(--warning);
}
.tone-muted {
  background: var(--chip);
  color: var(--muted);
}
.unread-dot {
  width: 8px;
  height: 8px;
  margin-top: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--pink);
}
.item-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.item-title {
  font-weight: 600;
  overflow-wrap: anywhere;
}
.item:not(.unread) .item-title {
  font-weight: 500;
}
.item-msg {
  color: var(--muted);
  font-size: 0.92rem;
  overflow-wrap: anywhere;
}
.item-time {
  color: var(--subtle);
  font-size: 0.8rem;
}
.see-all {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 4px;
  padding: 11px;
  border-top: 1px solid var(--border);
  font-weight: 600;
  font-size: 0.95rem;
}
.see-all-count {
  color: var(--muted);
  font-weight: 500;
}
@media (max-width: 480px) {
  .panel {
    position: fixed;
    top: 64px;
    left: 12px;
    right: 12px;
    width: auto;
  }
}
</style>
