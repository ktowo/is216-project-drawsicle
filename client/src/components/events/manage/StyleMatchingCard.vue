<script setup>
import { ref, computed, watch, onBeforeUnmount, useId } from 'vue';
import { Palette, ScanEye, Loader2, Sparkles, CircleAlert } from 'lucide-vue-next';
import { api } from '@/api';
import { toast } from '@/stores/toast';
import { STYLE_MODES, STYLE_MODE_LABELS } from '@shared/style.mjs';

// Matching by art style: whether to pair similar or contrasting styles, and a scan that works out
// everyone's style from their pictures (colours and texture always; with the vision model on
// Ollama when it's reachable). People can also ask for their own when they sign up.
const props = defineProps({
  event: { type: Object, required: true },
});
const emit = defineEmits(['updated']);

const uid = useId();
const mode = ref(props.event.matchingRules?.style || 'off');
const saving = ref(false);
const info = ref(null); // { scan, profiles: { withStyle, total }, vision, demo? }
const starting = ref(false);
let timer = null;

watch(
  () => props.event.matchingRules?.style,
  (value) => (mode.value = value || 'off')
);

async function load() {
  try {
    info.value = await api(`/events/${props.event.id}/matches/style-scan`);
  } catch {
    info.value = null;
  }
  clearTimeout(timer);
  if (info.value?.scan?.status === 'running') timer = setTimeout(load, 2500);
}
watch(() => props.event.id, load, { immediate: true });
onBeforeUnmount(() => clearTimeout(timer));

async function saveMode(value) {
  saving.value = true;
  try {
    const { event } = await api(`/events/${props.event.id}/matching-rules`, { method: 'PUT', body: { style: value } });
    emit('updated', event);
    toast.success(value === 'off' ? "Art styles won't count when matching." : 'Saved. Generate matches again to use it.');
  } catch (e) {
    mode.value = props.event.matchingRules?.style || 'off';
    toast.error(e.message);
  } finally {
    saving.value = false;
  }
}

async function scan() {
  starting.value = true;
  try {
    info.value = await api(`/events/${props.event.id}/matches/style-scan`, { method: 'POST', body: {} });
    load();
  } catch (e) {
    toast.error(e.message);
  } finally {
    starting.value = false;
  }
}

const running = computed(() => info.value?.scan?.status === 'running');
const progress = computed(() => {
  const s = info.value?.scan;
  return s?.total ? Math.round((s.done / s.total) * 100) : 0;
});
const visionText = computed(() => {
  const v = info.value?.vision;
  if (!v?.configured) return 'Colour and texture only. Connect an Ollama vision server for style and subject tags.';
  if (!v.reachable) return "The Ollama vision server isn't reachable right now, so only colours and texture are used.";
  if (!v.vision) return `Ollama is connected, but the ${v.visionModel} model isn't installed there.`;
  return `Using ${v.visionModel} on your Ollama server for style tags${v.embeddings ? ' and meaning' : ''}.`;
});
</script>

<template>
  <section class="card p-5 sm:p-6 style-card" :aria-labelledby="`${uid}-title`">
    <h3 :id="`${uid}-title`" class="title"><Palette :size="19" aria-hidden="true" /> Match by art style</h3>
    <p class="hint m-0 mt-1">
      Pairs people whose art looks alike, or deliberately different, using pictures from their profiles and their past
      gifts. People can also ask for their own when they sign up, which wins over this.
    </p>

    <fieldset class="modes">
      <legend class="sr-only">How to use art styles</legend>
      <label v-for="m in STYLE_MODES" :key="m" class="mode" :class="{ on: mode === m }">
        <input v-model="mode" type="radio" :name="`${uid}-mode`" :value="m" :disabled="saving" @change="saveMode(m)" />
        <span>{{ STYLE_MODE_LABELS[m] }}</span>
      </label>
    </fieldset>

    <div v-if="info" class="scan">
      <p v-if="info.demo" class="alert alert-info m-0">
        <CircleAlert :size="16" aria-hidden="true" /> Scanning art styles needs the real server, so it isn't part of the demo.
      </p>
      <template v-else>
        <p class="m-0">
          <strong>{{ info.profiles.withStyle }} of {{ info.profiles.total }}</strong> accepted artists have a style profile.
        </p>
        <p class="hint m-0 vision"><Sparkles :size="14" aria-hidden="true" /> {{ visionText }}</p>
        <div v-if="running" class="progress" role="progressbar" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100" aria-label="Scanning art styles">
          <span :style="{ width: `${progress}%` }" />
        </div>
        <p v-if="running" class="hint m-0" aria-live="polite">
          Looking at everyone's art: {{ info.scan.done }} of {{ info.scan.total }}…
        </p>
        <button type="button" class="btn btn-outline btn-sm" :disabled="running || starting" @click="scan">
          <Loader2 v-if="running || starting" :size="16" class="spin" aria-hidden="true" />
          <ScanEye v-else :size="16" aria-hidden="true" />
          {{ running ? 'Scanning…' : info.scan ? 'Scan again' : 'Scan art styles' }}
        </button>
      </template>
    </div>
  </section>
</template>

<style scoped>
.title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-family: var(--font-body);
  font-size: 1.05rem;
  font-weight: 700;
}
.modes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 14px 0 0;
  padding: 0;
  border: 0;
}
.mode {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1.5px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9rem;
}
.mode.on {
  border-color: var(--pink);
  background: var(--pink-soft);
}
.mode input {
  accent-color: var(--pink);
}
.scan {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}
.vision {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}
.vision svg {
  flex-shrink: 0;
  margin-top: 3px;
}
.progress {
  width: 100%;
  max-width: 360px;
  height: 8px;
  border-radius: 999px;
  background: var(--chip);
  overflow: hidden;
}
.progress span {
  display: block;
  height: 100%;
  background: var(--pink);
  transition: width 0.3s;
}
</style>
