<script setup>
import { ref, computed, watch, useId } from 'vue';
import { Wand2, Loader2, Play, CircleCheck, CircleAlert, Clock } from 'lucide-vue-next';
import { api } from '@/api';
import { toast } from '@/stores/toast';
import { formatDateTime, timeAgo } from '@/utils/format';

// Matching without lifting a finger (server/services/match-making.js): once sign-ups close the
// event checks art styles when they count, makes matches (best fit or at random) and publishes
// them, or leaves them for the organisers to check. In matching it can also be run straight away.
const props = defineProps({
  event: { type: Object, required: true },
});
const emit = defineEmits(['updated', 'ran']);

const uid = useId();
const settings = ref({ enabled: false, mode: 'best', publish: true });
const saving = ref(false);
const running = ref(false);

watch(
  () => props.event.autoMatch,
  (auto) => {
    settings.value = { enabled: Boolean(auto?.enabled), mode: auto?.mode || 'best', publish: auto?.publish !== false };
  },
  { immediate: true, deep: true }
);

const lastRun = computed(() => props.event.autoMatch?.lastRun || null);
const inMatching = computed(() => props.event.status === 'matching');

async function save(change) {
  const before = { ...settings.value };
  settings.value = { ...settings.value, ...change };
  saving.value = true;
  try {
    const { event } = await api(`/events/${props.event.id}/auto-match`, { method: 'PUT', body: change });
    emit('updated', event);
    if ('enabled' in change) toast.success(change.enabled ? 'This event will match itself.' : 'Automatic matching is off.');
  } catch (e) {
    settings.value = before;
    toast.error(e.message);
  } finally {
    saving.value = false;
  }
}

async function runNow() {
  running.value = true;
  try {
    const data = await api(`/events/${props.event.id}/auto-match/run`, { method: 'POST' });
    emit('updated', data.event);
    emit('ran', data);
    if (data.run.outcome === 'failed') toast.error(data.run.message);
    else toast.success(data.run.outcome === 'published' ? 'Matched and published.' : 'Matches are ready for you to check.');
  } catch (e) {
    toast.error(e.message);
  } finally {
    running.value = false;
  }
}

const MODES = [
  { value: 'best', label: 'Best fit', text: 'Pairs people by what they make, what they asked for, the characters they can draw and, if it\'s on, art style.' },
  { value: 'random', label: 'Random', text: 'Names out of a hat. Still never someone they blocked, and always someone they can make something for.' },
];
const OUTCOMES = {
  published: { icon: CircleCheck, label: 'Matched and published' },
  drafted: { icon: Clock, label: 'Waiting for you to check' },
  failed: { icon: CircleAlert, label: "Couldn't finish" },
};
</script>

<template>
  <section class="card p-5 sm:p-6 auto" :aria-labelledby="`${uid}-title`">
    <div class="head">
      <h3 :id="`${uid}-title`" class="title"><Wand2 :size="19" aria-hidden="true" /> Match automatically</h3>
      <label class="switch">
        <input
          type="checkbox"
          :checked="settings.enabled"
          :disabled="saving"
          role="switch"
          :aria-checked="settings.enabled ? 'true' : 'false'"
          @change="save({ enabled: $event.target.checked })"
        />
        <span class="track" aria-hidden="true"><span class="thumb" /></span>
        <span class="switch-label">{{ settings.enabled ? 'On' : 'Off' }}</span>
      </label>
    </div>
    <p class="hint m-0 mt-1">
      <template v-if="inMatching">Sign-ups are closed. </template>
      <template v-else>When sign-ups close ({{ formatDateTime(event.signupDeadline) }}), </template>
      Drawsicle checks art styles if they count, makes the matches and
      {{ settings.publish ? 'publishes them, telling everyone who they are making a gift for' : 'leaves them here for you to check and publish' }}.
      You get a notification either way.
    </p>

    <fieldset class="group" :disabled="saving">
      <legend class="legend">How to pair people</legend>
      <label v-for="m in MODES" :key="m.value" class="choice" :class="{ on: settings.mode === m.value }">
        <input type="radio" :name="`${uid}-mode`" :value="m.value" :checked="settings.mode === m.value" @change="save({ mode: m.value })" />
        <span>
          <strong>{{ m.label }}</strong>
          <span class="choice-text">{{ m.text }}</span>
        </span>
      </label>
    </fieldset>

    <fieldset class="group" :disabled="saving">
      <legend class="legend">Then</legend>
      <label class="choice" :class="{ on: settings.publish }">
        <input type="radio" :name="`${uid}-publish`" :checked="settings.publish" @change="save({ publish: true })" />
        <span><strong>Publish them straight away</strong><span class="choice-text">Unless someone couldn't be placed.</span></span>
      </label>
      <label class="choice" :class="{ on: !settings.publish }">
        <input type="radio" :name="`${uid}-publish`" :checked="!settings.publish" @change="save({ publish: false })" />
        <span><strong>Let me check them first</strong><span class="choice-text">You publish them from this tab.</span></span>
      </label>
    </fieldset>

    <div v-if="lastRun" class="last" :class="lastRun.outcome" role="status">
      <component :is="OUTCOMES[lastRun.outcome].icon" :size="18" aria-hidden="true" />
      <div class="min-w-0">
        <p class="m-0">
          <strong>{{ OUTCOMES[lastRun.outcome].label }}</strong>
          <time :datetime="lastRun.at" :title="formatDateTime(lastRun.at)"> · {{ timeAgo(lastRun.at) }}</time>
        </p>
        <p class="hint m-0">{{ lastRun.message }}</p>
      </div>
    </div>

    <button v-if="inMatching" type="button" class="btn btn-primary btn-sm run" :disabled="running" @click="runNow">
      <Loader2 v-if="running" :size="16" class="spin" aria-hidden="true" />
      <Play v-else :size="16" aria-hidden="true" />
      {{ running ? 'Matching…' : 'Run it now' }}
    </button>
  </section>
</template>

<style scoped>
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-family: var(--font-body);
  font-size: 1.05rem;
  font-weight: 700;
}
.switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: 700;
}
.switch input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}
.track {
  position: relative;
  width: 44px;
  height: 24px;
  border-radius: 999px;
  background: var(--border);
  transition: background 0.15s;
}
.thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.15s;
}
.switch input:checked + .track {
  background: var(--pink);
}
.switch input:checked + .track .thumb {
  transform: translateX(20px);
}
.switch input:focus-visible + .track {
  outline: 3px solid var(--pink);
  outline-offset: 2px;
}
.group {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px;
  margin: 14px 0 0;
  padding: 0;
  border: 0;
}
.legend {
  margin-bottom: 6px;
  font-size: 0.85rem;
  font-weight: 700;
}
.choice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border: 1.5px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
}
.choice.on {
  border-color: var(--pink);
  background: var(--pink-soft);
}
.choice input {
  margin-top: 4px;
  accent-color: var(--pink-dark);
}
.choice-text {
  display: block;
  color: var(--muted);
  font-size: 0.82rem;
}
.last {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--surface-2);
}
.last.published {
  color: inherit;
}
.last.published :deep(svg) {
  color: #2fa75b;
}
.last.failed :deep(svg) {
  color: #e5484d;
}
.last time {
  color: var(--muted);
  font-size: 0.8rem;
}
.run {
  margin-top: 14px;
}
@media (prefers-reduced-motion: reduce) {
  .track,
  .thumb {
    transition: none;
  }
}
</style>
