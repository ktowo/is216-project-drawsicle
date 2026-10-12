<script setup>
import ModerationNotice from '@/components/events/ModerationNotice.vue';
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { ArrowLeft, CalendarSearch, ExternalLink, Pencil, Lock, Globe, Users } from 'lucide-vue-next';
import EventBanner from '@/components/events/EventBanner.vue';
import LifecycleStepper from '@/components/events/LifecycleStepper.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import TabNav from '@/components/ui/TabNav.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import OverviewPanel from '@/components/events/manage/OverviewPanel.vue';
import ParticipantsPanel from '@/components/events/manage/ParticipantsPanel.vue';
import MatchingPanel from '@/components/events/manage/MatchingPanel.vue';
import SubmissionsPanel from '@/components/events/manage/SubmissionsPanel.vue';
import SettingsPanel from '@/components/events/manage/SettingsPanel.vue';
import { MANAGE_TABS } from '@/components/events/manage/helpers';
import { api } from '@/api';
import { seasonLabel, eventLink } from '@/utils/events';

const route = useRoute();
const router = useRouter();

const event = ref(null);
const loading = ref(true);
const error = ref('');
const notFound = ref(false);

let requestId = 0;
async function load({ quiet = false } = {}) {
  const id = ++requestId;
  if (!quiet) loading.value = true;
  error.value = '';
  notFound.value = false;
  try {
    const data = await api(`/events/${route.params.id}`);
    if (id !== requestId) return;
    if (!data.event?.viewer?.isOrganizer) {
      router.replace({ name: 'forbidden' });
      return;
    }
    event.value = data.event;
  } catch (e) {
    if (id !== requestId) return;
    if (e.status === 401) {
      router.replace({ name: 'login', query: { redirect: route.fullPath } });
      return;
    }
    if (e.status === 403) {
      router.replace({ name: 'forbidden' });
      return;
    }
    // A quiet refresh that fails keeps the page we have; the panels show their own errors
    if (quiet && event.value && e.status !== 404) return;
    if (e.status === 404 || e.code === 'INVALID_ID') notFound.value = true;
    else error.value = e.message;
    event.value = null;
  } finally {
    if (id === requestId) loading.value = false;
  }
}

watch(
  () => route.params.id,
  (id) => {
    if (id && route.name === 'event-manage') {
      event.value = null;
      load();
    }
  },
  { immediate: true }
);

// The router resets the title after every navigation, tab changes included
watch(
  () => [event.value?.name, route.fullPath],
  ([name]) => {
    if (name && route.name === 'event-manage') document.title = `Manage ${name} · Drawisicle`;
  }
);

// ---- Tabs, kept in ?tab= so a link (or a notification) can open the right one ----
const TAB_LABELS = {
  overview: 'Overview',
  participants: 'Participants',
  matching: 'Matching',
  submissions: 'Submissions',
  settings: 'Settings',
};

const tab = computed({
  get: () => (MANAGE_TABS.includes(route.query.tab) ? route.query.tab : 'overview'),
  set: (key) => {
    const query = { ...route.query };
    if (key === 'overview') delete query.tab;
    else query.tab = key;
    router.replace({ query });
  },
});

const tabs = computed(() =>
  MANAGE_TABS.map((key) => ({
    key,
    label: TAB_LABELS[key],
    count: key === 'participants' ? event.value?.participantCount ?? undefined : undefined,
  }))
);

function setTab(key) {
  if (MANAGE_TABS.includes(key)) tab.value = key;
}

// ---- Panel events ----
function onUpdated(updated) {
  if (updated?.id === event.value?.id) event.value = { ...event.value, ...updated };
}

function onLeft() {
  router.push(eventLink(route.params.id));
}

const meta = computed(() => {
  const ev = event.value;
  if (!ev) return [];
  const parts = [];
  if (ev.theme) parts.push(`Theme: ${ev.theme}`);
  if (ev.season && ev.season !== 'other') parts.push(seasonLabel(ev.season));
  return parts;
});
</script>

<template>
  <main class="page">
    <LoadingBlock v-if="loading" label="Loading event…" />

    <EmptyState
      v-else-if="notFound"
      :icon="CalendarSearch"
      title="Event not found"
      message="It may have been deleted, or the link is wrong."
    >
      <RouterLink to="/my-events" class="btn btn-primary">Go to my events</RouterLink>
    </EmptyState>

    <ErrorBlock v-else-if="error" :message="error" @retry="load" />

    <template v-else-if="event">
      <RouterLink to="/my-events" class="back-link">
        <ArrowLeft :size="16" aria-hidden="true" /> My events
      </RouterLink>

      <header class="card manage-head">
        <ModerationNotice :event="event" />
        <EventBanner :event="event" :height="112" class="head-banner" />
        <div class="head-body">
          <div class="flex flex-wrap items-center gap-2">
            <StatusBadge :status="event.status" />
            <span class="pill">
              <component :is="event.publicity === 'private' ? Lock : Globe" :size="14" aria-hidden="true" />
              {{ event.publicity === 'private' ? 'Private, invite only' : 'Public' }}
            </span>
            <span class="pill">
              <Users :size="14" aria-hidden="true" />
              {{ event.participantCount }} / {{ event.maxParticipants }}
              <span class="sr-only">accepted participants</span>
            </span>
          </div>
          <div class="head-row">
            <div class="min-w-0">
              <p class="eyebrow">Manage event</p>
              <h1 class="title">{{ event.name }}</h1>
              <p v-if="meta.length" class="meta">{{ meta.join(' · ') }}</p>
            </div>
            <div class="head-actions">
              <RouterLink :to="eventLink(event)" class="btn btn-outline btn-sm">
                <ExternalLink :size="16" aria-hidden="true" /> View event page
              </RouterLink>
              <RouterLink v-if="event.status !== 'completed'" :to="eventLink(event, '/edit')" class="btn btn-outline btn-sm">
                <Pencil :size="16" aria-hidden="true" /> Edit details
              </RouterLink>
            </div>
          </div>
        </div>
      </header>

      <LifecycleStepper :status="event.status" class="lifecycle" />

      <nav class="tabs-row" aria-label="Manage sections">
        <TabNav v-model="tab" :tabs="tabs" />
      </nav>

      <div role="tabpanel" :aria-label="TAB_LABELS[tab]" class="panel">
        <OverviewPanel v-if="tab === 'overview'" :key="event.id" :event="event" @updated="onUpdated" @go="setTab" />
        <ParticipantsPanel
          v-else-if="tab === 'participants'"
          :key="event.id"
          :event="event"
          @reload="load({ quiet: true })"
        />
        <MatchingPanel
          v-else-if="tab === 'matching'"
          :key="event.id"
          :event="event"
          @updated="onUpdated"
          @go="setTab"
        />
        <SubmissionsPanel v-else-if="tab === 'submissions'" :key="event.id" :event="event" />
        <SettingsPanel v-else :key="event.id" :event="event" @updated="onUpdated" @left="onLeft" />
      </div>
    </template>
  </main>
</template>

<style scoped>
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 14px;
  color: var(--muted);
  font-weight: 600;
  font-size: 0.95rem;
}
.back-link:hover {
  color: var(--pink-dark);
}
.manage-head {
  overflow: hidden;
}
.head-banner {
  display: block;
}
.head-body {
  padding: 18px 24px 22px;
}
.head-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px 24px;
  margin-top: 10px;
}
.eyebrow {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--pink-dark);
}
.title {
  margin-top: 2px;
  font-size: clamp(1.6rem, 4vw, 2.2rem);
  font-weight: 800;
  overflow-wrap: anywhere;
}
.meta {
  margin: 4px 0 0;
  color: var(--muted);
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--hover);
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 600;
}
.head-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.lifecycle {
  margin-top: 20px;
}
.tabs-row {
  margin-top: 24px;
}
.panel {
  margin-top: 20px;
  outline: none;
}
@media (max-width: 640px) {
  .head-body {
    padding: 16px 16px 18px;
  }
  .head-actions {
    width: 100%;
  }
  .head-actions > * {
    flex: 1 1 auto;
  }
}
</style>
