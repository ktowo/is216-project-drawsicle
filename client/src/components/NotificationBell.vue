<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { Bell, CheckCheck } from 'lucide-vue-next';
import {
  notifications,
  loadNotifications,
  refreshUnreadCount,
  markRead,
  markAllRead,
} from '../stores/notifications';

const router = useRouter();
const open = ref(false);
const root = ref(null);
let timer = null;

async function toggle() {
  open.value = !open.value;
  if (open.value) await loadNotifications().catch(() => {});
}

async function openItem(n) {
  await markRead(n.id);
  open.value = false;
  if (n.link) router.push(n.link);
}

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function onClickOutside(e) {
  if (open.value && root.value && !root.value.contains(e.target)) open.value = false;
}

onMounted(() => {
  refreshUnreadCount();
  timer = setInterval(refreshUnreadCount, 30000); // check every 30s
  document.addEventListener('click', onClickOutside);
});
onBeforeUnmount(() => {
  clearInterval(timer);
  document.removeEventListener('click', onClickOutside);
});
</script>

<template>
  <div ref="root" class="bell-wrap">
    <button
      class="icon-btn"
      :aria-label="`Notifications (${notifications.unreadCount} unread)`"
      :aria-expanded="open"
      @click="toggle"
    >
      <Bell :size="24" />
      <span v-if="notifications.unreadCount" class="dot">
        {{ notifications.unreadCount > 9 ? '9+' : notifications.unreadCount }}
      </span>
    </button>

    <div v-if="open" class="panel card" role="menu">
      <div class="panel-head">
        <strong>Notifications</strong>
        <button v-if="notifications.unreadCount" class="btn btn-ghost small" @click="markAllRead">
          <CheckCheck :size="16" /> Mark all read
        </button>
      </div>

      <p v-if="notifications.loading && !notifications.items.length" class="empty">Loading…</p>
      <p v-else-if="!notifications.items.length" class="empty">You're all caught up ✨</p>

      <ul v-else class="list">
        <li v-for="n in notifications.items" :key="n.id">
          <button class="item" :class="{ unread: !n.read }" @click="openItem(n)">
            <span class="unread-dot" aria-hidden="true" />
            <span class="item-body">
              <span class="item-title">{{ n.title }}</span>
              <span v-if="n.message" class="item-msg">{{ n.message }}</span>
              <span class="item-time">{{ timeAgo(n.createdAt) }}</span>
            </span>
          </button>
        </li>
      </ul>
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
  padding: 8px;
  border-radius: 12px;
  display: grid;
  place-items: center;
}
.icon-btn:hover {
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
}
.panel {
  position: absolute;
  right: 0;
  top: calc(100% + 10px);
  width: min(360px, calc(100vw - 32px));
  max-height: 440px;
  overflow-y: auto;
  padding: 8px;
  z-index: 50;
}
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
}
.small {
  font-size: 0.85rem;
  padding: 6px 10px;
  gap: 6px;
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
}
.item-title {
  font-weight: 600;
}
.item-msg {
  color: var(--muted);
  font-size: 0.92rem;
}
.item-time {
  color: #b39c80;
  font-size: 0.8rem;
}
</style>
