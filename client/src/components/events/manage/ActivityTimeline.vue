<script setup>
import { ref, computed, watch, useId } from 'vue';
import {
  History,
  Flag,
  UserPlus,
  UserMinus,
  Megaphone,
  Gift,
  LifeBuoy,
  ChevronDown,
  FilePen,
  DoorOpen,
  Shuffle,
  Send,
  PartyPopper,
  CircleSlash,
} from 'lucide-vue-next';
import PersonLink from '@/components/events/PersonLink.vue';
import { api } from '@/api';
import { formatDateTime, timeAgo } from '@/utils/format';

// Everything that happened in an event, newest first (GET /events/:id/activity, organisers only)
const props = defineProps({
  event: { type: Object, required: true },
});

const uid = useId();
const items = ref([]);
const total = ref(0);
const loading = ref(false);
const error = ref('');
const showAll = ref(false);
const FIRST = 8;

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const data = await api(`/events/${props.event.id}/activity`);
    items.value = data.items || [];
    total.value = data.total || items.value.length;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
// Reload when the event moves on (a status change adds a new entry)
watch(() => [props.event.id, props.event.status, props.event.updatedAt], load, { immediate: true });

const STATUS_TEXT = {
  draft: { icon: FilePen, text: 'created the event as a draft', auto: 'The event was created' },
  open: { icon: DoorOpen, text: 'opened sign-ups', auto: 'Sign-ups opened' },
  matching: { icon: Shuffle, text: 'closed sign-ups and started matching', auto: 'Sign-ups closed automatically' },
  active: { icon: Send, text: 'published the matches', auto: 'Matches were published' },
  completed: { icon: PartyPopper, text: 'revealed the gifts', auto: 'The gifts were revealed automatically' },
  cancelled: { icon: CircleSlash, text: 'cancelled the event', auto: 'The event was cancelled' },
};

// Each entry as { icon, tone, actor, text, note }
function describe(item) {
  switch (item.kind) {
    case 'status': {
      const s = STATUS_TEXT[item.status] || { icon: Flag, text: `moved the event to ${item.status}`, auto: `Moved to ${item.status}` };
      return item.by
        ? { icon: s.icon, tone: 'pink', actor: item.by, text: s.text }
        : { icon: s.icon, tone: 'pink', actor: null, text: s.auto };
    }
    case 'signup':
      return { icon: UserPlus, tone: 'info', actor: item.user, text: 'signed up' };
    case 'withdrawn':
      return { icon: UserMinus, tone: 'muted', actor: item.user, text: 'withdrew' };
    case 'announcement':
      return { icon: Megaphone, tone: 'warning', actor: item.by, text: 'posted an update', note: item.text };
    case 'gift':
      return { icon: Gift, tone: 'success', actor: item.user, text: item.late ? 'sent their gift (after the deadline)' : 'sent their gift' };
    case 'backup':
      return { icon: LifeBuoy, tone: 'info', actor: item.user, text: 'stepped in as a backup artist' };
    default:
      return { icon: History, tone: 'muted', actor: null, text: 'Something happened' };
  }
}

const rows = computed(() => items.value.map((item, i) => ({ key: `${item.kind}-${item.at}-${i}`, at: item.at, ...describe(item) })));
const shown = computed(() => (showAll.value ? rows.value : rows.value.slice(0, FIRST)));
</script>

<template>
  <section class="card p-5 sm:p-6" :aria-labelledby="`${uid}-title`">
    <h2 :id="`${uid}-title`" class="title"><History :size="18" aria-hidden="true" /> Activity</h2>
    <p class="hint m-0">What has happened in this event so far, newest first. Only organisers see this.</p>

    <p v-if="error" class="alert alert-error m-0 mt-3" role="alert">
      {{ error }} <button type="button" class="btn btn-ghost btn-xs" @click="load">Try again</button>
    </p>
    <p v-else-if="loading && !rows.length" class="hint mt-3">Loading activity…</p>
    <p v-else-if="!rows.length" class="hint mt-3">Nothing yet.</p>

    <ol v-else class="timeline" :class="{ dim: loading }">
      <li v-for="row in shown" :key="row.key" class="entry">
        <span class="dot" :class="`tone-${row.tone}`" aria-hidden="true"><component :is="row.icon" :size="15" /></span>
        <div class="body">
          <p class="line">
            <PersonLink v-if="row.actor" :user="row.actor" :size="0" class="actor" />
            {{ row.actor ? ` ${row.text}` : row.text }}
          </p>
          <p v-if="row.note" class="note">"{{ row.note }}"</p>
          <time class="when" :datetime="row.at" :title="formatDateTime(row.at)">{{ timeAgo(row.at) }}</time>
        </div>
      </li>
    </ol>

    <button
      v-if="rows.length > FIRST"
      type="button"
      class="btn btn-ghost btn-sm mt-2"
      :aria-expanded="showAll ? 'true' : 'false'"
      @click="showAll = !showAll"
    >
      <ChevronDown :size="16" :class="{ 'rotate-180': showAll }" aria-hidden="true" />
      {{ showAll ? 'Show less' : `Show all ${rows.length}` }}
    </button>
    <p v-if="showAll && total > rows.length" class="hint m-0">Showing the latest {{ rows.length }} of {{ total }}.</p>
  </section>
</template>

<style scoped>
.title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 4px;
  font-family: var(--font-body);
  font-size: 1.1rem;
  font-weight: 700;
}
.timeline {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
  transition: opacity 0.15s;
}
.timeline.dim {
  opacity: 0.6;
}
.entry {
  position: relative;
  display: flex;
  gap: 12px;
  padding-bottom: 14px;
}
/* The line joining the dots */
.entry:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 14px;
  top: 30px;
  bottom: 2px;
  width: 2px;
  background: var(--border);
}
.dot {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--chip);
  color: var(--muted);
}
.tone-pink {
  background: var(--pink-soft);
  color: var(--pink-dark);
}
.tone-info {
  background: var(--info-soft);
  color: var(--info);
}
.tone-success {
  background: var(--success-soft);
  color: var(--success);
}
.tone-warning {
  background: var(--warning-soft);
  color: var(--warning);
}
.body {
  min-width: 0;
  padding-top: 4px;
}
.line {
  margin: 0;
  font-size: 0.93rem;
  overflow-wrap: anywhere;
}
.actor {
  font-weight: 700;
}
.note {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 0.88rem;
  font-style: italic;
  overflow-wrap: anywhere;
}
.when {
  font-size: 0.8rem;
  color: var(--muted);
}
</style>
