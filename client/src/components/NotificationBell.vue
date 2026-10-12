<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import { Bell, CheckCheck, ArrowRight } from 'lucide-vue-next';
import { auth, refreshUser } from '@/stores/auth';
import {
  notifications,
  loadNotifications,
  refreshUnreadCount,
  markRead,
  markAllRead,
} from '@/stores/notifications';
import { toast } from '@/stores/toast';
import { timeAgo } from '@/utils/format';

const POLL_MS = 60000;
const SHOWN = 8;

const router = useRouter();
const open = ref(false);
const root = ref(null);
const button = ref(null);
const loadError = ref(false);
let timer = null;

const shown = computed(() => notifications.items.slice(0, SHOWN));
const badge = computed(() => (notifications.unreadCount > 9 ? '9+' : String(notifications.unreadCount)));

async function toggle() {
  open.value = !open.value;
  if (!open.value) return;
  loadError.value = false;
  try {
    await loadNotifications(20);
  } catch {
    loadError.value = true;
  }
}

function close({ focusButton = false } = {}) {
  open.value = false;
  if (focusButton) button.value?.focus();
}

// Notification links are in-app paths like /events/123; anything else is ignored
const isInternal = (link) => typeof link === 'string' && link.startsWith('/') && !link.startsWith('//');

async function openItem(n) {
  close();
  markRead(n.id);
  if (isInternal(n.link)) router.push(n.link);
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

      <p v-if="notifications.loading && !notifications.items.length" class="empty">Loading…</p>
      <p v-else-if="loadError && !notifications.items.length" class="empty">Couldn't load notifications.</p>
      <p v-else-if="!notifications.items.length" class="empty">You're all caught up.</p>

      <ul v-else class="list">
        <li v-for="n in shown" :key="n.id">
          <button type="button" class="item" :class="{ unread: !n.read }" @click="openItem(n)">
            <span class="unread-dot" aria-hidden="true" />
            <span class="item-body">
              <span class="item-title">
                {{ n.title }}
                <span v-if="!n.read" class="sr-only">(unread)</span>
              </span>
              <span v-if="n.message" class="item-msg">{{ n.message }}</span>
              <span class="item-time">{{ timeAgo(n.createdAt) }}</span>
            </span>
          </button>
        </li>
      </ul>

      <RouterLink to="/notification" class="see-all" @click="close()">
        See all notifications <ArrowRight :size="16" aria-hidden="true" />
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
  background: #f5eee1;
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
  padding: 24px 10px;
  text-align: center;
  color: var(--muted);
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
  background: #faf3e7;
}
.unread-dot {
  width: 8px;
  height: 8px;
  margin-top: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: transparent;
}
.item.unread .unread-dot {
  background: var(--pink);
}
.item-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
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
  color: #a88d6e;
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
