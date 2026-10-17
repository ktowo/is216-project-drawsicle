<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { api } from '@/api';
import OutcomesBand from './OutcomesBand.vue';
import OnTheRecord from './OnTheRecord.vue';

// The landing page story below the hero (docs/specs/showcase.md). Loads GET /api/showcase once,
// hands each section its slice, and refreshes it quietly every minute while the tab is visible.
// A section with nothing honest to show isn't rendered.
const data = ref(null);
const REFRESH_MS = 60 * 1000;
let timer = null;

async function load() {
  try {
    data.value = await api('/showcase');
  } catch {
    // The landing page still works without the showcase; keep what we had
  }
}
function refresh() {
  if (!document.hidden) load();
}

onMounted(() => {
  load();
  timer = setInterval(refresh, REFRESH_MS);
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <div v-if="data" class="landing-showcase">
    <OutcomesBand v-if="data.stats.exchanges" :stats="data.stats" />
    <OnTheRecord />
  </div>
</template>

<style scoped>
.landing-showcase {
  padding: 0 16px;
}
</style>
