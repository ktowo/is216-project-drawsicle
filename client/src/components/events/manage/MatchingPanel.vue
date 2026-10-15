<script setup>
import { ref, reactive, computed, watch, useId } from 'vue';
import {
  Shuffle,
  ArrowRight,
  ArrowLeftRight,
  RefreshCw,
  Send,
  ChevronDown,
  Loader2,
  TriangleAlert,
  UserX,
  Search,
  Repeat,
  HeartHandshake,
} from 'lucide-vue-next';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import PersonLink from '@/components/events/PersonLink.vue';
import StatTile from './StatTile.vue';
import MatchingRulesCard from './MatchingRulesCard.vue';
import { api } from '@/api';
import { toast } from '@/stores/toast';
import { formatDateTime, pluralize } from '@/utils/format';
import { personName, submissionState } from './helpers';

const props = defineProps({
  event: { type: Object, required: true },
});
const emit = defineEmits(['updated', 'go']);

const uid = useId();
const matches = ref([]);
const published = ref(false);
const result = ref(null); // from the last generate in this visit: { unmatched, warnings, stats }
const accepted = ref([]); // accepted applications, to spot people left out of the draft
const loading = ref(false);
const error = ref('');
const search = ref('');
const expanded = ref(new Set());

const status = computed(() => props.event.status);
const beforeMatching = computed(() => status.value === 'draft' || status.value === 'open');
const isDraftStage = computed(() => status.value === 'matching');
const minNeeded = computed(() => Math.max(props.event.minParticipants || 2, 2));
const acceptedCount = computed(() => (isDraftStage.value ? accepted.value.length : props.event.participantCount || 0));
const enoughPeople = computed(() => acceptedCount.value >= minNeeded.value);

let loadToken = 0;
async function load() {
  const token = ++loadToken;
  error.value = '';
  result.value = null;
  swap.selected = [];
  if (beforeMatching.value) {
    matches.value = [];
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const id = props.event.id;
    const [matchData, appData] = await Promise.all([
      api(`/events/${id}/matches`),
      isDraftStage.value ? api(`/events/${id}/applications?status=accepted`) : null,
    ]);
    if (token !== loadToken) return;
    matches.value = matchData.matches || [];
    published.value = Boolean(matchData.published);
    accepted.value = appData ? (appData.applications || []).filter((a) => a.status === 'accepted') : [];
  } catch (e) {
    if (token === loadToken) error.value = e.message;
  } finally {
    if (token === loadToken) loading.value = false;
  }
}

// ---- Derived info about the draft ----
const maxScore = computed(() => Math.max(1, ...matches.value.map((m) => Number(m.score) || 0)));
const pairKeys = computed(() => new Set(matches.value.map((m) => `${m.giver?.id}>${m.recipient?.id}`)));

function isMutual(match) {
  return pairKeys.value.has(`${match.recipient?.id}>${match.giver?.id}`);
}

function scorePercent(match) {
  return Math.max(4, Math.round(((Number(match.score) || 0) / maxScore.value) * 100));
}

const unmatched = computed(() => {
  if (!isDraftStage.value || !matches.value.length) return [];
  const givers = new Set(matches.value.map((m) => m.giver?.id));
  const recipients = new Set(matches.value.map((m) => m.recipient?.id));
  const fromList = accepted.value
    .map((a) => a.user)
    .filter((u) => u?.id && (!givers.has(u.id) || !recipients.has(u.id)));
  if (fromList.length) return fromList;
  // Fall back to what the generator reported (e.g. if the accepted list didn't load)
  return (result.value?.unmatched || []).filter((u) => !givers.has(u.id) || !recipients.has(u.id));
});

const averageScore = computed(() => {
  if (!matches.value.length) return 0;
  const sum = matches.value.reduce((acc, m) => acc + (Number(m.score) || 0), 0);
  return Math.round((sum / matches.value.length) * 10) / 10;
});
const mutualCount = computed(() => matches.value.filter(isMutual).length / 2);

const visible = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return matches.value;
  return matches.value.filter((m) =>
    [m.giver?.displayName, m.giver?.username, m.recipient?.displayName, m.recipient?.username]
      .filter(Boolean)
      .some((t) => t.toLowerCase().includes(q))
  );
});

function toggleReasons(id) {
  const next = new Set(expanded.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expanded.value = next;
}

// ---- Generate ----
const seed = ref('');
const generating = ref(false);
const generateError = ref('');
const regenerateOpen = ref(false);

// The server only understands whole-number seeds (anything else would quietly become random)
const seedInvalid = computed(() => {
  const text = seed.value.trim();
  return Boolean(text) && !/^\d{1,15}$/.test(text);
});

function seedValue() {
  const text = seed.value.trim();
  return text ? Number(text) : undefined;
}

function startGenerate() {
  if (seedInvalid.value) return;
  if (matches.value.length) regenerateOpen.value = true;
  else generate();
}

async function generate() {
  if (seedInvalid.value) {
    regenerateOpen.value = false;
    return;
  }
  generating.value = true;
  generateError.value = '';
  try {
    const data = await api(`/events/${props.event.id}/matches/generate`, {
      method: 'POST',
      body: { seed: seedValue() },
    });
    matches.value = data.matches || [];
    result.value = data.result || null;
    published.value = false;
    swap.selected = [];
    expanded.value = new Set();
    regenerateOpen.value = false;
    const left = data.result?.unmatched?.length || 0;
    if (left) toast.info(`Made ${pluralize(matches.value.length, 'match', 'matches')}, but ${pluralize(left, 'person', 'people')} couldn't be placed.`);
    else toast.success(`Made ${pluralize(matches.value.length, 'match', 'matches')}.`);
  } catch (e) {
    generateError.value = e.message;
    if (regenerateOpen.value) regenerateOpen.value = false;
  } finally {
    generating.value = false;
  }
}

// ---- Swap ----
const swap = reactive({ on: false, selected: [], loading: false, error: '' });

function toggleSwapMode() {
  swap.on = !swap.on;
  swap.selected = [];
  swap.error = '';
}

function isSelected(id) {
  return swap.selected.includes(id);
}

function toggleSelect(id) {
  swap.error = '';
  if (isSelected(id)) swap.selected = swap.selected.filter((x) => x !== id);
  else if (swap.selected.length < 2) swap.selected = [...swap.selected, id];
}

const swapPreview = computed(() => {
  if (swap.selected.length !== 2) return '';
  const [a, b] = swap.selected.map((id) => matches.value.find((m) => m.id === id));
  if (!a || !b) return '';
  return `${personName(a.giver)} will make a gift for ${personName(b.recipient)}, and ${personName(b.giver)} for ${personName(a.recipient)}.`;
});

async function doSwap() {
  if (swap.selected.length !== 2) return;
  swap.loading = true;
  swap.error = '';
  try {
    const [matchIdA, matchIdB] = swap.selected;
    const data = await api(`/events/${props.event.id}/matches/swap`, {
      method: 'POST',
      body: { matchIdA, matchIdB },
    });
    matches.value = data.matches || matches.value;
    swap.selected = [];
    toast.success('Recipients swapped.');
  } catch (e) {
    swap.error = e.message;
  } finally {
    swap.loading = false;
  }
}

// ---- Publish ----
const publish = reactive({ open: false, loading: false, error: '' });

function askPublish() {
  publish.error = '';
  publish.open = true;
}

async function doPublish() {
  publish.loading = true;
  publish.error = '';
  try {
    const data = await api(`/events/${props.event.id}/matches/publish`, { method: 'POST' });
    publish.open = false;
    matches.value = data.matches || matches.value;
    published.value = true;
    swap.on = false;
    toast.success('Matches published! Every artist now knows who they are making a gift for.');
    if (data.event) emit('updated', data.event);
  } catch (e) {
    publish.error = e.message;
  } finally {
    publish.loading = false;
  }
}

function submissionLabel(match) {
  if (!match.submission) return null;
  return submissionState(match.submission);
}

// Registered last: load() resets the swap state declared above
watch(() => [props.event.id, props.event.status], load, { immediate: true });
</script>

<template>
  <section class="flex flex-col gap-5" :aria-labelledby="`${uid}-title`">
    <h2 :id="`${uid}-title`" class="sr-only">Matching</h2>

    <!-- Before sign-ups close: how it works -->
    <div v-if="beforeMatching" class="card p-5 sm:p-7">
      <h3 class="section-title flex items-center gap-2"><Shuffle :size="20" aria-hidden="true" /> How matching works</h3>
      <p class="section-sub">
        Matching starts once sign-ups close, either automatically at the sign-up deadline
        ({{ formatDateTime(event.signupDeadline) }}) or when you close them early from the Overview tab.
      </p>
      <ul class="rules">
        <li>Nobody is matched with themselves, and two people only swap with each other when there's no other way.</li>
        <li>Each artist only gets someone who wants a kind of gift they can make (art, writing and so on).</li>
        <li>If someone offered characters, their artist can draw at least one of them, based on the "can't draw" tags.</li>
        <li>Shared likes and more drawable characters make a better match. Everyone gives once and receives once.</li>
        <li>You can look over the draft, swap recipients by hand and generate again before anything is sent out.</li>
      </ul>
      <p class="alert m-0 mt-5" :class="enoughPeople ? 'alert-success' : 'alert-info'">
        {{ pluralize(acceptedCount, 'accepted artist') }} so far. Matching needs at least {{ minNeeded }}.
      </p>
    </div>

    <LoadingBlock v-else-if="loading" label="Loading matches…" />
    <ErrorBlock v-else-if="error" :message="error" @retry="load" />

    <!-- Matching stage: generate, review, swap, publish -->
    <template v-else-if="isDraftStage">
      <div class="card p-5 sm:p-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0 flex-1 basis-72">
            <h3 class="section-title">{{ matches.length ? 'Draft matches' : 'Generate matches' }}</h3>
            <p class="section-sub text-sm">
              <template v-if="matches.length">
                Nobody can see these yet. Swap recipients if something looks off, then publish to start the event.
              </template>
              <template v-else>
                Ready to pair up {{ pluralize(acceptedCount, 'accepted artist') }}. You can check the result before
                anyone is told.
              </template>
            </p>
          </div>
          <form class="seed-form" novalidate @submit.prevent="startGenerate">
            <div class="field">
              <label :for="`${uid}-seed`" class="label text-sm">Seed <span class="text-cocoa font-normal">(optional)</span></label>
              <div class="input-wrap" :class="{ 'is-invalid': seedInvalid }">
                <input
                  :id="`${uid}-seed`"
                  v-model="seed"
                  class="input py-2.5"
                  maxlength="15"
                  inputmode="numeric"
                  autocomplete="off"
                  placeholder="Random"
                  :aria-invalid="seedInvalid"
                  :aria-describedby="`${uid}-seed-hint`"
                />
              </div>
            </div>
            <button
              type="submit"
              class="btn btn-sm"
              :class="matches.length ? 'btn-outline' : 'btn-primary'"
              :disabled="generating || !enoughPeople || seedInvalid"
            >
              <Loader2 v-if="generating" :size="16" class="spin" aria-hidden="true" />
              <RefreshCw v-else-if="matches.length" :size="16" aria-hidden="true" />
              <Shuffle v-else :size="16" aria-hidden="true" />
              {{ matches.length ? 'Regenerate' : 'Generate matches' }}
            </button>
          </form>
        </div>
        <p :id="`${uid}-seed-hint`" class="m-0 mt-3" :class="seedInvalid ? 'field-error' : 'hint'">
          <template v-if="seedInvalid">A seed is a whole number, like 4821. Leave it empty for a random one.</template>
          <template v-else>The same seed always gives the same matches. Leave it empty for a fresh shuffle.</template>
        </p>
        <p v-if="!enoughPeople" class="alert alert-warning m-0 mt-4">
          You have {{ pluralize(acceptedCount, 'accepted artist') }} and need at least {{ minNeeded }}. Accept pending
          sign-ups on the Participants tab, or reopen sign-ups from the Overview tab.
        </p>
        <p v-if="generateError" class="alert alert-error m-0 mt-4" role="alert">{{ generateError }}</p>
      </div>

      <template v-if="matches.length">
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Pairs" :value="matches.length" :sub="`of ${pluralize(acceptedCount, 'artist')}`" />
          <StatTile
            label="Average fit"
            :value="result?.stats?.averageScore != null ? Math.round(result.stats.averageScore * 10) / 10 : averageScore"
            sub="Higher is better"
          />
          <StatTile
            label="Loops"
            :value="result?.stats?.cycles ?? '–'"
            :sub="result?.stats?.cycles === 1 ? 'One big loop' : 'Gift chains'"
          />
          <StatTile
            label="Seed"
            :value="result?.stats?.seed ?? '–'"
            :sub="result ? 'Reuse it to repeat this draft' : 'Shown after generating'"
          />
        </div>

        <div v-if="result?.warnings?.length" class="alert alert-warning" role="status">
          <p class="m-0 flex items-center gap-2 font-bold"><TriangleAlert :size="18" aria-hidden="true" /> Worth checking</p>
          <ul class="m-0 mt-2 pl-5">
            <li v-for="(w, i) in result.warnings" :key="i">{{ w }}</li>
          </ul>
        </div>

        <div v-if="unmatched.length" class="card unmatched p-5">
          <p class="m-0 flex items-center gap-2 font-bold text-danger">
            <UserX :size="18" aria-hidden="true" />
            {{ pluralize(unmatched.length, 'person', 'people') }} couldn't be placed
          </p>
          <p class="hint m-0 mt-1.5">
            Usually nobody else can make what they want, or their characters clash with everyone's "can't draw" tags.
            Remove them on the Participants tab or try another seed. You can't publish until everyone has a match.
          </p>
          <ul class="m-0 mt-3 p-0 list-none flex flex-wrap gap-2">
            <li v-for="u in unmatched" :key="u.id" class="person-chip">
              <PersonLink :user="u" :size="24" />
            </li>
          </ul>
        </div>

        <p v-if="mutualCount > 0" class="alert alert-info m-0 flex items-center gap-2">
          <Repeat :size="18" aria-hidden="true" />
          {{ pluralize(mutualCount, 'pair') }} of people make gifts for each other. That's fine, but swapping can make
          it more of a surprise.
        </p>

        <!-- Toolbar -->
        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div class="input-wrap md:w-72">
            <Search :size="16" class="input-icon" aria-hidden="true" />
            <label :for="`${uid}-search`" class="sr-only">Search matches</label>
            <input :id="`${uid}-search`" v-model="search" type="search" class="input py-2.5" placeholder="Find an artist" />
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="btn btn-outline btn-sm"
              :aria-pressed="swap.on"
              :class="{ 'swap-on': swap.on }"
              @click="toggleSwapMode"
            >
              <ArrowLeftRight :size="16" aria-hidden="true" /> {{ swap.on ? 'Done swapping' : 'Swap recipients' }}
            </button>
            <button type="button" class="btn btn-primary btn-sm" :disabled="unmatched.length > 0 || swap.loading" @click="askPublish">
              <Send :size="16" aria-hidden="true" /> Publish matches
            </button>
          </div>
        </div>

        <div v-if="swap.on" class="card swap-bar p-4" role="region" aria-label="Swap recipients">
          <p class="m-0 font-semibold">
            {{
              swap.selected.length === 2
                ? 'Swap these two?'
                : `Pick two matches to swap their recipients (${swap.selected.length}/2).`
            }}
          </p>
          <p v-if="swapPreview" class="m-0 mt-1 text-sm text-cocoa">{{ swapPreview }}</p>
          <p v-if="swap.error" class="alert alert-error m-0 mt-3" role="alert">{{ swap.error }}</p>
          <div class="flex flex-wrap gap-2 mt-3">
            <button type="button" class="btn btn-primary btn-sm" :disabled="swap.selected.length !== 2 || swap.loading" @click="doSwap">
              <Loader2 v-if="swap.loading" :size="16" class="spin" aria-hidden="true" />
              <ArrowLeftRight v-else :size="16" aria-hidden="true" />
              Swap recipients
            </button>
            <button type="button" class="btn btn-ghost btn-sm" :disabled="!swap.selected.length" @click="swap.selected = []">
              Clear selection
            </button>
          </div>
        </div>

        <!-- Pairs -->
        <p v-if="!visible.length" class="card p-6 text-center text-cocoa m-0">Nobody matches that search.</p>
        <ul v-else class="m-0 p-0 list-none flex flex-col gap-2.5">
          <li
            v-for="m in visible"
            :key="m.id"
            class="card pair"
            :class="{ 'is-selected': swap.on && isSelected(m.id) }"
          >
            <div class="pair-main">
              <label v-if="swap.on" class="pick">
                <input
                  type="checkbox"
                  :checked="isSelected(m.id)"
                  :disabled="!isSelected(m.id) && swap.selected.length >= 2"
                  @change="toggleSelect(m.id)"
                />
                <span class="sr-only">Select {{ personName(m.giver) }}'s match for swapping</span>
              </label>
              <div class="people">
                <PersonLink :user="m.giver" :size="34" class="person" />
                <ArrowRight :size="18" class="arrow" aria-hidden="true" />
                <span class="sr-only">makes a gift for</span>
                <PersonLink :user="m.recipient" :size="34" class="person" />
              </div>
              <div class="score">
                <span class="score-bar" aria-hidden="true"><span :style="{ width: `${scorePercent(m)}%` }" /></span>
                <span class="text-sm font-semibold whitespace-nowrap">Fit {{ m.score }}</span>
                <span v-if="isMutual(m)" class="badge badge-info text-xs px-2 py-0.5" title="These two make gifts for each other">
                  Mutual
                </span>
              </div>
              <button
                v-if="m.reasons?.length"
                type="button"
                class="btn btn-ghost btn-xs why"
                :aria-expanded="expanded.has(m.id)"
                :aria-controls="`${uid}-why-${m.id}`"
                @click="toggleReasons(m.id)"
              >
                Why <ChevronDown :size="14" :class="{ 'rotate-180': expanded.has(m.id) }" aria-hidden="true" />
              </button>
            </div>
            <ul v-if="expanded.has(m.id)" :id="`${uid}-why-${m.id}`" class="reasons">
              <li v-for="(r, i) in m.reasons" :key="i">{{ r }}</li>
            </ul>
          </li>
        </ul>
      </template>

      <EmptyState
        v-else-if="enoughPeople && !generating"
        :icon="HeartHandshake"
        title="No matches yet"
        message="Generate matches to see who would make a gift for whom. Nothing is sent until you publish."
      />
    </template>

    <!-- Published: read-only -->
    <template v-else>
      <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 class="section-title">Published matches</h3>
          <p class="section-sub text-sm">
            <template v-if="event.publishedAt">Published {{ formatDateTime(event.publishedAt) }}. </template>Each artist can only see who they are making a gift for.
          </p>
        </div>
        <div v-if="matches.length" class="input-wrap md:w-72">
          <Search :size="16" class="input-icon" aria-hidden="true" />
          <label :for="`${uid}-search-pub`" class="sr-only">Search matches</label>
          <input :id="`${uid}-search-pub`" v-model="search" type="search" class="input py-2.5" placeholder="Find an artist" />
        </div>
      </div>

      <EmptyState v-if="!matches.length" :icon="Shuffle" title="No matches" message="This event has no published matches." />
      <p v-else-if="!visible.length" class="card p-6 text-center text-cocoa m-0">Nobody matches that search.</p>
      <ul v-else class="m-0 p-0 list-none flex flex-col gap-2.5">
        <li v-for="m in visible" :key="m.id" class="card pair">
          <div class="pair-main">
            <div class="people">
              <PersonLink :user="m.giver" :size="34" class="person" />
              <ArrowRight :size="18" class="arrow" aria-hidden="true" />
                <span class="sr-only">makes a gift for</span>
              <PersonLink :user="m.recipient" :size="34" class="person" />
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <StatusBadge :status="m.status" kind="match" />
              <StatusBadge v-if="submissionLabel(m) === 'late'" status="late" kind="submission" />
              <StatusBadge v-if="m.submission?.verified" status="verified" kind="submission" />
            </div>
          </div>
        </li>
      </ul>
      <button v-if="matches.length" type="button" class="btn btn-outline btn-sm self-start" @click="emit('go', 'submissions')">
        Check submissions <ArrowRight :size="16" aria-hidden="true" />
      </button>
    </template>

    <ConfirmDialog
      :open="regenerateOpen"
      title="Make new matches?"
      message="This replaces the current draft, including any swaps you made."
      confirm-label="Regenerate"
      :loading="generating"
      @confirm="generate"
      @cancel="regenerateOpen = false"
    >
      <p class="hint m-0">{{ seed.trim() ? `Using seed "${seed.trim()}".` : 'Using a random seed.' }}</p>
    </ConfirmDialog>

    <ConfirmDialog
      :open="publish.open"
      :title="`Publish ${pluralize(matches.length, 'match', 'matches')}?`"
      message="Every artist is told who they are making a gift for, and the event becomes active. Matches can't be changed after this."
      confirm-label="Publish & start event"
      :loading="publish.loading"
      @confirm="doPublish"
      @cancel="publish.open = false"
    >
      <div class="flex flex-col gap-2.5">
        <p class="alert alert-info m-0">
          Gifts are due {{ formatDateTime(event.submissionDeadline) }}. Recipients won't find out who made theirs until
          you complete the event.
        </p>
        <p v-if="publish.error" class="alert alert-error m-0" role="alert">{{ publish.error }}</p>
      </div>
    </ConfirmDialog>

    <MatchingRulesCard v-if="beforeMatching || isDraftStage" :event="event" @updated="emit('updated', $event)" />
  </section>
</template>

<style scoped>
.rules {
  margin: 16px 0 0;
  padding-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.seed-form {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}
.seed-form .field {
  gap: 6px;
  width: 150px;
}
.unmatched {
  border-color: var(--pink-line);
  background: var(--pink-tint);
}
.person-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px 4px 4px;
  border-radius: 999px;
  background: var(--danger-soft);
  font-weight: 600;
  font-size: 0.9rem;
}
.swap-on {
  border-color: var(--pink);
  color: var(--pink-dark);
}
.swap-bar {
  position: sticky;
  top: 8px;
  z-index: 5;
  border-color: var(--pink);
  background: var(--pink-tint);
}
.pair {
  padding: 12px 16px;
  border-radius: 16px;
}
.pair.is-selected {
  border-color: var(--pink);
  box-shadow: 0 0 0 2px var(--pink-soft);
}
.pair-main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
}
.pick {
  display: grid;
  place-items: center;
  cursor: pointer;
}
.pick input {
  width: 20px;
  height: 20px;
  accent-color: var(--pink);
  cursor: pointer;
}
.people {
  flex: 1 1 320px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.person {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.arrow {
  color: var(--pink);
}
.score {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 1 230px;
  min-width: 170px;
}
.score-bar {
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: var(--chip);
  overflow: hidden;
}
.score-bar > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--pink-line), var(--pink));
}
.why :deep(svg) {
  transition: transform 0.15s;
}
.reasons {
  margin: 10px 0 2px;
  padding: 10px 14px 10px 32px;
  border-radius: 12px;
  background: var(--surface-2);
  font-size: 0.92rem;
  color: var(--text);
}
@media (max-width: 480px) {
  .people {
    grid-template-columns: minmax(0, 1fr);
    flex-basis: 100%;
  }
  .arrow {
    transform: rotate(90deg);
    margin-left: 8px;
  }
  .score {
    flex-basis: 100%;
  }
}
</style>
