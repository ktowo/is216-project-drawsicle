<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { RouterLink } from 'vue-router';
import { describeFeedRow } from '@/utils/showcase';

// "Happening now": public exchanges and what's going on in each, from GET /api/showcase.
// Relative times are worked out again every minute so they stay true while the page is open.
const props = defineProps({
  feed: { type: Array, required: true },
});

const now = ref(Date.now());
let clock = null;
onMounted(() => (clock = setInterval(() => (now.value = Date.now()), 60 * 1000)));
onBeforeUnmount(() => clearInterval(clock));

const rows = computed(() => props.feed.map((row) => ({ ...row, ...describeFeedRow(row, now.value) })));
</script>

<template>
  <section class="feed-section" aria-labelledby="feed-heading">
    <div class="head-row">
      <div>
        <p class="eyebrow"><span class="dot" aria-hidden="true" /> Live feed</p>
        <h2 id="feed-heading" class="title">Happening now</h2>
      </div>
      <p class="updated">Public exchanges · updates every minute</p>
    </div>

    <div class="window">
      <div class="bar" aria-hidden="true"><span /><span /><span /><em>drawsicle / exchanges / now</em></div>
      <table class="feed">
        <thead>
          <tr><th scope="col">Exchange</th><th scope="col">Community</th><th scope="col">Status</th><th scope="col">When</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="`${row.event.id}-${row.kind}`">
            <td>
              <RouterLink :to="`/events/${row.event.id}`" class="name">{{ row.event.name }}</RouterLink>
              <small>{{ row.detail }}</small>
            </td>
            <td class="community">{{ row.community || '—' }}</td>
            <td><span class="pill" :class="row.kind"><span aria-hidden="true">●</span> {{ row.pill }}</span></td>
            <td class="when">{{ row.when }}</td>
          </tr>
        </tbody>
      </table>
      <div class="foot"><span>Only public exchanges are listed</span><RouterLink to="/events">Browse all →</RouterLink></div>
    </div>
  </section>
</template>

<style scoped>
.feed-section {
  max-width: 1120px;
  margin: 0 auto;
  padding: 64px 0 24px;
}
.head-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  flex-wrap: wrap;
}
.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font: 700 0.78rem ui-monospace, monospace;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f6c945;
  box-shadow: 0 0 10px #f6c945;
}
.title {
  margin: 10px 0 0;
  font-size: clamp(1.8rem, 4vw, 3rem);
  font-weight: 800;
  letter-spacing: -0.02em;
}
.updated {
  margin: 0;
  font: 0.76rem ui-monospace, monospace;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
.window {
  margin-top: 24px;
  border: 1px solid var(--border);
  border-radius: 18px;
  overflow: hidden;
  background: var(--surface);
}
.bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.bar span {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid var(--muted);
}
.bar em {
  margin-left: auto;
  font: normal 0.72rem ui-monospace, monospace;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
}
.feed {
  width: 100%;
  border-collapse: collapse;
}
.feed th {
  text-align: left;
  font: 600 0.72rem ui-monospace, monospace;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.feed td {
  padding: 16px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
.name {
  display: block;
  font-weight: 700;
  color: var(--text);
}
.name:hover {
  color: var(--pink-dark);
}
.feed small {
  color: var(--muted);
}
.when {
  font: 0.85rem ui-monospace, monospace;
  color: var(--muted);
}
.pill {
  font-size: 0.78rem;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-weight: 700;
  white-space: nowrap;
}
.pill.open { color: #2f9e6e; }
.pill.active { color: #b9760f; }
.pill.revealed { color: var(--pink-dark); }
.pill.matching { color: #5a5ac9; }
.foot {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  font: 0.75rem ui-monospace, monospace;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
}
@media (max-width: 700px) {
  .feed thead { display: none; }
  .feed tr {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 10px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
  }
  .feed td { border: 0; padding: 0; }
  .feed .community { grid-column: 1; color: var(--muted); font-size: 0.85rem; }
  .feed .when { grid-column: 2; text-align: right; }
}
</style>
