<script setup>
import { ref, computed, watch, useId } from 'vue';
import { SlidersHorizontal, Plus, X, Loader2 } from 'lucide-vue-next';
import { api } from '@/api';
import { toast } from '@/stores/toast';
import { LIMITS } from '@shared/constants.mjs';

// The organisers' matching rules: people to keep apart, and steering away from pairs from your
// earlier exchanges. People's own private block lists always apply on top of these.
const props = defineProps({
  event: { type: Object, required: true },
});
const emit = defineEmits(['updated']);

const uid = useId();
const people = ref([]); // everyone who signed up and wasn't turned away
const pairs = ref([]);
const avoidRepeats = ref(true);
const a = ref('');
const b = ref('');
const saving = ref(false);
const loaded = ref(false);

function reset() {
  pairs.value = (props.event.matchingRules?.avoidPairs || []).map((p) => ({ ...p }));
  avoidRepeats.value = props.event.matchingRules?.avoidRepeats !== false;
}
watch(() => props.event.matchingRules, reset, { immediate: true });

watch(
  () => props.event.id,
  async () => {
    try {
      const { applications = [] } = await api(`/events/${props.event.id}/applications`);
      people.value = applications
        .filter((x) => ['pending', 'accepted', 'waitlisted'].includes(x.status) && x.user?.id)
        .map((x) => x.user)
        .sort((x, y) => (x.displayName || '').localeCompare(y.displayName || ''));
    } catch {
      people.value = [];
    } finally {
      loaded.value = true;
    }
  },
  { immediate: true }
);

const nameOf = (id) => people.value.find((p) => p.id === id)?.displayName || 'Someone who left';
const dirty = computed(
  () =>
    JSON.stringify({ pairs: pairs.value, avoidRepeats: avoidRepeats.value }) !==
    JSON.stringify({
      pairs: props.event.matchingRules?.avoidPairs || [],
      avoidRepeats: props.event.matchingRules?.avoidRepeats !== false,
    })
);
const canAdd = computed(
  () =>
    a.value &&
    b.value &&
    a.value !== b.value &&
    pairs.value.length < LIMITS.avoidPairs &&
    !pairs.value.some((p) => (p.a === a.value && p.b === b.value) || (p.a === b.value && p.b === a.value))
);

function addPair() {
  if (!canAdd.value) return;
  pairs.value = [...pairs.value, { a: a.value, b: b.value }];
  a.value = '';
  b.value = '';
}

async function save() {
  saving.value = true;
  try {
    const { event } = await api(`/events/${props.event.id}/matching-rules`, {
      method: 'PUT',
      body: { avoidPairs: pairs.value, avoidRepeats: avoidRepeats.value },
    });
    emit('updated', event);
    toast.success('Matching rules saved. They apply the next time you generate matches.');
  } catch (e) {
    toast.error(e.message);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section v-if="loaded" class="card p-5 sm:p-6 rules" :aria-labelledby="`${uid}-title`">
    <h3 :id="`${uid}-title`" class="title"><SlidersHorizontal :size="19" aria-hidden="true" /> Matching rules</h3>
    <p class="hint m-0 mt-1">
      Used every time you generate matches. People can also keep their own private list of who they won't be matched
      with; those always count, and you won't see who is on them.
    </p>

    <label class="check">
      <input v-model="avoidRepeats" type="checkbox" />
      <span>
        <strong>Avoid repeat pairs</strong>
        <span class="hint block">Try not to give anyone the same person they made a gift for in your earlier exchanges.</span>
      </span>
    </label>

    <div class="pairs">
      <p class="label m-0">Keep these people apart</p>
      <ul v-if="pairs.length" class="pair-list">
        <li v-for="(p, i) in pairs" :key="`${p.a}-${p.b}`" class="pair">
          <span>{{ nameOf(p.a) }} <span class="amp" aria-hidden="true">&amp;</span><span class="sr-only">and</span> {{ nameOf(p.b) }}</span>
          <button
            type="button"
            class="btn btn-ghost btn-xs"
            :aria-label="`Stop keeping ${nameOf(p.a)} and ${nameOf(p.b)} apart`"
            @click="pairs = pairs.filter((_, j) => j !== i)"
          >
            <X :size="14" aria-hidden="true" />
          </button>
        </li>
      </ul>
      <p v-else class="hint m-0">Nobody yet. Useful for people who've had a falling out, or close friends who'd guess.</p>

      <div v-if="people.length >= 2" class="add-row">
        <label :for="`${uid}-a`" class="sr-only">First person</label>
        <div class="input-wrap pick">
          <select :id="`${uid}-a`" v-model="a" class="select">
            <option value="" disabled>Someone</option>
            <option v-for="p in people" :key="p.id" :value="p.id">{{ p.displayName }}</option>
          </select>
        </div>
        <span class="amp" aria-hidden="true">&amp;</span>
        <label :for="`${uid}-b`" class="sr-only">Second person</label>
        <div class="input-wrap pick">
          <select :id="`${uid}-b`" v-model="b" class="select">
            <option value="" disabled>Someone else</option>
            <option v-for="p in people" :key="p.id" :value="p.id" :disabled="p.id === a">{{ p.displayName }}</option>
          </select>
        </div>
        <button type="button" class="btn btn-outline btn-sm" :disabled="!canAdd" @click="addPair">
          <Plus :size="15" aria-hidden="true" /> Add
        </button>
      </div>
    </div>

    <div class="actions">
      <button type="button" class="btn btn-primary btn-sm" :disabled="!dirty || saving" @click="save">
        <Loader2 v-if="saving" :size="16" class="spin" aria-hidden="true" /> Save rules
      </button>
      <button v-if="dirty" type="button" class="btn btn-ghost btn-sm" @click="reset">Undo changes</button>
    </div>
  </section>
</template>

<style scoped>
.title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-body);
  font-size: 1.1rem;
  font-weight: 700;
}
.check {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 16px;
  cursor: pointer;
}
.check input {
  width: 18px;
  height: 18px;
  margin-top: 3px;
  accent-color: var(--pink);
}
.block {
  display: block;
}
.pairs {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pair-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pair {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px 2px 12px;
  border-radius: 999px;
  background: var(--chip);
  font-weight: 600;
  font-size: 0.9rem;
}
.amp {
  color: var(--pink-dark);
  font-weight: 700;
}
.add-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.pick {
  flex: 1 1 160px;
  min-width: 0;
  padding: 0 12px;
}
.pick .select {
  padding: 8px 0;
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
</style>
