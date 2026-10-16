<script setup>
import { ref, onBeforeUnmount } from 'vue';

// A wrapped present that opens when clicked (the reveal page shows gifts like this first).
// Emits `opened` once the lid has come off; straight away for people who prefer less motion.
const props = defineProps({
  label: { type: String, required: true }, // what a screen reader announces, e.g. "Unwrap the gift for Mika"
  caption: { type: String, default: '' },
  tone: { type: Number, default: 0 },
  size: { type: String, default: 'sm', validator: (v) => ['sm', 'lg'].includes(v) },
});
const emit = defineEmits(['opened']);

const opening = ref(false);
let timer = null;

function open() {
  if (opening.value) return;
  const calm = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (calm) {
    emit('opened');
    return;
  }
  opening.value = true;
  timer = setTimeout(() => emit('opened'), 700);
}
onBeforeUnmount(() => clearTimeout(timer));

const PAPERS = 6;
</script>

<template>
  <button
    type="button"
    class="present"
    :class="[size, `paper-${((tone % PAPERS) + PAPERS) % PAPERS}`, { opening }]"
    :aria-label="label"
    :disabled="opening"
    @click="open"
  >
    <span class="box" aria-hidden="true">
      <span class="burst">
        <span v-for="n in 8" :key="n" class="spark" :style="{ '--a': `${n * 45}deg` }" />
      </span>
      <span class="lid">
        <span class="bow"><span class="loop left" /><span class="loop right" /><span class="knot" /></span>
      </span>
      <span class="body"><span class="ribbon" /></span>
    </span>
    <span v-if="caption" class="caption">{{ caption }}</span>
  </button>
</template>

<style scoped>
.present {
  --w: 96px;
  --paper: var(--pink);
  --paper-2: var(--pink-soft);
  --ribbon: #fff7e6;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  width: 100%;
  height: 100%;
  min-height: 190px;
  padding: 18px 12px;
  border: 0;
  border-radius: inherit;
  background: radial-gradient(circle at 50% 40%, var(--surface-2), transparent 70%);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.present.lg {
  --w: 150px;
  min-height: 280px;
}
.present:focus-visible {
  outline: 3px solid var(--pink);
  outline-offset: -3px;
}
.paper-1 {
  --paper: var(--info);
  --paper-2: var(--info-soft);
}
.paper-2 {
  --paper: var(--success);
  --paper-2: var(--success-soft);
}
.paper-3 {
  --paper: var(--warning);
  --paper-2: var(--warning-soft);
  --ribbon: #c8414f;
}
.paper-4 {
  --paper: var(--purple-ink);
  --paper-2: var(--purple-soft);
}
.paper-5 {
  --paper: var(--orange-ink, #d9772b);
  --paper-2: var(--orange-soft, #fdebdc);
}

.box {
  position: relative;
  display: block;
  width: var(--w);
  height: calc(var(--w) * 0.95);
}
.lid,
.body {
  position: absolute;
  left: 50%;
  border-radius: 6px;
  /* Wrapping paper: a soft polka dot over the main colour */
  background-color: var(--paper);
  background-image: radial-gradient(var(--paper-2) 18%, transparent 20%);
  background-size: calc(var(--w) / 6) calc(var(--w) / 6);
  box-shadow: inset 0 -4px 0 rgba(0, 0, 0, 0.12);
}
.body {
  bottom: 0;
  width: calc(var(--w) * 0.86);
  height: calc(var(--w) * 0.62);
  transform: translateX(-50%);
}
.lid {
  top: calc(var(--w) * 0.12);
  width: var(--w);
  height: calc(var(--w) * 0.22);
  transform: translateX(-50%);
  z-index: 2;
  transition: transform 0.55s cubic-bezier(0.3, 1.4, 0.5, 1), opacity 0.45s ease 0.2s;
}
/* The ribbon down the middle of the box and across the lid */
.ribbon,
.lid::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: calc(var(--w) * 0.14);
  transform: translateX(-50%);
  background: var(--ribbon);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06);
}
.bow {
  position: absolute;
  left: 50%;
  bottom: 100%;
  width: calc(var(--w) * 0.5);
  height: calc(var(--w) * 0.24);
  transform: translateX(-50%);
}
.loop {
  position: absolute;
  bottom: -2px;
  width: 50%;
  height: 100%;
  border: calc(var(--w) * 0.06) solid var(--ribbon);
  border-radius: 50% 50% 10% 50%;
}
.loop.left {
  left: 0;
  transform: rotate(-20deg);
  transform-origin: right bottom;
}
.loop.right {
  right: 0;
  border-radius: 50% 50% 50% 10%;
  transform: rotate(20deg);
  transform-origin: left bottom;
}
.knot {
  position: absolute;
  left: 50%;
  bottom: -4px;
  width: calc(var(--w) * 0.14);
  height: calc(var(--w) * 0.12);
  transform: translateX(-50%);
  border-radius: 4px;
  background: var(--ribbon);
}
.caption {
  font-weight: 700;
  font-size: 0.95rem;
  text-align: center;
  overflow-wrap: anywhere;
}
.lg .caption {
  font-size: 1.05rem;
  max-width: 30ch;
}

/* A little sparkle burst as the lid comes off */
.burst {
  position: absolute;
  left: 50%;
  top: 30%;
  width: 0;
  height: 0;
  z-index: 3;
}
.spark {
  position: absolute;
  width: 8px;
  height: 8px;
  margin: -4px;
  border-radius: 50%;
  background: var(--paper);
  opacity: 0;
}
.spark:nth-child(even) {
  background: var(--ribbon);
}

@media (prefers-reduced-motion: no-preference) {
  .present:hover .box,
  .present:focus-visible .box {
    animation: wiggle 0.6s ease-in-out;
  }
  .opening .lid {
    transform: translate(-50%, -90%) rotate(-16deg);
    opacity: 0;
  }
  .opening .body {
    animation: settle 0.6s ease forwards;
  }
  .opening .spark {
    animation: spark 0.6s ease-out forwards;
  }
}

@keyframes wiggle {
  0%,
  100% {
    transform: rotate(0);
  }
  25% {
    transform: rotate(-4deg);
  }
  50% {
    transform: rotate(3deg);
  }
  75% {
    transform: rotate(-2deg);
  }
}
@keyframes settle {
  40% {
    transform: translateX(-50%) scale(1.06, 0.94);
  }
  100% {
    transform: translateX(-50%) scale(0.9);
    opacity: 0.4;
  }
}
@keyframes spark {
  0% {
    opacity: 1;
    transform: rotate(var(--a)) translateY(0);
  }
  100% {
    opacity: 0;
    transform: rotate(var(--a)) translateY(calc(var(--w) * -0.7));
  }
}
</style>
