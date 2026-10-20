<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

// "Where exchanges happen": community tiles (monogram in the community's colour, never a real brand
// logo) drifting in two rows that move in opposite directions. Pauses on hover and focus; a still
// grid with reduced motion. Each tile searches the event list for that community.
const props = defineProps({
  communities: { type: Array, required: true }, // [{ name, colour, ink, initials, exchanges, artists }]
});

const rows = computed(() => {
  const list = props.communities;
  // Too few to loop nicely: one still row
  if (list.length < 6) return [list];
  return [list.filter((_, i) => i % 2 === 0), list.filter((_, i) => i % 2 === 1)];
});
const moving = computed(() => rows.value.length > 1);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
</script>

<template>
  <section class="communities" aria-labelledby="communities-heading">
    <p class="eyebrow"><span class="dot" aria-hidden="true" /> Where exchanges happen</p>
    <h2 id="communities-heading" class="title">Communities that run their swaps here.</h2>

    <div class="marquee" :class="{ moving }">
      <div v-for="(row, r) in rows" :key="r" class="row" :class="r % 2 ? 'rev' : 'fwd'">
        <ul class="track">
          <!-- A second copy follows the first so the loop is seamless; it's hidden from screen readers and keyboards -->
          <li
            v-for="(c, i) in moving ? [...row, ...row] : row"
            :key="`${c.name}-${i}`"
            :aria-hidden="i >= row.length ? 'true' : undefined"
          >
            <RouterLink
              :to="{ path: '/events', query: { q: c.name, status: 'all' } }"
              class="tile"
              :style="{ '--c': c.colour, '--ink': c.ink }"
              :tabindex="i >= row.length ? -1 : undefined"
            >
              <span class="mono" aria-hidden="true">{{ c.initials }}</span>
              <span class="text">
                <b>{{ c.name }}</b>
                <small>{{ plural(c.exchanges, 'exchange') }} · {{ plural(c.artists, 'artist') }}</small>
              </span>
            </RouterLink>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.communities {
  max-width: 1120px;
  margin: 0 auto;
  padding: 64px 0 24px;
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
  background: var(--pink);
  box-shadow: 0 0 10px var(--pink);
}
.title {
  margin: 10px 0 0;
  font-size: clamp(1.8rem, 4vw, 3rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.05;
}
.marquee {
  margin-top: 28px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.marquee.moving {
  overflow: hidden;
  mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
}
.track {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}
.moving .track {
  flex-wrap: nowrap;
  width: max-content;
  animation: drift 40s linear infinite;
}
.moving .rev .track {
  animation-direction: reverse;
  animation-duration: 46s;
}
.marquee:hover .track,
.marquee:focus-within .track {
  animation-play-state: paused;
}
@keyframes drift {
  from { transform: translateX(0); }
  to { transform: translateX(calc(-50% - 7px)); }
}
.tile {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px 12px 12px;
  border-radius: 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  white-space: nowrap;
}
.tile:hover b {
  color: var(--pink-dark);
}
.mono {
  width: 52px;
  height: 52px;
  border-radius: 15px;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 1.05rem;
  background: var(--c);
  color: var(--ink);
  box-shadow: 0 8px 20px color-mix(in srgb, var(--c) 45%, transparent);
}
.text {
  display: flex;
  flex-direction: column;
}
.text small {
  color: var(--muted);
  font-size: 0.76rem;
}
@media (prefers-reduced-motion: reduce) {
  .moving .track {
    animation: none;
    flex-wrap: wrap;
    width: auto;
  }
  .moving li[aria-hidden='true'] {
    display: none;
  }
  .marquee.moving {
    mask-image: none;
    -webkit-mask-image: none;
  }
}
</style>
