<script setup>
import { ref, watch, onMounted } from 'vue';
import { ScrollText } from 'lucide-vue-next';
import { api, qs } from '@/api';
import UserAvatar from '@/components/UserAvatar.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import { formatDateTime, timeAgo } from '@/utils/format';

const ACTIONS = {
  'user.promote': 'made an admin:',
  'user.demote': 'removed admin from',
  'user.ban': 'banned',
  'user.unban': 'unbanned',
  'user.delete': 'deleted the account of',
  'event.disable': 'disabled',
  'event.enable': 'turned back on',
  'event.cancel': 'cancelled',
  'event.restore': 'restored',
  'event.delete': 'deleted',
};

const targetType = ref('');
const page = ref(1);
const data = ref(null);
const error = ref('');

async function load() {
  error.value = '';
  try {
    data.value = await api(`/admin/audit${qs({ targetType: targetType.value, page: page.value })}`);
  } catch (e) {
    error.value = e.message;
  }
}
watch(targetType, () => { page.value = 1; load(); });
watch(page, load);
onMounted(load);
</script>

<template>
  <div class="grid gap-5">
    <div class="flex items-center gap-3 flex-wrap">
      <label for="audit-filter" class="label">Show</label>
      <select id="audit-filter" v-model="targetType" class="select">
        <option value="">Everything</option>
        <option value="user">Account actions</option>
        <option value="event">Event actions</option>
      </select>
    </div>

    <ErrorBlock v-if="error" :message="error" @retry="load" />
    <LoadingBlock v-else-if="!data" label="Loading the audit log…" />
    <EmptyState
      v-else-if="!data.entries.length"
      :icon="ScrollText"
      title="Nothing yet"
      message="Every ban, role change and event moderation by a site admin shows up here."
    />
    <ul v-else class="log card">
      <li v-for="entry in data.entries" :key="entry.id">
        <UserAvatar :user="entry.actor" :size="32" />
        <div class="min-w-0">
          <p class="m-0">
            <strong>{{ entry.actor.displayName }}</strong>
            {{ ACTIONS[entry.action] || entry.action }}
            <RouterLink v-if="entry.targetType === 'event' && entry.action !== 'event.delete'" :to="`/events/${entry.targetId}`">{{ entry.targetLabel }}</RouterLink>
            <strong v-else>{{ entry.targetLabel }}</strong>
          </p>
          <p v-if="entry.reason" class="reason">"{{ entry.reason }}"</p>
          <time class="hint" :datetime="entry.createdAt" :title="formatDateTime(entry.createdAt)">{{ timeAgo(entry.createdAt) }}</time>
        </div>
      </li>
    </ul>
    <nav v-if="data && data.pages > 1" class="pager" aria-label="Pages">
      <button class="btn btn-outline btn-sm" :disabled="page <= 1" @click="page--">Newer</button>
      <span class="hint">Page {{ data.page }} of {{ data.pages }}</span>
      <button class="btn btn-outline btn-sm" :disabled="page >= data.pages" @click="page++">Older</button>
    </nav>
  </div>
</template>

<style scoped>
.select {
  font: inherit;
  color: var(--text);
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  padding: 8px 12px;
}
.log {
  list-style: none;
  margin: 0;
  padding: 6px 18px;
}
.log li {
  display: flex;
  gap: 12px;
  padding: 14px 0;
  border-top: 1px solid var(--border);
}
.log li:first-child {
  border-top: 0;
}
.reason {
  margin: 4px 0;
  color: var(--muted);
  font-style: italic;
}
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
</style>
