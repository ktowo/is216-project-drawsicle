<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';

// Three real counts from GET /api/showcase that count up once when they scroll into view.
// The footnote says exactly what each number counts.
const props = defineProps({
  stats: { type: Object, required: true }, // { exchanges, artists, giftsRevealed, communities }
});

const KEYS = ['exchanges', 'artists', 'giftsRevealed'];
const shown = ref(Object.fromEntries(KEYS.map((k) => [k, 0])));
const band = ref(null);
let observer = null;

function countUp() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    shown.value = { ...props.stats };
    return;
  }
  // If animation frames are paused (a background tab), still end on the real numbers
  const fallback = setTimeout(() => (shown.value = { ...props.stats }), 1500);
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / 1200);
    const eased = 1 - Math.pow(1 - t, 3);
    shown.value = Object.fromEntries(KEYS.map((k) => [k, Math.round((props.stats[k] || 0) * eased)]));
    if (t < 1) requestAnimationFrame(tick);
    else clearTimeout(fallback);
  };
  requestAnimationFrame(tick);
}

onMounted(() => {
  if (typeof IntersectionObserver !== 'function') {
    shown.value = { ...props.stats };
    return;
  }
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        countUp();
        observer.disconnect();
      }
    },
    { threshold: 0.4 }
  );
  observer.observe(band.value);
});
onBeforeUnmount(() => observer?.disconnect());

const fmt = (n) => (n || 0).toLocaleString('en-GB');
</script>

<template>
  <section ref="band" class="outcomes" aria-labelledby="outcomes-heading">
    <div class="head">
      <h2 id="outcomes-heading" class="eyebrow"><span class="dot" aria-hidden="true" /> Outcomes</h2>
      <p class="source">From public exchanges</p>
    </div>
    <dl class="stats">
      <div class="stat pink">
        <span class="icon" aria-hidden="true">✦</span>
        <dt>exchanges run</dt>
        <dd>{{ fmt(shown.exchanges) }}</dd>
      </div>
      <div class="stat green">
        <span class="icon" aria-hidden="true">✿</span>
        <dt>artists taking part</dt>
        <dd>{{ fmt(shown.artists) }}</dd>
      </div>
      <div class="stat gold">
        <span class="icon" aria-hidden="true">★</span>
        <dt>gifts revealed</dt>
        <dd>{{ fmt(shown.giftsRevealed) }}</dd>
      </div>
    </dl>
    <p class="note">
      Counted from public exchanges across {{ fmt(stats.communities) }}
      {{ stats.communities === 1 ? 'community' : 'communities' }}. Artists are different people accepted into at least
      one exchange; gifts revealed are gifts handed in to finished exchanges.
    </p>
  </section>
</template>

<style scoped>
.outcomes {
  max-width: 1120px;
  margin: 40px auto 0;
  padding: 28px 32px 22px;
  border-radius: 28px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: 0 20px 50px rgba(90, 65, 30, 0.08);
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 16px;
  border-bottom: 1px dashed var(--border);
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
.source {
  margin: 0;
  font: 0.76rem ui-monospace, monospace;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
  margin: 0;
  padding: 26px 0;
}
.stat {
  position: relative;
  display: flex;
  flex-direction: column-reverse;
  padding: 22px 22px 20px;
  border-radius: 22px;
  background: var(--tint);
}
.stat.pink { --tone: var(--pink-dark); --tint: var(--pink-soft); }
.stat.green { --tone: #2f8f66; --tint: color-mix(in srgb, #a8e0c4 45%, transparent); }
.stat.gold { --tone: #a87a20; --tint: color-mix(in srgb, #f6df8f 50%, transparent); }
:root[data-theme='dark'] .stat.green { --tone: var(--success); --tint: var(--success-soft); }
:root[data-theme='dark'] .stat.gold { --tone: var(--warning); --tint: var(--warning-soft); }
.icon {
  position: absolute;
  top: 16px;
  right: 18px;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--surface);
  color: var(--tone);
}
dd {
  margin: 0;
  font-size: clamp(2.8rem, 7vw, 5rem);
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.04em;
  font-variant-numeric: tabular-nums;
  color: var(--tone);
}
dt {
  margin-top: 8px;
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text);
}
.note {
  margin: 0;
  padding-top: 14px;
  border-top: 1px dashed var(--border);
  color: var(--muted);
  font-size: 0.86rem;
}
@media (max-width: 700px) {
  .outcomes { margin: 24px 16px 0; padding: 22px 18px 18px; }
  .stats { grid-template-columns: 1fr; }
}
</style>
