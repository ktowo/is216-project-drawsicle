<script setup>
import { ref, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { History, ArrowRight } from 'lucide-vue-next';
import { api } from '@/api';
import { notificationKind, isInternalLink } from '@/stores/notifications';
import { timeAgo } from '@/utils/format';

// The last few notifications, as a feed on the dashboard
const LIMIT = 5;

const items = ref([]);
const loaded = ref(false);
const failed = ref(false);

onMounted(async () => {
  try {
    const data = await api(`/notifications?limit=${LIMIT}`);
    items.value = data.items || [];
  } catch {
    failed.value = true;
  } finally {
    loaded.value = true;
  }
});
</script>

<template>
  <section class="card panel" aria-labelledby="activity-title">
    <h2 id="activity-title" class="panel-title"><History :size="22" aria-hidden="true" /> Recent activity</h2>
    <p v-if="!loaded" class="note">Loading…</p>
    <p v-else-if="failed" class="note">Couldn't load your activity. It's all in your notifications.</p>
    <p v-else-if="!items.length" class="note">
      Nothing yet. Sign-ups, matches and reminders from your events will show up here.
    </p>
    <ul v-else class="feed">
      <li v-for="n in items" :key="n.id" class="feed-item" :class="{ unread: !n.read }">
        <span class="feed-icon" :class="`tone-${notificationKind(n.type).tone}`" aria-hidden="true">
          <component :is="notificationKind(n.type).icon" :size="15" />
        </span>
        <div class="min-w-0 flex-1">
          <RouterLink v-if="isInternalLink(n.link)" :to="n.link" class="feed-title">{{ n.title }}</RouterLink>
          <p v-else class="feed-title">{{ n.title }}</p>
          <p class="feed-time">
            <time :datetime="n.createdAt">{{ timeAgo(n.createdAt) }}</time>
            <span v-if="!n.read" class="sr-only">, unread</span>
          </p>
        </div>
        <span v-if="!n.read" class="dot" aria-hidden="true" />
      </li>
    </ul>
    <RouterLink v-if="loaded" to="/notifications" class="all-link">
      All notifications <ArrowRight :size="14" aria-hidden="true" />
    </RouterLink>
  </section>
</template>

<style scoped>
/* Same as the dashboard's other panels */
.panel {
  padding: 22px 24px;
}
.panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 1.2rem;
}
.note {
  margin: 8px 0 0;
  color: var(--muted);
}
.feed {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}
.feed-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid var(--border);
}
.feed-item:first-child {
  border-top: 0;
}
.feed-icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 10px;
  flex-shrink: 0;
  background: var(--chip);
  color: var(--muted);
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
.feed-title {
  display: block;
  margin: 0;
  font-weight: 600;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
a.feed-title:hover {
  color: var(--pink-dark);
}
.feed-time {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 0.85rem;
}
.dot {
  width: 8px;
  height: 8px;
  margin-top: 8px;
  border-radius: 50%;
  background: var(--pink);
  flex-shrink: 0;
}
.all-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
  font-weight: 600;
  font-size: 0.92rem;
}
</style>
