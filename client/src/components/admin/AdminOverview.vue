<script setup>
import { ref, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { Users, Ban, ShieldCheck, CalendarHeart, EyeOff, ClipboardList, Shuffle, Gift, Flag } from 'lucide-vue-next';
import { api } from '@/api';
import UserAvatar from '@/components/UserAvatar.vue';
import PersonLink from '@/components/events/PersonLink.vue';
import { linkableUser } from './helpers.js';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import { timeAgo } from '@/utils/format';

const stats = ref(null);
const error = ref('');

async function load() {
  error.value = '';
  try {
    stats.value = await api('/admin/stats');
  } catch (e) {
    error.value = e.message;
  }
}
onMounted(load);

const tiles = computed(() => {
  const s = stats.value;
  if (!s) return [];
  return [
    { label: 'Open reports', value: s.openReports ?? 0, icon: Flag, to: '/admin?tab=reports' },
    { label: 'Accounts', value: s.users.total, icon: Users, note: `${s.users.active} active` },
    { label: 'Banned', value: s.users.banned, icon: Ban, note: `${s.users.deactivated} deactivated` },
    { label: 'Site admins', value: s.users.admins, icon: ShieldCheck },
    { label: 'Events', value: s.events.total, icon: CalendarHeart, note: `${s.events.byStatus.cancelled} cancelled` },
    { label: 'Disabled events', value: s.events.disabled, icon: EyeOff },
    { label: 'Sign-ups', value: s.applications, icon: ClipboardList },
    { label: 'Published matches', value: s.matches, icon: Shuffle },
    { label: 'Gifts submitted', value: s.submissions, icon: Gift },
  ];
});
</script>

<template>
  <ErrorBlock v-if="error" :message="error" @retry="load" />
  <LoadingBlock v-else-if="!stats" label="Loading site stats…" />
  <div v-else class="grid gap-6">
    <ul class="tiles">
      <li v-for="t in tiles" :key="t.label" class="card tile">
        <component :is="t.icon" :size="20" class="text-brand" aria-hidden="true" />
        <span class="tile-value">{{ t.value }}</span>
        <span class="tile-label">{{ t.label }}</span>
        <span v-if="t.note" class="hint">{{ t.note }}</span>
        <RouterLink v-if="t.to && t.value" :to="t.to" class="hint">Review them</RouterLink>
      </li>
    </ul>

    <section class="card p-5">
      <h2 class="section-title">Events by status</h2>
      <ul class="flex flex-wrap gap-3 mt-3">
        <li v-for="(count, status) in stats.events.byStatus" :key="status" class="flex items-center gap-2">
          <StatusBadge :status="status" />
          <span class="font-semibold">{{ count }}</span>
        </li>
      </ul>
    </section>

    <div class="grid gap-6 md:grid-cols-2">
      <section class="card p-5">
        <h2 class="section-title">Newest accounts</h2>
        <ul class="recent">
          <li v-for="u in stats.recent.users" :key="u.id">
            <UserAvatar :user="u" :size="32" />
            <span class="min-w-0">
              <PersonLink :user="linkableUser(u)" :size="0" class="block" />
              <span class="hint">{{ u.email }} · joined {{ timeAgo(u.createdAt) }}</span>
            </span>
            <StatusBadge kind="user" :status="u.status" class="ml-auto" />
          </li>
        </ul>
      </section>
      <section class="card p-5">
        <h2 class="section-title">Newest events</h2>
        <ul class="recent">
          <li v-for="e in stats.recent.events" :key="e.id">
            <RouterLink :to="`/events/${e.id}`" class="font-semibold truncate">{{ e.name }}</RouterLink>
            <StatusBadge :status="e.status" class="ml-auto" />
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.tiles {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 16px;
}
.tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 18px 20px;
}
.tile-value {
  font-family: var(--font-display);
  font-size: 1.9rem;
  font-weight: 700;
  line-height: 1.1;
}
.tile-label {
  font-weight: 600;
}
.section-title {
  font-family: var(--font-body);
  font-size: 1.1rem;
  font-weight: 700;
}
.recent {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
}
.recent li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid var(--border);
}
.recent li:first-child {
  border-top: 0;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
