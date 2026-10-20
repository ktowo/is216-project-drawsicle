<script setup>
import { Gift, Sparkles, Trophy, Clock, LifeBuoy, Heart, Palette, Flag, Crown, Award } from 'lucide-vue-next';

// Badges on a public profile (shared/badges.mjs decides who earns what). Each shows its
// meaning in words, not just on hover, so it works on touch screens and screen readers.
defineProps({
  badges: { type: Array, default: () => [] },
});

const ICONS = { gift: Gift, sparkles: Sparkles, trophy: Trophy, clock: Clock, lifebuoy: LifeBuoy, heart: Heart, palette: Palette, flag: Flag, crown: Crown };
const TONES = ['pink', 'info', 'success', 'warning', 'purple'];
const toneOf = (i) => TONES[i % TONES.length];
</script>

<template>
  <section v-if="badges.length" class="badges-section" aria-labelledby="badges-heading">
    <h2 id="badges-heading" class="heading"><Award :size="18" aria-hidden="true" /> Badges</h2>
    <ul class="badges">
      <li v-for="(b, i) in badges" :key="b.key" class="badge-card card" :class="`tone-${toneOf(i)}`">
        <span class="medal" aria-hidden="true">
          <component :is="ICONS[b.icon] || Award" :size="20" />
        </span>
        <span class="text">
          <span class="label">{{ b.label }}</span>
          <span class="desc">{{ b.description }}</span>
        </span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.badges-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-family: var(--font-body);
  font-size: 1.05rem;
  font-weight: 700;
}
.badges {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr));
}
.badge-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  min-width: 0;
}
.medal {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid currentColor;
  box-shadow: inset 0 0 0 3px var(--surface);
}
.tone-pink .medal {
  background: var(--pink-soft);
  color: var(--pink-dark);
}
.tone-info .medal {
  background: var(--info-soft);
  color: var(--info);
}
.tone-success .medal {
  background: var(--success-soft);
  color: var(--success);
}
.tone-warning .medal {
  background: var(--warning-soft);
  color: var(--warning);
}
.tone-purple .medal {
  background: var(--purple-soft);
  color: var(--purple-ink);
}
.text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.label {
  font-weight: 700;
}
.desc {
  font-size: 0.82rem;
  color: var(--muted);
}
</style>
