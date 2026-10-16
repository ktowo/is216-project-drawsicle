<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Search, UsersRound, LoaderCircle } from 'lucide-vue-next';
import PageHeader from '@/components/ui/PageHeader.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import ArtistCard from '@/components/discover/ArtistCard.vue';
import { api, qs } from '@/api';

// Discover artists. The URL holds the search so a link brings back the same list.
const route = useRoute();
const router = useRouter();

const items = ref([]);
const total = ref(0);
const nextCursor = ref(null);
const loading = ref(true);
const loadingMore = ref(false);
const loadedOnce = ref(false);
const error = ref('');

const q = computed(() => (typeof route.query.q === 'string' ? route.query.q.slice(0, 60) : ''));
const search = ref(q.value);

// Typing updates the URL after a short pause (replace, so each letter isn't a history entry)
let typing = null;
watch(search, (value) => {
  clearTimeout(typing);
  typing = setTimeout(() => {
    const query = { ...route.query };
    if (value.trim()) query.q = value.trim();
    else delete query.q;
    router.replace({ query });
  }, 300);
});
onBeforeUnmount(() => clearTimeout(typing));

const params = computed(() => ({ q: q.value }));

// Latest request wins when the search changes quickly
let loadId = 0;
async function load() {
  const id = ++loadId;
  loading.value = true;
  error.value = '';
  try {
    const data = await api(`/discover/artists${qs(params.value)}`);
    if (id !== loadId) return;
    items.value = data.items;
    total.value = data.total;
    nextCursor.value = data.nextCursor;
    loadedOnce.value = true;
  } catch (e) {
    if (id !== loadId) return;
    error.value = e.message || "Couldn't load artists.";
  } finally {
    if (id === loadId) loading.value = false;
  }
}

async function loadMore() {
  const id = loadId;
  loadingMore.value = true;
  try {
    const data = await api(`/discover/artists${qs({ ...params.value, cursor: nextCursor.value })}`);
    if (id !== loadId) return;
    items.value = [...items.value, ...data.items];
    nextCursor.value = data.nextCursor;
  } catch (e) {
    error.value = e.message || "Couldn't load more artists.";
  } finally {
    loadingMore.value = false;
  }
}

watch(
  () => route.query.q,
  () => {
    if (search.value.trim() !== q.value) search.value = q.value;
    load();
  },
  { immediate: true }
);

function onFollowChanged({ username, following }) {
  const card = items.value.find((c) => c.user.username === username);
  if (card) card.following = following;
}
</script>

<template>
  <main id="main" class="page discover-page">
    <PageHeader title="Discover artists" subtitle="Find artists who love what you love, and follow the ones you'd like to swap with." />

    <div class="toolbar card">
      <div class="input-wrap search">
        <Search :size="18" class="input-icon" aria-hidden="true" />
        <label for="artist-search" class="sr-only">Search artists by name or username</label>
        <input
          id="artist-search"
          v-model="search"
          class="input"
          type="search"
          autocomplete="off"
          placeholder="Search artists by name or @username"
        />
      </div>
    </div>

    <p v-if="loadedOnce && !error" class="hint count" aria-live="polite">
      {{ total }} {{ total === 1 ? 'artist' : 'artists' }}{{ q ? ` matching "${q}"` : '' }}
    </p>

    <LoadingBlock v-if="loading && !loadedOnce" label="Loading artists…" />
    <ErrorBlock v-else-if="error && !items.length" :message="error" @retry="load" />
    <EmptyState
      v-else-if="!items.length"
      :icon="UsersRound"
      title="No artists found"
      :message="q ? `Nobody matches &quot;${q}&quot; yet. Try another name.` : 'Nobody is listed on Discover yet.'"
    />
    <template v-else>
      <ul class="artist-grid" :class="{ dim: loading }" :aria-busy="loading ? 'true' : 'false'">
        <li v-for="card in items" :key="card.user.id">
          <ArtistCard :card="card" class="h-full" @follow-changed="onFollowChanged" />
        </li>
      </ul>
      <div v-if="nextCursor" class="more">
        <button type="button" class="btn btn-outline" :disabled="loadingMore" @click="loadMore">
          <LoaderCircle v-if="loadingMore" :size="18" class="spin" aria-hidden="true" />
          {{ loadingMore ? 'Loading…' : 'Load more artists' }}
        </button>
      </div>
    </template>
  </main>
</template>

<style scoped>
.discover-page {
  max-width: 1120px;
}
.toolbar {
  padding: 16px;
  margin-top: 8px;
}
.search {
  width: 100%;
}
.count {
  margin: 16px 0 12px;
}
.artist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 18px;
  margin: 0;
  padding: 0;
  list-style: none;
  transition: opacity 0.15s;
}
.artist-grid.dim {
  opacity: 0.6;
}
.more {
  display: flex;
  justify-content: center;
  margin-top: 24px;
}
</style>
