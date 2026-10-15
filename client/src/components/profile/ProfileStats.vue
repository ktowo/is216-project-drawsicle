<script setup>
import { CalendarHeart, Gift } from 'lucide-vue-next';

// Number tiles on a public profile: events organised, and exchanges completed unless the
// artist hides their exchanges (the stat is missing then).
defineProps({
  stats: { type: Object, default: () => ({}) },
});
</script>

<template>
  <ul class="stats" aria-label="Activity">
    <li class="card tile">
      <span class="tile-icon" aria-hidden="true"><CalendarHeart :size="22" /></span>
      <div>
        <p class="tile-num">{{ (stats.eventsOrganized || 0).toLocaleString('en-GB') }}</p>
        <p class="tile-label">{{ stats.eventsOrganized === 1 ? 'Event organised' : 'Events organised' }}</p>
      </div>
    </li>
    <li v-if="stats.exchangesCompleted !== undefined" class="card tile">
      <span class="tile-icon artist" aria-hidden="true"><Gift :size="22" /></span>
      <div>
        <p class="tile-num">{{ (stats.exchangesCompleted || 0).toLocaleString('en-GB') }}</p>
        <p class="tile-label">
          {{ stats.exchangesCompleted === 1 ? 'Exchange completed' : 'Exchanges completed' }}
        </p>
      </div>
    </li>
  </ul>
</template>

<style scoped>
.stats {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.tile {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 22px;
}
.tile-icon {
  flex-shrink: 0;
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: var(--pink-soft);
  color: var(--pink-dark);
}
.tile-icon.artist {
  background: var(--info-soft);
  color: var(--info);
}
.tile-num {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.9rem;
  font-weight: 800;
  line-height: 1;
}
.tile-label {
  margin: 4px 0 0;
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--muted);
}
@media (max-width: 420px) {
  .tile {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 16px;
  }
}
</style>
