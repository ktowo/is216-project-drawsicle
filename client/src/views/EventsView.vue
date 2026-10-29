<script setup>
import { ref, reactive, computed, watch, onBeforeUnmount } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { Plus, CalendarSearch, ChevronLeft, ChevronRight, } from 'lucide-vue-next';
import PageHeader from '@/components/ui/PageHeader.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import EventCard from '@/components/events/EventCard.vue';
import { api, qs } from '@/api';
import { auth } from '@/stores/auth';
import { SEASONS, LIMITS } from '@shared/constants.mjs';
import { pluralize } from '@/utils/format';
import SearchBar from '@/components/search/SearchBar.vue';
import ResultHeader from '@/components/search/ResultHeader.vue';
import FilterButton from '@/components/search/FilterButton.vue';
import SearchBar from '@/components/search/SearchBar.vue';
import ResultHeader from '@/components/search/ResultHeader.vue';
import FilterButton from '@/components/search/FilterButton.vue';

const STATUS_FILTERS = [
  { value: 'open', label: 'Open for sign-ups' },
  { value: 'matching', label: 'Matching' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'upcoming', label: 'All upcoming' },
  { value: 'all', label: 'Everything' },
];
const SORTS = [
  { value: 'deadline', label: 'Deadline soonest' },
  { value: 'newest', label: 'Newest' },
  { value: 'popular', label: 'Most participants' },
];
const DEFAULTS = { status: 'upcoming', season: '', q: '', minParticipants: '', maxParticipants: '', sort: 'deadline', page: 1 };
const PAGE_SIZE = 12;

const route = useRoute();
const router = useRouter();

const events = ref([]);
const total = ref(0);
const pages = ref(1);
const loading = ref(true);
const loadedOnce = ref(false);
const error = ref('');

// Text inputs update the URL after a short pause; the URL is the source of truth.
const search = ref('');
const minInput = ref('');
const maxInput = ref('');
const searchInput = ref(null);
const minEl = ref(null);
const maxEl = ref(null);
const resultsTop = ref(null);

const filters = reactive({ ...DEFAULTS });
const filtersOpen = ref(false);
const filterCount = computed(() => 
  Object.entries(filters)
  .filter(filter => !['page', 'q', 'sort'].includes(filter[0]))
  .filter(filter => filter[1] !== DEFAULTS[filter[0]])
  .length
)

function wholeNumber(value) {
  if (value === undefined || value === null || value === '') return '';
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= LIMITS.maxParticipantsCeiling ? n : '';
}

function readQuery(query) {
  const pick = (list, value, fallback) => (list.some((x) => x.value === value) ? value : fallback);
  const page = Number(query.page);
  return {
    status: pick(STATUS_FILTERS, query.status, DEFAULTS.status),
    season: pick(SEASONS, query.season, ''),
    q: typeof query.q === 'string' ? query.q.slice(0, 100) : '',
    minParticipants: wholeNumber(query.minParticipants),
    maxParticipants: wholeNumber(query.maxParticipants),
    sort: pick(SORTS, query.sort, DEFAULTS.sort),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

// Only non-default values go in the URL, so a plain /events link stays clean
function updateQuery(changes) {
  const next = { ...filters, page: 1, ...changes };
  const query = {};
  for (const [key, value] of Object.entries(next)) {
    if (value !== '' && value !== null && value !== undefined && value !== DEFAULTS[key]) query[key] = String(value);
  }
  router.replace({ query });
}

const rangeError = computed(() => {
  const min = wholeNumber(minInput.value);
  const max = wholeNumber(maxInput.value);
  if ((minInput.value !== '' && min === '') || (maxInput.value !== '' && max === '')) {
    return `Use a whole number from 0 to ${LIMITS.maxParticipantsCeiling}.`;
  }
  if (min !== '' && max !== '' && min > max) return "The minimum can't be more than the maximum.";
  return '';
});

let typingTimer = null;
function scheduleUpdate() {
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    const changes = { q: search.value.trim() };
    if (!rangeError.value) {
      changes.minParticipants = wholeNumber(minInput.value);
      changes.maxParticipants = wholeNumber(maxInput.value);
    }
    const unchanged = Object.entries(changes).every(([k, v]) => filters[k] === v);
    if (!unchanged) updateQuery(changes);
  }, 300);
}
onBeforeUnmount(() => clearTimeout(typingTimer));

const hasFilters = computed(
  () =>
    filters.status !== DEFAULTS.status ||
    filters.season ||
    filters.q ||
    filters.minParticipants !== '' ||
    filters.maxParticipants !== ''
);

function clearFilters() {
  clearTimeout(typingTimer);
  search.value = '';
  minInput.value = '';
  maxInput.value = '';
  router.replace({ query: filters.sort !== DEFAULTS.sort ? { sort: filters.sort } : {} });
}

let requestId = 0;
async function load() {
  const id = ++requestId;
  loading.value = true;
  error.value = '';
  try {
    const data = await api(
      `/events${qs({
        status: filters.status === 'all' ? undefined : filters.status,
        season: filters.season,
        q: filters.q,
        minParticipants: filters.minParticipants,
        maxParticipants: filters.maxParticipants,
        sort: filters.sort,
        page: filters.page,
        limit: PAGE_SIZE,
      })}`
    );
    if (id !== requestId) return;
    // Past the last page (e.g. an old link): jump to the last one that exists
    if (data.pages > 0 && filters.page > data.pages) {
      updateQuery({ page: data.pages });
      return;
    }
    events.value = data.events || [];
    total.value = data.total || 0;
    pages.value = Math.max(1, data.pages || 1);
    loadedOnce.value = true;
  } catch (e) {
    if (id === requestId) error.value = e.message;
  } finally {
    if (id === requestId) loading.value = false;
  }
}

watch(
  () => route.query,
  (query) => {
    if (route.name !== 'events') return; // leaving the page
    Object.assign(filters, readQuery(query));
    // Don't overwrite when someone is in the middle of typing
    const active = document.activeElement;
    if (active !== searchInput.value) search.value = filters.q;
    if (active !== minEl.value) minInput.value = filters.minParticipants === '' ? '' : String(filters.minParticipants);
    if (active !== maxEl.value) maxInput.value = filters.maxParticipants === '' ? '' : String(filters.maxParticipants);
    load();
  },
  { immediate: true }
);

const pageItems = computed(() => {
  const current = filters.page;
  const last = pages.value;
  const wanted = new Set([1, last, current - 1, current, current + 1].filter((p) => p >= 1 && p <= last));
  const sorted = [...wanted].sort((a, b) => a - b);
  const items = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) items.push({ gap: true, key: `gap-${p}` });
    items.push({ page: p, key: `p-${p}` });
  });
  return items;
});

function goToPage(page) {
  if (page < 1 || page > pages.value || page === filters.page) return;
  updateQuery({ page });
  resultsTop.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const summary = computed(() => {
  if (!total.value) return 'No events found';
  const start = (filters.page - 1) * PAGE_SIZE + 1;
  const end = Math.min(total.value, start + events.value.length - 1);
  return total.value <= PAGE_SIZE ? pluralize(total.value, 'event') : `${start}–${end} of ${pluralize(total.value, 'event')}`;
});
</script>

<template>
  <main class="page">
    <PageHeader title="Browse events" subtitle="Find an art exchange to join, or see what other communities are making.">
      <template v-if="auth.user" #actions>
        <RouterLink to="/events/new" class="btn btn-primary">
          <Plus :size="18" aria-hidden="true" /> Create an event
        </RouterLink>
      </template>
    </PageHeader>

    <section class="card toolbar" aria-label="Filter events">
      <SearchBar
        id="event-search"
        ref="searchInput"
        v-model="search"
        sr-label="Search events or organisers"
        placeholder="Search events or organisers"
        :maxlength="100"
        @input="scheduleUpdate"
        @keydown.enter.prevent="scheduleUpdate"
      />

      <div class="toolbar-row">
        <FilterButton
        :aria-expanded="filtersOpen ? 'true' : 'false'"
        aria-controls="discover-filters"
        @click="filtersOpen = !filtersOpen" 
        :filterCount="filterCount"
        />

        <label class="sort">
          <span class="label-inline">Sort by</span>
          <select class="select" :value="filters.sort" @change="updateQuery({ sort: $event.target.value })">
            <option v-for="s in SORTS" :key="s.value" :value="s.value">{{ s.label }}</option>
          </select>
        </label>
      </div>

      <div id="discover-filters" class="filters" :class="{ open: filtersOpen }">
        <div class="chips" role="group" aria-label="Event status">
          <button
            v-for="s in STATUS_FILTERS"
            :key="s.value"
            type="button"
            class="chip"
            :class="{ on: filters.status === s.value }"
            :aria-pressed="filters.status === s.value"
            @click="updateQuery({ status: s.value })"
          >
            {{ s.label }}
          </button>
        </div>
        
        <div class="row">
          <div class="field small">
            <label for="filter-season" class="label">Season</label>
            <div class="input-wrap">
              <select
                id="filter-season"
                class="input"
                :value="filters.season"
                @change="updateQuery({ season: $event.target.value })"
              >
                <option value="">Any season</option>
                <option v-for="s in SEASONS" :key="s.value" :value="s.value">{{ s.label }}</option>
              </select>
            </div>
          </div>
          <div class="field small">
            <label for="filter-min" class="label">Min. participants</label>
            <div class="input-wrap">
              <input
                id="filter-min"
                ref="minEl"
                v-model="minInput"
                class="input"
                type="number"
                inputmode="numeric"
                min="0"
                :max="LIMITS.maxParticipantsCeiling"
                placeholder="Any"
                :aria-invalid="Boolean(rangeError)"
                aria-describedby="range-error"
                @input="scheduleUpdate"
              />
            </div>
          </div>
          <div class="field small">
            <label for="filter-max" class="label">Max. participants</label>
            <div class="input-wrap">
              <input
                id="filter-max"
                ref="maxEl"
                v-model="maxInput"
                class="input"
                type="number"
                inputmode="numeric"
                min="0"
                :max="LIMITS.maxParticipantsCeiling"
                placeholder="Any"
                :aria-invalid="Boolean(rangeError)"
                aria-describedby="range-error"
                @input="scheduleUpdate"
              />
            </div>
          </div>
        </div>
      </div>
      <p id="range-error" class="range-error" :class="{ shown: rangeError }" role="status">{{ rangeError }}</p>
    </section>

    <ResultHeader 
      ref="resultsTop" 
      :summary="summary" 
      :loaded-once="loadedOnce" 
      :loading="loading" 
      :error="error" 
      :has-filters="hasFilters" 
      @clear-filters="clearFilters"
    />

    <LoadingBlock v-if="loading && !loadedOnce" label="Loading events…" />
    <ErrorBlock v-else-if="error" :message="error" @retry="load" />
    <EmptyState
      v-else-if="!events.length"
      :icon="CalendarSearch"
      title="No events match"
      :message="
        hasFilters
          ? 'Try a different search or fewer filters.'
          : 'There are no public events right now. Check back soon, or start one yourself.'
      "
    >
      <button v-if="hasFilters" type="button" class="btn btn-outline" @click="clearFilters">Clear filters</button>
      <RouterLink v-else-if="auth.user" to="/events/new" class="btn btn-primary">
        <Plus :size="18" aria-hidden="true" /> Create an event
      </RouterLink>
    </EmptyState>

    <template v-else>
      <ul class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 results" :class="{ stale: loading }">
        <li v-for="event in events" :key="event.id" class="flex">
          <EventCard :event="event" class="w-full" />
        </li>
      </ul>

      <nav v-if="pages > 1" class="pagination" aria-label="Pages">
        <button
          type="button"
          class="btn btn-outline page-btn"
          :disabled="filters.page <= 1 || loading"
          aria-label="Previous page"
          @click="goToPage(filters.page - 1)"
        >
          <ChevronLeft :size="18" />
        </button>
        <template v-for="item in pageItems" :key="item.key">
          <span v-if="item.gap" class="gap" aria-hidden="true">…</span>
          <button
            v-else
            type="button"
            class="btn page-btn"
            :class="item.page === filters.page ? 'btn-primary' : 'btn-outline'"
            :aria-current="item.page === filters.page ? 'page' : undefined"
            :aria-label="`Page ${item.page}`"
            :disabled="loading && item.page !== filters.page"
            @click="goToPage(item.page)"
          >
            {{ item.page }}
          </button>
        </template>
        <button
          type="button"
          class="btn btn-outline page-btn"
          :disabled="filters.page >= pages || loading"
          aria-label="Next page"
          @click="goToPage(filters.page + 1)"
        >
          <ChevronRight :size="18" />
        </button>
      </nav>
    </template>
  </main>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 22px 24px 8px;
  margin-top: 28px;
}
.clear-search {
  border: 0;
  background: none;
  color: var(--muted);
  display: grid;
  place-items: center;
  padding: 6px;
  border-radius: 8px;
  cursor: pointer;
}
.clear-search:hover {
  background: var(--hover);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  flex-shrink: 0;
  border: 1.5px solid var(--border);
  background: var(--surface);
  color: var(--text);
  border-radius: 999px;
  padding: 7px 16px;
  font-weight: 600;
  font-size: 0.92rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.chip:hover {
  border-color: var(--pink);
}
.chip.on {
  background: var(--pink);
  border-color: var(--pink);
  color: #fff;
}
.chip:focus-visible,
.clear-search:focus-visible {
  outline: 3px solid var(--pink-soft);
  outline-offset: 2px;
  border-color: var(--pink);
}
.row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 14px;
}
.field.small {
  gap: 6px;
}
.field.small + .field.small {
  margin-top: 0;
}
.field.small .label {
  font-size: 0.88rem;
  color: var(--muted);
  font-weight: 600;
}
.field.small .input {
  padding: 10px 0;
}
select.input {
  cursor: pointer;
}
.range-error {
  margin: 0;
  min-height: 1.4em;
  padding-bottom: 8px;
  color: var(--danger);
  font-size: 0.88rem;
  font-weight: 500;
}
.results {
  list-style: none;
  margin: 0;
  padding: 0;
  transition: opacity 0.15s;
}
.results.stale {
  opacity: 0.55;
}
.pagination {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin-top: 36px;
}
.page-btn {
  min-width: 44px;
  height: 44px;
  padding: 0 12px;
}
.gap {
  color: var(--muted);
  padding: 0 4px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
.toolbar-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
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
  display: none;
}
.filters.open {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
@media (max-width: 640px) {
  .toolbar {
    padding: 16px 16px 4px;
    margin-top: 20px;
  }
}
</style>
