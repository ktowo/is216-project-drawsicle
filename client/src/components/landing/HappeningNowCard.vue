<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { RouterLink } from 'vue-router';
import { X, ArrowRight } from 'lucide-vue-next';
import { describeFeedRow } from '@/utils/showcase';

// A small card in the bottom-left corner that shows one real public exchange at a time, with a
// button to it. It appears once you've scrolled past the hero and disappears before the element
// marked data-floating-stop (the features grid). Moves on every 3 seconds; pauses on hover, focus
// and when the tab is hidden; can be closed for the rest of the visit.
const props = defineProps({
  feed: { type: Array, required: true },
});

const ROTATE_MS = 3000;
const DISMISS_KEY = 'drawsicle-happening-closed';

// Exchanges you can still act on first, then recent reveals
const items = computed(() => [
  ...props.feed.filter((r) => r.kind !== 'revealed'),
  ...props.feed.filter((r) => r.kind === 'revealed'),
]);
const index = ref(0);
const current = computed(() => {
  const row = items.value[index.value % Math.max(1, items.value.length)];
  return row ? { ...row, ...describeFeedRow(row) } : null;
});

const inRange = ref(false);
const dismissed = ref(false);
const paused = ref(false);
const visible = computed(() => inRange.value && !dismissed.value && Boolean(current.value));

let frame = 0;
function measure() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    const hero = document.querySelector('.hero');
    // Until the features grid carries data-floating-stop, stop at its heading's section
    const stop = document.querySelector('[data-floating-stop]') || document.querySelector('#features-heading')?.closest('section');
    const pastHero = hero ? hero.getBoundingClientRect().bottom < 0 : window.scrollY > 400;
    const beforeStop = stop ? stop.getBoundingClientRect().top > window.innerHeight : true;
    inRange.value = pastHero && beforeStop;
  });
}

let timer = null;
function tick() {
  if (!visible.value || paused.value || document.hidden || items.value.length < 2) return;
  index.value = (index.value + 1) % items.value.length;
}

onMounted(() => {
  try {
    dismissed.value = sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    /* storage unavailable: it just shows again next time */
  }
  window.addEventListener('scroll', measure, { passive: true });
  window.addEventListener('resize', measure);
  measure();
  timer = setInterval(tick, ROTATE_MS);
});
onBeforeUnmount(() => {
  window.removeEventListener('scroll', measure);
  window.removeEventListener('resize', measure);
  cancelAnimationFrame(frame);
  clearInterval(timer);
});

function dismiss() {
  dismissed.value = true;
  try {
    sessionStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* storage unavailable */
  }
}
</script>

<template>
  <Transition name="slide">
    <aside
      v-if="visible"
      class="happening"
      aria-label="Happening now"
      @mouseenter="paused = true"
      @mouseleave="paused = false"
      @focusin="paused = true"
      @focusout="paused = false"
    >
      <button type="button" class="close" aria-label="Hide this card" @click="dismiss"><X :size="14" /></button>
      <Transition name="swap" mode="out-in">
        <div :key="`${current.event.id}-${current.kind}`" class="body">
          <p class="eyebrow"><span class="dot" :class="current.kind" aria-hidden="true" /> Happening now · {{ current.pill }}</p>
          <p class="title">{{ current.event.name }}</p>
          <p class="meta">
            <template v-if="current.community">{{ current.community }} · </template>{{ current.detail }} · {{ current.when }}
          </p>
        </div>
      </Transition>
      <div class="foot">
        <span class="pager" aria-hidden="true">
          <span v-for="(r, i) in items" :key="`${r.event.id}-${r.kind}`" :class="{ on: i === index % items.length }" />
        </span>
        <RouterLink :to="`/events/${current.event.id}`" class="go">
          {{ current.action }} <ArrowRight :size="16" aria-hidden="true" />
        </RouterLink>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.happening {
  position: fixed;
  left: 20px;
  bottom: 20px;
  z-index: 900;
  width: min(360px, calc(100vw - 40px));
  padding: 16px 16px 14px;
  border-radius: 20px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: 0 18px 50px rgba(60, 40, 20, 0.22);
}
.close {
  position: absolute;
  top: -10px;
  right: -10px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.body {
  min-height: 74px;
}
.eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font: 600 0.72rem ui-monospace, monospace;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2f9e6e;
  box-shadow: 0 0 8px #2f9e6e;
  animation: blink 2s infinite;
}
.dot.active { background: #d18a1d; box-shadow: 0 0 8px #d18a1d; }
.dot.matching { background: #6b6bd6; box-shadow: 0 0 8px #6b6bd6; }
.dot.revealed { background: var(--pink); box-shadow: 0 0 8px var(--pink); }
@keyframes blink { 50% { opacity: 0.4; } }
.title {
  margin: 8px 0 0;
  font-size: 1.15rem;
  font-weight: 800;
  line-height: 1.2;
}
.meta {
  margin: 4px 0 0;
  font-size: 0.85rem;
  color: var(--muted);
}
.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
}
.pager {
  display: flex;
  gap: 5px;
}
.pager span {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--border);
  transition: width 0.3s, background 0.3s;
}
.pager span.on {
  width: 18px;
  background: var(--pink);
}
.go {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border-radius: 12px;
  background: var(--pink);
  color: #fff;
  font-weight: 800;
  box-shadow: 0 6px 18px color-mix(in srgb, var(--pink) 45%, transparent);
}
.slide-enter-active, .slide-leave-active { transition: transform 0.35s ease, opacity 0.35s ease; }
.slide-enter-from, .slide-leave-to { transform: translateY(24px); opacity: 0; }
.swap-enter-active, .swap-leave-active { transition: transform 0.25s ease, opacity 0.25s ease; }
.swap-enter-from { transform: translateY(8px); opacity: 0; }
.swap-leave-to { transform: translateY(-8px); opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .slide-enter-active, .slide-leave-active, .swap-enter-active, .swap-leave-active, .pager span { transition: none; }
  .dot { animation: none; }
}
</style>
