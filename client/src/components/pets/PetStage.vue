<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import PetSprite from './PetSprite.vue';
import { lineFor } from './petLines';

// A little patch of floor for one pet to potter about on: it walks back and forth, sits,
// naps and hops. Parents can call feed(), pat() and say(text) through a template ref.
const props = defineProps({
  kind: { type: String, required: true },
  palette: { type: Object, required: true },
  name: { type: String, default: '' },
  size: { type: Number, default: 72 },
  height: { type: Number, default: 120 },
});

const HOPPERS = ['bunny', 'frog', 'bird', 'slime'];
const TICK = 120;

const stage = ref(null);
const x = ref(80);
const dir = ref(1);
const state = ref('stand');
const step = ref(0);
const bubble = ref('');
let until = 0;
let queue = [];
let bubbleTimer = 0;
let timer = 0;
let reduced = false;

const hop = computed(() => (state.value === 'walk' && HOPPERS.includes(props.kind) ? Math.abs(Math.sin(step.value * 0.9)) * 7 : 0));
const pose = computed(() => (hop.value > 2 && ['bunny', 'frog'].includes(props.kind) ? 'jump' : state.value));

const rand = (a, b) => a + Math.random() * (b - a);

function width() {
  return stage.value?.clientWidth || 300;
}

function choose(now) {
  if (queue.length) {
    const next = queue.shift();
    state.value = next.pose;
    until = now + next.ms;
    if (next.say) say(lineFor(props.kind, next.say, props.name));
    return;
  }
  if (reduced) {
    state.value = 'sit';
    until = now + 4000;
    return;
  }
  const r = Math.random();
  if (r < 0.5) {
    state.value = 'walk';
    until = now + rand(1800, 4200);
    if (Math.random() < 0.4) dir.value = -dir.value;
  } else if (r < 0.75) {
    state.value = 'sit';
    until = now + rand(1500, 3200);
  } else if (r < 0.9) {
    state.value = 'stand';
    until = now + rand(900, 1800);
  } else {
    state.value = 'sleep';
    until = now + rand(2500, 4500);
  }
}

function tick() {
  const now = performance.now();
  step.value += 1;
  if (state.value === 'walk') {
    const edge = props.size / 2 + 6;
    x.value += dir.value * 3.2 * (props.size / 72);
    if (x.value > width() - edge) {
      x.value = width() - edge;
      dir.value = -1;
    } else if (x.value < edge) {
      x.value = edge;
      dir.value = 1;
    }
  }
  if (now >= until) choose(now);
}

function say(text) {
  bubble.value = text;
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => (bubble.value = ''), 1700);
}

function play(steps) {
  queue = steps;
  until = 0;
}

function feed({ full = false } = {}) {
  if (full) {
    say(lineFor(props.kind, 'full', props.name));
    play([{ pose: 'sit', ms: 1400 }]);
  } else {
    play([
      { pose: 'eat', ms: 2200 },
      { pose: 'happy', ms: 1300, say: 'fed' },
    ]);
  }
}

function pat() {
  play([{ pose: 'happy', ms: 1800, say: 'petted' }]);
}

defineExpose({ feed, pat, say });

onMounted(() => {
  reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  x.value = width() / 2;
  choose(performance.now());
  timer = setInterval(tick, TICK);
});
onBeforeUnmount(() => {
  clearInterval(timer);
  clearTimeout(bubbleTimer);
});
</script>

<template>
  <div ref="stage" class="pet-stage" :style="{ height: `${height}px` }">
    <span class="floor" aria-hidden="true" />
    <div class="walker" :style="{ width: `${size}px`, transform: `translate(${x - size / 2}px, ${-hop}px)` }">
      <Transition name="bubble">
        <p v-if="bubble" class="bubble" aria-hidden="true">{{ bubble }}</p>
      </Transition>
      <PetSprite :kind="kind" :palette="palette" :state="pose" :step="step" :facing="dir < 0 ? 'left' : 'right'" :size="size" />
    </div>
  </div>
</template>

<style scoped>
.pet-stage {
  position: relative;
  overflow: hidden;
  border-radius: 18px;
  background:
    radial-gradient(circle at 16% 26%, var(--pink-soft) 0 22px, transparent 23px),
    radial-gradient(circle at 84% 20%, var(--info-soft) 0 16px, transparent 17px),
    radial-gradient(circle at 62% 38%, var(--warning-soft) 0 8px, transparent 9px),
    var(--surface-2);
}
.floor {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 22px;
  background: repeating-linear-gradient(90deg, var(--border) 0 2px, transparent 2px 46px), var(--hover);
  border-top: 2px solid var(--border-strong);
}
.walker {
  position: absolute;
  left: 0;
  bottom: 12px;
  transition: transform 0.12s linear;
}
.bubble {
  position: absolute;
  bottom: calc(100% + 2px);
  left: 50%;
  translate: -50% 0;
  margin: 0;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  border: 1.5px solid var(--border-strong);
  font-size: 0.75rem;
  font-weight: 700;
  white-space: nowrap;
  pointer-events: none;
}
.bubble-enter-active {
  transition:
    scale 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.15s;
}
.bubble-leave-active {
  transition: opacity 0.15s;
}
.bubble-enter-from,
.bubble-leave-to {
  scale: 0.5;
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .walker {
    transition: none;
  }
}
</style>
