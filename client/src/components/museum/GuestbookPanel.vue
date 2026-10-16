<script setup>
import { ref, computed, onMounted, useId } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { BookOpen, Loader2, Trash2, X } from 'lucide-vue-next';
import PixelHead from './PixelHead.vue';
import { api } from '@/api';
import { toast } from '@/stores/toast';
import { formatTime, timeAgo, pluralize } from '@/utils/format';
import { GUESTBOOK } from '@shared/chat.mjs';

// The guestbook on its stand by the entrance (server/routes/museum-rooms.js): visitors leave a
// short note for the exchange; its writer, the organisers and moderators can take one down.
const props = defineProps({
  place: { type: Object, required: true }, // { kind, eventId }
  me: { type: Object, default: null },
});
const emit = defineEmits(['close']);

const route = useRoute();
const uid = useId();
const base = computed(() => `/museum/rooms/${props.place.kind}/${props.place.eventId}/guestbook`);
const entries = ref([]);
const total = ref(0);
const nextAt = ref(null);
const loading = ref(true);
const problem = ref('');
const text = ref('');
const sending = ref(false);

async function load() {
  loading.value = true;
  problem.value = '';
  try {
    const data = await api(base.value);
    entries.value = data.entries;
    total.value = data.total;
    nextAt.value = data.nextAt;
  } catch (e) {
    problem.value = e.message;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const waiting = computed(() => nextAt.value && new Date(nextAt.value) > new Date());

async function sign() {
  if (!text.value.trim() || sending.value) return;
  sending.value = true;
  problem.value = '';
  try {
    const { entry } = await api(base.value, { method: 'POST', body: { text: text.value } });
    entries.value = [entry, ...entries.value];
    total.value++;
    text.value = '';
    nextAt.value = new Date(Date.now() + GUESTBOOK.gapMs).toISOString();
    toast.success('Thanks for signing the guestbook!');
  } catch (e) {
    problem.value = e.message;
    if (e.data?.retryAfterMs) nextAt.value = new Date(Date.now() + e.data.retryAfterMs).toISOString();
  } finally {
    sending.value = false;
  }
}

async function remove(entry) {
  try {
    await api(`/museum/rooms/guestbook/${entry.id}`, { method: 'DELETE' });
    entries.value = entries.value.filter((e) => e.id !== entry.id);
    total.value = Math.max(0, total.value - 1);
    toast.info('Note taken down.');
  } catch (e) {
    toast.error(e.message);
  }
}
</script>

<template>
  <section class="guestbook card" :aria-labelledby="`${uid}-title`">
    <header class="head">
      <h2 :id="`${uid}-title`" class="title"><BookOpen :size="18" aria-hidden="true" /> Guestbook</h2>
      <span class="count">{{ pluralize(total, 'note') }}</span>
      <button type="button" class="close" aria-label="Close the guestbook" @click="emit('close')">
        <X :size="16" aria-hidden="true" />
      </button>
    </header>

    <form v-if="me" class="sign" @submit.prevent="sign">
      <label :for="`${uid}-text`" class="sr-only">Your note for the guestbook</label>
      <textarea
        :id="`${uid}-text`"
        v-model="text"
        rows="2"
        :maxlength="GUESTBOOK.maxLength"
        :disabled="waiting"
        placeholder="Leave a note for the artists…"
      />
      <div class="sign-row">
        <span class="hint">
          <template v-if="waiting">You can write again at {{ formatTime(nextAt) }}.</template>
          <template v-else>{{ text.length }}/{{ GUESTBOOK.maxLength }}</template>
        </span>
        <button type="submit" class="btn btn-primary btn-xs" :disabled="sending || waiting || text.trim().length < 2">
          <Loader2 v-if="sending" :size="14" class="spin" aria-hidden="true" /> Sign
        </button>
      </div>
    </form>
    <p v-else class="hint m-0">
      <RouterLink :to="{ path: '/login', query: { redirect: route.fullPath } }">Log in</RouterLink> to sign the guestbook.
    </p>
    <p v-if="problem" class="problem" role="alert">{{ problem }}</p>

    <p v-if="loading" class="hint m-0">Opening the book…</p>
    <ol v-else-if="entries.length" class="notes">
      <li v-for="e in entries" :key="e.id" class="note">
        <PixelHead :user="e.user" :size="26" />
        <div class="min-w-0">
          <p class="who">
            <RouterLink v-if="e.user.username" :to="`/users/${e.user.username}`">{{ e.user.displayName }}</RouterLink>
            <strong v-else>{{ e.user.displayName }}</strong>
            <time :datetime="e.createdAt" :title="formatTime(e.createdAt)">{{ timeAgo(e.createdAt) }}</time>
          </p>
          <p class="text">{{ e.text }}</p>
        </div>
        <button v-if="e.canRemove" type="button" class="remove" :aria-label="`Take down the note from ${e.user.displayName}`" @click="remove(e)">
          <Trash2 :size="14" aria-hidden="true" />
        </button>
      </li>
    </ol>
    <p v-else class="hint m-0">Nobody has signed yet. Be the first!</p>
  </section>
</template>

<style scoped>
.guestbook {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(360px, calc(100vw - 40px));
  padding: 14px;
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-family: var(--font-body);
  font-size: 1rem;
  font-weight: 800;
}
.count {
  color: var(--muted);
  font-size: 0.8rem;
}
.close {
  margin-left: auto;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.close:hover,
.close:focus-visible {
  background: var(--surface-2);
  color: var(--text);
}
.sign textarea {
  width: 100%;
  resize: vertical;
  min-height: 52px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.9rem;
}
.sign-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
}
.hint {
  color: var(--muted);
  font-size: 0.8rem;
}
.problem {
  margin: 0;
  color: var(--danger, #c4314f);
  font-size: 0.82rem;
}
.notes {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 280px;
  overflow-y: auto;
}
.note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.who {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  margin: 0;
  font-size: 0.85rem;
  font-weight: 700;
}
.who a {
  color: var(--text);
}
.who time {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 500;
}
.text {
  margin: 2px 0 0;
  font-size: 0.88rem;
  overflow-wrap: anywhere;
  white-space: pre-line;
}
.remove {
  margin-left: auto;
  flex: none;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.remove:hover,
.remove:focus-visible {
  background: var(--surface-2);
  color: var(--danger, #c4314f);
}
</style>
