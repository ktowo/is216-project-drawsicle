<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { CircleHelp, Search, X, ChevronsDownUp, ChevronsUpDown, SearchX } from 'lucide-vue-next';
import InfoLayout from '@/components/info/InfoLayout.vue';
import FaqItem from '@/components/info/FaqItem.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import { FAQ_GROUPS, filterFaqs } from '@/components/info/faqs';

const route = useRoute();

const query = ref('');
const openIds = ref(new Set());
const searchInput = ref(null);

const groups = computed(() => filterFaqs(FAQ_GROUPS, query.value));
const matchCount = computed(() => groups.value.reduce((n, g) => n + g.items.length, 0));
const totalCount = FAQ_GROUPS.reduce((n, g) => n + g.items.length, 0);
const searching = computed(() => query.value.trim().length > 0);
const sections = computed(() => groups.value.map((g) => ({ id: g.id, title: g.title })));

const allOpen = computed(() => matchCount.value > 0 && groups.value.every((g) => g.items.every((i) => openIds.value.has(i.id))));

// Read aloud by screen readers after every change to the search box
const resultsText = computed(() => {
  if (!searching.value) return '';
  if (!matchCount.value) return 'No questions match your search.';
  return `${matchCount.value} ${matchCount.value === 1 ? 'question matches' : 'questions match'} your search.`;
});

const emptyMessage = computed(
  () => `Nothing in the FAQ mentions “${query.value.trim()}”. Try a shorter word, or one of these.`
);

function toggle(id) {
  const next = new Set(openIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  openIds.value = next;
}

function toggleAll() {
  const ids = groups.value.flatMap((g) => g.items.map((i) => i.id));
  openIds.value = allOpen.value ? new Set() : new Set(ids);
}

// While searching, show the answers of the matches straight away
watch(query, () => {
  if (searching.value) openIds.value = new Set(groups.value.flatMap((g) => g.items.map((i) => i.id)));
  else openIds.value = new Set();
});

function clearSearch() {
  query.value = '';
  searchInput.value?.focus();
}

// /help#faq-forgot-password opens that question; /help#matching is just a section and scrolls by itself
async function openFromHash() {
  const id = route.hash.replace(/^#/, '');
  if (!id) return;
  const known = FAQ_GROUPS.some((g) => g.items.some((i) => i.id === id));
  if (!known) return;
  if (searching.value) query.value = '';
  await nextTick();
  openIds.value = new Set([...openIds.value, id]);
  await nextTick();
  document.getElementById(id)?.scrollIntoView({ block: 'start' });
}
onMounted(openFromHash);
watch(() => route.hash, openFromHash);

const SUGGESTIONS = ['deadline', 'matching', 'password', 'private', 'character'];
</script>

<template>
  <InfoLayout
    title="Help & FAQ"
    :intro="`Answers to ${totalCount} common questions about joining, running and matching art exchanges.`"
    :icon="CircleHelp"
    updated="12 October 2026"
    :sections="sections"
    current="help"
  >
    <template #before>
      <form class="search card" role="search" aria-label="Search the FAQ" @submit.prevent>
        <label class="label" for="faq-search">Search the questions</label>
        <div class="input-wrap">
          <Search :size="18" class="input-icon" aria-hidden="true" />
          <input
            id="faq-search"
            ref="searchInput"
            v-model="query"
            type="search"
            class="input"
            placeholder="e.g. deadline, password, private event"
            autocomplete="off"
            enterkeyhint="search"
            @keydown.esc="query = ''"
          />
          <button v-if="searching" type="button" class="clear-btn" aria-label="Clear search" @click="clearSearch">
            <X :size="16" aria-hidden="true" />
          </button>
        </div>
        <div class="search-foot">
          <p class="hint" aria-live="polite">{{ resultsText || 'Try a word like deadline, matching or password.' }}</p>
          <button v-if="matchCount" type="button" class="btn btn-ghost btn-xs" @click="toggleAll">
            <component :is="allOpen ? ChevronsDownUp : ChevronsUpDown" :size="15" aria-hidden="true" />
            {{ allOpen ? 'Collapse all' : 'Expand all' }}
          </button>
        </div>
      </form>
    </template>

    <template v-if="matchCount">
      <section v-for="group in groups" :id="group.id" :key="group.id" :aria-labelledby="`${group.id}-title`">
        <h2 :id="`${group.id}-title`">{{ group.title }}</h2>
        <p v-if="group.intro" class="group-intro">{{ group.intro }}</p>
        <FaqItem
          v-for="item in group.items"
          :id="item.id"
          :key="item.id"
          :question="item.q"
          :blocks="item.a"
          :open="openIds.has(item.id)"
          @toggle="toggle(item.id)"
        />
      </section>
    </template>

    <EmptyState
      v-else
      :icon="SearchX"
      title="No questions match that"
      :message="emptyMessage"
    >
      <button v-for="word in SUGGESTIONS" :key="word" type="button" class="btn btn-outline btn-xs" @click="query = word">
        {{ word }}
      </button>
      <button type="button" class="btn btn-primary btn-xs" @click="clearSearch">Show all questions</button>
    </EmptyState>

    <template #after>
      <div class="card still">
        <h2 class="still-title">Still stuck?</h2>
        <p>
          Ask the organiser of the event you are in, they can see your sign-up and its status. For a problem with the
          site itself, contact the Drawisicle team through whoever shared the link with you.
        </p>
        <p class="still-links">
          <RouterLink to="/guidelines#reporting">Reporting a problem</RouterLink>
          <RouterLink to="/events">Browse events</RouterLink>
        </p>
      </div>
    </template>
  </InfoLayout>
</template>

<style scoped>
.search {
  padding: 18px 20px 14px;
  margin-bottom: 18px;
}
.search .label {
  display: block;
  margin-bottom: 8px;
}
.clear-btn {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border: 0;
  background: var(--hover);
  color: var(--muted);
  border-radius: 999px;
  padding: 5px;
  cursor: pointer;
}
.clear-btn:hover {
  background: var(--pink-soft);
  color: var(--pink-dark);
}
.search-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 12px;
  margin-top: 8px;
  min-height: 32px;
}
.search-foot .hint {
  margin: 0;
}
.group-intro {
  color: var(--muted);
}
.still {
  margin-top: 24px;
  padding: 22px 26px;
}
.still-title {
  font-size: 1.3rem;
  font-weight: 800;
}
.still p {
  margin: 8px 0 0;
  line-height: 1.65;
}
.still-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  font-weight: 600;
}
/* Search matches the empty state's buttons wrapped on small screens */
:deep(.empty-state .actions) {
  flex-wrap: wrap;
  justify-content: center;
}
</style>
