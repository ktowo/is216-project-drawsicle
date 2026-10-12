<script setup>
import { ref, computed } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { Plus, Compass, CalendarPlus, CalendarSearch, Settings2, Gift, Send, PartyPopper, PencilLine, X } from 'lucide-vue-next';
import PageHeader from '@/components/ui/PageHeader.vue';
import TabNav from '@/components/ui/TabNav.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import EventCard from '@/components/events/EventCard.vue';
import { api } from '@/api';
import { EVENT_STATUSES, EVENT_STATUS_LABELS, signupsOpen } from '@shared/constants.mjs';
import { pluralize } from '@/utils/format';
import { eventLink, isParticipant, isOrganizer } from '@/utils/events';

const TABS = ['organizing', 'participating'];
const ROLE_LABELS = { organizer: 'Organiser', participant: 'Participant', helper: 'Helper', approver: 'Approver' };

const route = useRoute();
const router = useRouter();

const organizing = ref([]);
const participating = ref([]);
const loading = ref(true);
const error = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const data = await api('/events/mine');
    organizing.value = data.organizing || [];
    participating.value = data.participating || [];
  } catch (e) {
    if (e.status === 401) {
      router.replace({ name: 'login', query: { redirect: route.fullPath } });
      return;
    }
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
load();

// Tab and status filter live in the URL so a refresh or a shared link keeps them
const tab = computed({
  get() {
    if (TABS.includes(route.query.tab)) return route.query.tab;
    // Most people join more exchanges than they run, so start there unless they only organise
    return !participating.value.length && organizing.value.length ? 'organizing' : 'participating';
  },
  set(value) {
    router.replace({ query: { ...route.query, tab: value, status: undefined } });
  },
});

const statusFilter = computed({
  get: () => (EVENT_STATUSES.includes(route.query.status) ? route.query.status : ''),
  set(value) {
    router.replace({ query: { ...route.query, tab: tab.value, status: value || undefined } });
  },
});

const tabs = computed(() => [
  { key: 'organizing', label: 'Organising', count: organizing.value.length },
  { key: 'participating', label: 'Participating', count: participating.value.length },
]);

const current = computed(() => (tab.value === 'organizing' ? organizing.value : participating.value));

// Only statuses that appear in this tab, with how many events have each
const statusOptions = computed(() =>
  EVENT_STATUSES.map((status) => ({
    value: status,
    label: EVENT_STATUS_LABELS[status],
    count: current.value.filter((e) => e.status === status).length,
  })).filter((o) => o.count > 0 || o.value === statusFilter.value)
);

const visible = computed(() =>
  statusFilter.value ? current.value.filter((e) => e.status === statusFilter.value) : current.value
);

function roleBadges(event) {
  const roles = event.viewer?.roles || [];
  const list = roles.filter((r) => ROLE_LABELS[r]).map((r) => ({ key: r, label: ROLE_LABELS[r] }));
  if (event.viewer?.isOrganizer && !roles.includes('organizer')) list.unshift({ key: 'admin', label: 'Admin' });
  return list;
}

function statsLine(event) {
  const s = event.stats;
  if (!s) return '';
  const parts = [pluralize(s.applications, 'sign-up')];
  if (s.pending) parts.push(`${s.pending} to review`);
  if (s.accepted) parts.push(`${s.accepted} accepted`);
  if (['active', 'completed'].includes(event.status)) parts.push(`${s.submitted} submitted`);
  return parts.join(' · ');
}

// Shortcuts shown on each card, most useful first
function quickLinks(event) {
  const links = [];
  const participant = isParticipant(event);
  const app = event.viewer?.applicationStatus;
  if (isOrganizer(event)) links.push({ key: 'manage', label: 'Manage', to: eventLink(event, '/manage'), icon: Settings2 });
  if (event.status === 'active' && participant) {
    links.push({ key: 'match', label: 'View match', to: eventLink(event, '/matches'), icon: Gift });
    links.push({ key: 'submit', label: 'Submit', to: eventLink(event, '/submit'), icon: Send });
  }
  if (event.status === 'completed' && (participant || isOrganizer(event))) {
    links.push({ key: 'results', label: 'Results', to: eventLink(event, '/results'), icon: PartyPopper });
  }
  if (signupsOpen(event) && (app === 'pending' || app === 'accepted')) {
    links.push({ key: 'apply', label: 'Edit sign-up', to: eventLink(event, '/apply'), icon: PencilLine });
  }
  return links;
}

const emptyCopy = computed(() =>
  tab.value === 'organizing'
    ? {
        icon: CalendarPlus,
        title: "You aren't organising any events",
        message: 'Start an art exchange for your community. You can set it up as a draft and open sign-ups when you are ready.',
      }
    : {
        icon: Compass,
        title: "You haven't joined any events yet",
        message: 'Find an exchange that suits you and sign up with your characters.',
      }
);
</script>

<template>
  <main class="page">
    <PageHeader title="My events" subtitle="The exchanges you organise and the ones you've signed up for.">
      <template #actions>
        <RouterLink to="/events" class="btn btn-outline">
          <Compass :size="18" aria-hidden="true" /> Browse events
        </RouterLink>
        <RouterLink to="/events/new" class="btn btn-primary">
          <Plus :size="18" aria-hidden="true" /> Create an event
        </RouterLink>
      </template>
    </PageHeader>

    <LoadingBlock v-if="loading" label="Loading your events…" />
    <ErrorBlock v-else-if="error" :message="error" @retry="load" />

    <template v-else>
      <div class="toolbar">
        <TabNav v-model="tab" :tabs="tabs" aria-label="Your events" />
        <div v-if="current.length" class="status-filter">
          <label for="my-events-status" class="filter-label">Status</label>
          <div class="input-wrap">
            <select id="my-events-status" v-model="statusFilter" class="select">
              <option value="">All ({{ current.length }})</option>
              <option v-for="o in statusOptions" :key="o.value" :value="o.value">{{ o.label }} ({{ o.count }})</option>
            </select>
          </div>
        </div>
      </div>

      <div role="tabpanel" :aria-label="tab === 'organizing' ? 'Organising' : 'Participating'">
        <EmptyState v-if="!current.length" :icon="emptyCopy.icon" :title="emptyCopy.title" :message="emptyCopy.message">
          <RouterLink v-if="tab === 'organizing'" to="/events/new" class="btn btn-primary">
            <Plus :size="18" aria-hidden="true" /> Create an event
          </RouterLink>
          <RouterLink v-else to="/events" class="btn btn-primary">
            <Compass :size="18" aria-hidden="true" /> Browse events
          </RouterLink>
        </EmptyState>

        <EmptyState
          v-else-if="!visible.length"
          :icon="CalendarSearch"
          title="No events with this status"
          message="Pick another status to see the rest of your events."
        >
          <button type="button" class="btn btn-outline" @click="statusFilter = ''">
            <X :size="16" aria-hidden="true" /> Show all
          </button>
        </EmptyState>

        <ul v-else class="list grid grid-cols-1 xl:grid-cols-2 gap-5">
          <li v-for="event in visible" :key="event.id" class="flex">
            <EventCard :event="event" compact class="w-full">
              <div class="extra">
                <div class="badges">
                  <span v-for="role in roleBadges(event)" :key="role.key" class="badge badge-role">{{ role.label }}</span>
                  <StatusBadge
                    v-if="tab === 'participating' && event.viewer?.applicationStatus"
                    kind="application"
                    :status="event.viewer.applicationStatus"
                  />
                </div>
                <p v-if="tab === 'organizing' && event.stats" class="stats">{{ statsLine(event) }}</p>
                <div v-if="quickLinks(event).length" class="quick-links">
                  <RouterLink
                    v-for="link in quickLinks(event)"
                    :key="link.key"
                    :to="link.to"
                    class="btn btn-outline btn-xs"
                    :aria-label="`${link.label}: ${event.name}`"
                  >
                    <component :is="link.icon" :size="14" aria-hidden="true" />
                    {{ link.label }}
                  </RouterLink>
                </div>
              </div>
            </EventCard>
          </li>
        </ul>
      </div>
    </template>
  </main>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px 20px;
  margin-bottom: 22px;
}
.toolbar > :first-child {
  min-width: 0;
  max-width: 100%;
}
.status-filter {
  display: flex;
  align-items: center;
  gap: 10px;
}
.filter-label {
  font-weight: 600;
  color: var(--muted);
  font-size: 0.92rem;
}
.status-filter .input-wrap {
  min-width: 200px;
}
.status-filter .select {
  padding: 9px 0;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.extra {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.badges .badge {
  padding: 2px 10px;
  font-size: 0.78rem;
}
.stats {
  margin: 0;
  color: var(--muted);
  font-size: 0.88rem;
  font-weight: 600;
}
.quick-links {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
@media (max-width: 520px) {
  .status-filter {
    width: 100%;
  }
  .status-filter .input-wrap {
    flex: 1;
    min-width: 0;
  }
}
</style>
