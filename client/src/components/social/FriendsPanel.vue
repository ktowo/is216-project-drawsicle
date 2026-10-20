<script setup>
import { ref, computed, onMounted, onBeforeUnmount, useId } from 'vue';
import { RouterLink } from 'vue-router';
import { Users, UserPlus, DoorOpen, RefreshCw } from 'lucide-vue-next';
import PixelHead from '@/components/museum/PixelHead.vue';
import { api } from '@/api';
import { toast } from '@/stores/toast';
import { timeAgo } from '@/utils/format';

// The friend list, museum-style: friends first (those in the museum on top, with a door to
// join them), then people who follow you, then people you follow who haven't followed back.
const props = defineProps({
  compact: { type: Boolean, default: false }, // inside the museum toolbar
  refreshMs: { type: Number, default: 30000 },
});

const uid = useId();
const data = ref(null);
const error = ref('');
const loading = ref(false);
const tab = ref('friends');
const busy = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    data.value = await api('/friends');
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
let timer = null;
onMounted(() => {
  load();
  if (props.refreshMs) timer = setInterval(load, props.refreshMs);
});
onBeforeUnmount(() => clearInterval(timer));

const TABS = [
  { key: 'friends', label: 'Friends' },
  { key: 'followers', label: 'Followers' },
  { key: 'following', label: 'Following' },
];
const rows = computed(() => data.value?.[tab.value] || []);
const onlineCount = computed(() => (data.value?.friends || []).filter((f) => f.online).length);

const EMPTY = {
  friends: 'No friends yet. Follow people from their profiles; when they follow you back, you are friends.',
  followers: 'Nobody new. People who follow you show up here until you follow them back.',
  following: "Everyone you follow has followed you back. They're in Friends.",
};

async function follow(entry, on) {
  const name = entry.user.username;
  if (!name) return;
  busy.value = entry.user.id;
  try {
    await api(`/users/${encodeURIComponent(name)}/follow`, { method: on ? 'POST' : 'DELETE' });
    if (on) toast.success(`You and ${entry.user.displayName} are friends now!`);
    await load();
  } catch (e) {
    toast.error(e.message);
  } finally {
    busy.value = '';
  }
}
</script>

<template>
  <section class="friends" :class="{ compact }" :aria-labelledby="`${uid}-title`">
    <header class="head">
      <h2 :id="`${uid}-title`" class="title">
        <Users :size="18" aria-hidden="true" /> Friends
        <span v-if="onlineCount" class="online-count">{{ onlineCount }} in the museum</span>
      </h2>
      <button type="button" class="btn btn-ghost btn-xs" :disabled="loading" aria-label="Refresh the friend list" @click="load">
        <RefreshCw :size="14" :class="{ spin: loading }" aria-hidden="true" />
      </button>
    </header>

    <div class="tabs" role="tablist" aria-label="Friend list">
      <button
        v-for="t in TABS"
        :key="t.key"
        type="button"
        role="tab"
        class="tab"
        :class="{ on: tab === t.key }"
        :aria-selected="tab === t.key ? 'true' : 'false'"
        @click="tab = t.key"
      >
        {{ t.label }} <span class="count">{{ data?.[t.key]?.length ?? 0 }}</span>
      </button>
    </div>

    <p v-if="error" class="alert alert-error m-0" role="alert">{{ error }}</p>
    <p v-else-if="!data" class="hint m-0">Loading…</p>
    <p v-else-if="!rows.length" class="hint m-0 empty">{{ EMPTY[tab] }}</p>
    <ul v-else class="list" role="tabpanel">
      <li v-for="f in rows" :key="f.user.id" class="row">
        <PixelHead :user="f.user" :size="compact ? 30 : 36" :online="Boolean(f.online)" />
        <div class="who">
          <RouterLink v-if="f.user.username" :to="`/users/${f.user.username}`" class="name">{{ f.user.displayName }}</RouterLink>
          <span v-else class="name">{{ f.user.displayName }}</span>
          <span class="where">
            <template v-if="f.online">In {{ f.online.label }}</template>
            <template v-else-if="tab === 'friends'">Friends since {{ timeAgo(f.since) }}</template>
            <template v-else-if="tab === 'followers'">Followed you {{ timeAgo(f.since) }}</template>
            <template v-else>You followed them {{ timeAgo(f.since) }}</template>
          </span>
        </div>
        <RouterLink v-if="f.online?.link" :to="f.online.link" class="btn btn-outline btn-xs" :aria-label="`Join ${f.user.displayName} in ${f.online.label}`">
          <DoorOpen :size="14" aria-hidden="true" /> Join
        </RouterLink>
        <button
          v-if="tab === 'followers'"
          type="button"
          class="btn btn-primary btn-xs"
          :disabled="busy === f.user.id || !f.user.username"
          @click="follow(f, true)"
        >
          <UserPlus :size="14" aria-hidden="true" /> Follow back
        </button>
        <button
          v-else-if="tab === 'following'"
          type="button"
          class="btn btn-ghost btn-xs"
          :disabled="busy === f.user.id || !f.user.username"
          @click="follow(f, false)"
        >
          Unfollow
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.friends {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-family: var(--font-body);
  font-size: 1.05rem;
  font-weight: 700;
}
.online-count {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--success-soft);
  color: var(--success);
  font-size: 0.75rem;
}
.tabs {
  display: flex;
  gap: 4px;
  padding: 3px;
  border-radius: 12px;
  background: var(--chip);
}
.tab {
  flex: 1;
  padding: 6px 8px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}
.tab.on {
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
.count {
  opacity: 0.7;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 420px;
  overflow-y: auto;
}
.compact .list {
  max-height: 280px;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 12px;
}
.row:hover {
  background: var(--surface-2);
}
.who {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.name {
  font-weight: 700;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.where {
  font-size: 0.8rem;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.empty {
  padding: 8px 2px;
}
</style>
