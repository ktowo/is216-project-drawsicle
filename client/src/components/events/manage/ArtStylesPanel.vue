<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { RouterLink } from 'vue-router';
import { Eye, EyeOff, CircleAlert, RefreshCw, Palette } from 'lucide-vue-next';
import StyleMatchingCard from './StyleMatchingCard.vue';
import PersonLink from '@/components/events/PersonLink.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import { api } from '@/api';
import { auth } from '@/stores/auth';
import { can } from '@shared/permissions.mjs';
import { timeAgo } from '@/utils/format';

// The event's "Art styles" tab: is the vision model (Ollama) working right now, how styles count
// in matching, and what the scan found for each accepted artist. Descriptions only: organisers
// never see the pictures behind them.
const props = defineProps({
  event: { type: Object, required: true },
});
const emit = defineEmits(['updated']);

const vision = ref(null);
const people = ref([]);
const demo = ref(false);
const loading = ref(true);
const error = ref('');
let timer = null;

async function load() {
  error.value = '';
  try {
    const [scan, styles] = await Promise.all([
      api(`/events/${props.event.id}/matches/style-scan`),
      api(`/events/${props.event.id}/matches/style-profiles`),
    ]);
    vision.value = scan.vision;
    demo.value = Boolean(scan.demo || styles.demo);
    people.value = styles.people;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
onMounted(() => {
  load();
  // Keep the light honest while the tab is open
  timer = setInterval(async () => {
    try {
      vision.value = (await api(`/events/${props.event.id}/matches/style-scan`)).vision;
    } catch {
      // The next tick tries again
    }
  }, 60 * 1000);
});
onBeforeUnmount(() => clearInterval(timer));

// The big light at the top
const light = computed(() => {
  const v = vision.value;
  if (demo.value) return { tone: 'off', title: 'Not in the demo', text: 'Looking at art needs the real server.' };
  if (!v?.configured) return { tone: 'off', title: 'Colours only', text: 'No vision model is connected, so styles come from colour and texture alone.' };
  if (!v.reachable) return { tone: 'down', title: 'Vision model offline', text: "The Ollama server isn't answering. Scans fall back to colour and texture until it's back." };
  if (!v.vision) return { tone: 'partial', title: 'Vision model missing', text: `Ollama is up, but ${v.visionModel} isn't downloaded there.` };
  return { tone: 'ok', title: 'Vision model online', text: `${v.visionModel} describes each artist's style${v.embeddings ? ', and compares what it said' : ''}.` };
});

// What someone asked for at sign-up, short enough for a chip
const PREFERENCE = { similar: 'Wants a similar style', different: 'Wants a different style' };

const analysed = computed(() => people.value.filter((p) => p.style).length);
const withVision = computed(() => people.value.filter((p) => p.style?.usedVision).length);
</script>

<template>
  <div class="styles-panel">
    <section class="card light" :class="light.tone" aria-live="polite">
      <component :is="light.tone === 'ok' ? Eye : EyeOff" :size="26" class="light-icon" aria-hidden="true" />
      <div class="min-w-0">
        <h3 class="light-title">{{ light.title }}</h3>
        <p class="m-0">{{ light.text }}</p>
      </div>
      <RouterLink v-if="can(auth.user, 'stats.view') && !demo" to="/admin?tab=vision" class="btn btn-outline btn-sm light-link">
        Check the connection
      </RouterLink>
    </section>

    <StyleMatchingCard :event="event" @updated="emit('updated', $event)" @scanned="load" />

    <section class="card p-5 sm:p-6" aria-labelledby="styles-people">
      <div class="people-head">
        <h3 id="styles-people" class="people-title"><Palette :size="18" aria-hidden="true" /> What the scan found</h3>
        <span v-if="people.length" class="hint">
          {{ analysed }} of {{ people.length }} analysed<template v-if="analysed">, {{ withVision }} with the vision model</template>
        </span>
        <button type="button" class="btn btn-ghost btn-xs" @click="load"><RefreshCw :size="14" aria-hidden="true" /> Refresh</button>
      </div>
      <LoadingBlock v-if="loading" label="Loading styles…" />
      <ErrorBlock v-else-if="error" :message="error" @retry="load" />
      <p v-else-if="!people.length" class="hint m-0">Nobody has been accepted yet.</p>
      <ul v-else class="people">
        <li v-for="p in people" :key="p.user.id" class="person">
          <PersonLink :user="p.user" :size="30" />
          <span v-if="p.preference !== 'any'" class="pref" :title="'Asked for this when signing up'">
            {{ PREFERENCE[p.preference] }}
          </span>
          <template v-if="p.style">
            <span class="swatches" aria-hidden="true">
              <span v-for="c in p.style.palette.slice(0, 5)" :key="c" class="swatch" :style="{ background: c }" />
            </span>
            <ul class="tags">
              <li v-for="t in p.style.tags.slice(0, 5)" :key="t" class="tag">{{ t }}</li>
            </ul>
            <span class="when" :title="p.style.usedVision ? 'Described by the vision model' : 'Colours and texture only'">
              <component :is="p.style.usedVision ? Eye : EyeOff" :size="14" aria-hidden="true" />
              {{ timeAgo(p.style.analysedAt) }}
            </span>
          </template>
          <span v-else class="none"><CircleAlert :size="14" aria-hidden="true" /> Not analysed yet</span>
        </li>
      </ul>
      <p class="hint m-0 mt-3">
        Styles come from the pictures people add under "Your art style" on their profile, and from gifts they made in
        earlier exchanges. Organisers only ever see the descriptions.
      </p>
    </section>
  </div>
</template>

<style scoped>
.styles-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.light {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  box-shadow: inset 6px 0 0 var(--muted);
}
.light.ok {
  box-shadow: inset 6px 0 0 #3ecf6e;
}
.light.partial {
  box-shadow: inset 6px 0 0 #f0b429;
}
.light.down {
  box-shadow: inset 6px 0 0 #e5484d;
}
.light-icon {
  flex: none;
  color: var(--muted);
}
.ok .light-icon {
  color: #2fa75b;
}
.down .light-icon {
  color: #e5484d;
}
.partial .light-icon {
  color: #c98a12;
}
.light-title {
  margin: 0 0 2px;
  font-family: var(--font-body);
  font-size: 1.1rem;
  font-weight: 800;
}
.light-link {
  margin-left: auto;
}
.people-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-bottom: 12px;
}
.people-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-family: var(--font-body);
  font-size: 1.05rem;
  font-weight: 700;
}
.people-head .btn {
  margin-left: auto;
}
.people {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.person {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}
.person:last-child {
  border-bottom: 0;
}
.pref {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--pink-soft);
  color: var(--pink-dark);
  font-size: 0.75rem;
  font-weight: 700;
}
.swatches {
  display: inline-flex;
  gap: 3px;
}
.swatch {
  width: 16px;
  height: 16px;
  border-radius: 5px;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
}
.tags {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
  padding: 0;
}
.tag {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--surface-2);
  font-size: 0.75rem;
  font-weight: 600;
}
.when,
.none {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  color: var(--muted);
  font-size: 0.8rem;
}
</style>
