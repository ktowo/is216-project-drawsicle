<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { Search, UsersRound, LoaderCircle, SlidersHorizontal, X, Sparkles, ArrowRight } from 'lucide-vue-next';
import PageHeader from '@/components/ui/PageHeader.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import ArtistCard from '@/components/discover/ArtistCard.vue';
import ChoiceChips from '@/components/ui/ChoiceChips.vue';
import { api, qs } from '@/api';
import { auth } from '@/stores/auth';
import { CREATION_TYPES } from '@shared/constants.mjs';
import { THEMES, artistTagsOf } from '@shared/taste.mjs';
import { loadQuiz, hasAnswers, tasteQuery } from '@/utils/styleQuiz';

// Discover artists. The URL holds the search, filters and sort, so a link (or the back button)
// brings back the same list.
const BASE_SORTS = [
  { value: '', label: 'Most to see' },
  { value: 'newest', label: 'Newest' },
  { value: 'exchanges', label: 'Most exchanges' },
];

// "Recommended" needs a taste: your saved artist tags, or quiz answers in this browser
const quiz = loadQuiz();
const quizTaste = hasAnswers(quiz.answers) ? tasteQuery(quiz.answers) : null;
const ownTags = computed(() => {
  const t = artistTagsOf(auth.user?.artistTags);
  return t.makes.length || t.themes.length;
});
const hasTaste = computed(() => Boolean(ownTags.value || quizTaste));
const SORTS = computed(() => (hasTaste.value ? [{ value: 'recommended', label: 'Recommended for you' }, ...BASE_SORTS] : BASE_SORTS));
const THEME_OPTIONS = THEMES.map(({ value, label }) => ({ value, label }));
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

const listFrom = (value, allowed) =>
  typeof value === 'string' ? value.split(',').filter((v) => allowed.includes(v)) : [];
const makes = computed(() => listFrom(route.query.makes, CREATION_TYPES.map((t) => t.value)));
const themes = computed(() => listFrom(route.query.themes, THEME_OPTIONS.map((t) => t.value)));
const extras = computed(() => [
  ...(route.query.hasGifts === 'true' ? ['hasGifts'] : []),
  ...(route.query.following === 'true' && auth.user ? ['following'] : []),
]);
const sort = computed(() => (SORTS.value.some((s) => s.value === route.query.sort) ? route.query.sort : ''));
const extraOptions = computed(() => [
  { value: 'hasGifts', label: 'Has gifts to see' },
  ...(auth.user ? [{ value: 'following', label: 'People I follow' }] : []),
]);
const activeFilters = computed(() => makes.value.length + themes.value.length + extras.value.length);

// Filter and sort changes are history entries, so Back undoes them
function setQuery(changes) {
  const query = { ...route.query, ...changes };
  for (const [key, value] of Object.entries(query)) {
    if (value === '' || value === undefined || value === null || (Array.isArray(value) && !value.length)) delete query[key];
    else if (Array.isArray(value)) query[key] = value.join(',');
  }
  router.push({ query });
}
const setExtras = (values) =>
  setQuery({ hasGifts: values.includes('hasGifts') ? 'true' : '', following: values.includes('following') ? 'true' : '' });
function clearFilters() {
  search.value = '';
  router.push({ query: {} });
}

const params = computed(() => ({
  q: q.value,
  makes: makes.value.join(','),
  themes: themes.value.join(','),
  hasGifts: extras.value.includes('hasGifts') ? 'true' : '',
  following: extras.value.includes('following') ? 'true' : '',
  sort: sort.value,
  // Quiz answers only stand in when you haven't saved artist tags yet
  ...(sort.value === 'recommended' && !ownTags.value && quizTaste ? quizTaste : {}),
}));
const filtersOpen = ref(false);

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
  () => JSON.stringify(params.value),
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

    <RouterLink v-if="!hasTaste" to="/find-your-style" class="card quiz-banner">
      <Sparkles :size="22" aria-hidden="true" class="quiz-icon" />
      <span>
        <strong>Not sure where to start?</strong>
        Take the 1-minute Find your style quiz and we'll suggest artists and events for you.
      </span>
      <ArrowRight :size="20" aria-hidden="true" />
    </RouterLink>
    <p v-else-if="sort !== 'recommended'" class="hint taste-note">
      <button type="button" class="link-btn" @click="setQuery({ sort: 'recommended' })">
        <Sparkles :size="15" aria-hidden="true" /> Show artists recommended for you
      </button>
      · <RouterLink to="/find-your-style">Retake the quiz</RouterLink>
    </p>

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

      <div class="toolbar-row">
        <button
          type="button"
          class="btn btn-outline btn-sm filters-toggle"
          :aria-expanded="filtersOpen ? 'true' : 'false'"
          aria-controls="discover-filters"
          @click="filtersOpen = !filtersOpen"
        >
          <SlidersHorizontal :size="16" aria-hidden="true" /> Filters
          <span v-if="activeFilters" class="filter-count">{{ activeFilters }}</span>
        </button>
        <label class="sort">
          <span class="label-inline">Sort by</span>
          <select class="select" :value="sort" @change="setQuery({ sort: $event.target.value })">
            <option v-for="s in SORTS" :key="s.value" :value="s.value">{{ s.label }}</option>
          </select>
        </label>
        <button v-if="activeFilters || q" type="button" class="btn btn-ghost btn-sm" @click="clearFilters">
          <X :size="16" aria-hidden="true" /> Clear
        </button>
      </div>

      <div id="discover-filters" class="filters" :class="{ open: filtersOpen }">
        <div class="filter-group">
          <p id="filter-makes" class="label">Makes</p>
          <ChoiceChips :model-value="makes" :options="CREATION_TYPES" aria-labelledby="filter-makes" @update:model-value="setQuery({ makes: $event })" />
        </div>
        <div class="filter-group">
          <p id="filter-themes" class="label">Loves</p>
          <ChoiceChips :model-value="themes" :options="THEME_OPTIONS" aria-labelledby="filter-themes" @update:model-value="setQuery({ themes: $event })" />
        </div>
        <div class="filter-group">
          <p id="filter-more" class="label">Only show</p>
          <ChoiceChips :model-value="extras" :options="extraOptions" aria-labelledby="filter-more" @update:model-value="setExtras" />
        </div>
      </div>
    </div>

    <p v-if="loadedOnce && !error" class="hint count" aria-live="polite">
      {{ total }} {{ total === 1 ? 'artist' : 'artists' }}{{ q ? ` matching "${q}"` : '' }}{{
        activeFilters ? ` with ${activeFilters} ${activeFilters === 1 ? 'filter' : 'filters'}` : ''
      }}
    </p>

    <LoadingBlock v-if="loading && !loadedOnce" label="Loading artists…" />
    <ErrorBlock v-else-if="error && !items.length" :message="error" @retry="load" />
    <EmptyState
      v-else-if="!items.length"
      :icon="UsersRound"
      title="No artists found"
      :message="
        q || activeFilters
          ? 'Nobody matches all of that yet. Try fewer filters or another name.'
          : 'Nobody is listed on Discover yet.'
      "
    >
      <button v-if="q || activeFilters" type="button" class="btn btn-primary btn-sm" @click="clearFilters">
        Clear filters
      </button>
    </EmptyState>
    <template v-else>
      <ul class="artist-grid" :class="{ dim: loading }" :aria-busy="loading ? 'true' : 'false'">
        <li v-for="card in items" :key="card.user.id">
          <ArtistCard :card="card" :reasons="card.reasons || []" class="h-full" @follow-changed="onFollowChanged" />
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
.quiz-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px;
  margin-top: 8px;
  color: var(--text);
  background: linear-gradient(120deg, var(--pink-soft), var(--surface));
}
.quiz-banner:hover {
  color: var(--pink-dark);
}
.quiz-icon {
  flex-shrink: 0;
  color: var(--pink-dark);
}
.taste-note {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 8px 0 0;
}
.link-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--pink-dark);
  font-weight: 700;
  cursor: pointer;
}
.toolbar {
  padding: 16px;
  margin-top: 8px;
}
.search {
  width: 100%;
}
.toolbar-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}
.filter-count {
  min-width: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--pink);
  color: #fff;
  font-size: 0.78rem;
  font-weight: 700;
}
.sort {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.label-inline {
  font-weight: 600;
  font-size: 0.9rem;
}
.filters {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 14px;
}
.filter-group .label {
  margin: 0 0 6px;
}
/* Desktop always shows the filters; phones fold them behind the Filters button */
.filters-toggle {
  display: none;
}
@media (max-width: 720px) {
  .filters-toggle {
    display: inline-flex;
  }
  .filters {
    display: none;
  }
  .filters.open {
    display: flex;
  }
  .sort {
    margin-left: 0;
  }
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
