<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { Landmark, DoorOpen, ImageOff, Images } from 'lucide-vue-next';
import PageHeader from '@/components/ui/PageHeader.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import MuseumExperience from '@/components/museum/MuseumExperience.vue';
import { api, assetUrl } from '@/api';
import { formatDate, pluralize } from '@/utils/format';

// The public museum. /museum is the lobby with a wing for each finished public exchange;
// /museum/:eventId walks you round that wing.
const route = useRoute();

const loading = ref(true);
const error = ref('');
const notFound = ref(false);
const wings = ref([]);
const wing = ref(null); // { event, artworks }

const wingId = computed(() => (typeof route.params.eventId === 'string' ? route.params.eventId : ''));

let requestId = 0;
async function load() {
  const id = ++requestId;
  loading.value = true;
  error.value = '';
  notFound.value = false;
  try {
    if (wingId.value) {
      const data = await api(`/museum/${wingId.value}`);
      if (id !== requestId) return;
      wing.value = data;
      document.title = `${data.event.name} · The museum · Drawsicle`;
    } else {
      const data = await api('/museum');
      if (id !== requestId) return;
      wing.value = null;
      wings.value = data.wings || [];
      document.title = 'The museum · Drawsicle';
    }
  } catch (e) {
    if (id !== requestId) return;
    if (e.status === 404) notFound.value = true;
    else error.value = e.message;
  } finally {
    if (id === requestId) loading.value = false;
  }
}
watch(wingId, load, { immediate: true });
</script>

<template>
  <main id="main" class="page" tabindex="-1">
    <LoadingBlock v-if="loading" :label="wingId ? 'Opening the doors…' : 'Opening the museum…'" />
    <template v-else-if="notFound">
      <PageHeader title="The museum" back="/museum" back-label="Museum lobby" />
      <EmptyState
        :icon="ImageOff"
        title="This wing isn't open"
        message="Its exchange may not be finished yet, or nobody in it chose to show their gifts publicly."
      >
        <RouterLink to="/museum" class="btn btn-primary">Back to the lobby</RouterLink>
      </EmptyState>
    </template>
    <template v-else-if="error">
      <PageHeader title="The museum" />
      <ErrorBlock :message="error" @retry="load" />
    </template>

    <!-- A wing -->
    <template v-else-if="wing">
      <PageHeader
        :title="wing.event.name"
        :subtitle="`${pluralize(wing.artworks.length, 'artwork')}${wing.event.completedAt ? `, revealed ${formatDate(wing.event.completedAt)}` : ''}`"
        back="/museum"
        back-label="Museum lobby"
      >
        <RouterLink :to="`/events/${wing.event.id}`" class="btn btn-outline btn-sm">About the exchange</RouterLink>
      </PageHeader>
      <MuseumExperience :items="wing.artworks" class="mt-6" />
      <p class="hint mt-4">
        Only gifts that both the artist and the person they made it for chose to show on their profiles hang here.
      </p>
    </template>

    <!-- The lobby -->
    <template v-else>
      <header class="lobby-head">
        <span class="lobby-icon" aria-hidden="true"><Landmark :size="30" /></span>
        <div>
          <h1 class="lobby-title">The Drawsicle museum</h1>
          <p class="lobby-sub">
            Wander the halls of finished exchanges. Walk your little avatar up to any picture to take a closer look.
          </p>
        </div>
      </header>

      <EmptyState
        v-if="!wings.length"
        :icon="Images"
        title="The halls are empty for now"
        message="When a public exchange finishes and people choose to show their gifts, its wing opens here."
      />
      <ul v-else class="wings">
        <li v-for="w in wings" :key="w.event.id">
          <RouterLink :to="`/museum/${w.event.id}`" class="wing card">
            <span class="wing-cover">
              <img v-if="w.cover" :src="assetUrl(w.cover)" alt="" loading="lazy" />
              <Landmark v-else :size="34" aria-hidden="true" />
            </span>
            <span class="wing-body">
              <span class="wing-name">{{ w.event.name }}</span>
              <span class="wing-meta">
                {{ pluralize(w.count, 'artwork') }}<template v-if="w.event.completedAt"> · {{ formatDate(w.event.completedAt) }}</template>
              </span>
              <span class="wing-enter"><DoorOpen :size="15" aria-hidden="true" /> Enter this wing</span>
            </span>
          </RouterLink>
        </li>
      </ul>
    </template>
  </main>
</template>

<style scoped>
.lobby-head {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}
.lobby-icon {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 20px;
  background: var(--pink-soft);
  color: var(--pink-dark);
}
.lobby-title {
  margin: 0;
  font-size: clamp(1.7rem, 4vw, 2.4rem);
}
.lobby-sub {
  margin: 4px 0 0;
  color: var(--muted);
  max-width: 60ch;
}
.wings {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
}
.wing {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  color: inherit;
  text-decoration: none;
  transition: transform 0.15s, box-shadow 0.15s;
}
.wing:hover {
  transform: translateY(-2px);
}
.wing:focus-visible {
  outline: 3px solid var(--pink);
  outline-offset: 2px;
}
.wing-cover {
  display: grid;
  place-items: center;
  aspect-ratio: 16 / 9;
  background: #232838;
  color: #f3eaf0;
}
.wing-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.wing-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
}
.wing-name {
  font-weight: 700;
  font-size: 1.05rem;
}
.wing-meta {
  font-size: 0.88rem;
  color: var(--muted);
}
.wing-enter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-weight: 700;
  color: var(--pink-dark);
}
@media (prefers-reduced-motion: reduce) {
  .wing {
    transition: none;
  }
  .wing:hover {
    transform: none;
  }
}
</style>
