<script setup>
import { computed } from 'vue';

// A little pixel-art cat, drawn with its feet at (x, y). Like the avatars it's drawn facing
// right; facing left mirrors it, and from behind ('n' facings) you see the back of its head.
//   state: walk | stand | sit | groom | loaf | sleep
//   petted: eyes shut and hearts while someone strokes it
//   bubble: an emoji in a little speech bubble (its mood)
const props = defineProps({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  facing: { type: String, default: 'se' },
  state: { type: String, default: 'stand' },
  step: { type: Number, default: 0 },
  coat: { type: Object, required: true }, // { body, patch, stripe, ear, eye }
  petted: { type: Boolean, default: false },
  bubble: { type: String, default: '' },
  name: { type: String, default: '' },
  showName: { type: Boolean, default: false },
  dim: { type: Number, default: 1 },
});

const mirrored = computed(() => props.facing.endsWith('w'));
const fromBehind = computed(() => props.facing.startsWith('n'));
const walking = computed(() => props.state === 'walk');
const stride = computed(() => (walking.value ? (props.step % 2 === 0 ? 1 : -1) : 0));
const upright = computed(() => props.state === 'sit' || props.state === 'groom');
const eyesShut = computed(() => props.petted || props.state === 'sleep');
const top = computed(() => (props.state === 'sleep' ? -16 : props.state === 'loaf' ? -22 : upright.value ? -32 : -27));
const tagWidth = computed(() => Math.max(34, props.name.length * 6.2 + 14));
// Wide enough for an emoji, or an emoji and a word ("😻 purr~")
const bubbleWidth = computed(() => Math.max(26, [...props.bubble].length * 6.4 + 12));
</script>

<template>
  <g :transform="`translate(${x.toFixed(1)} ${y.toFixed(1)})`" class="cat" :class="[`cat-${state}`, { petted }]">
    <ellipse cx="0" cy="0" rx="11" ry="4" class="shadow" />
    <g :transform="mirrored ? 'scale(-1 1)' : undefined" :style="dim < 1 ? { filter: `brightness(${dim})` } : undefined">
      <!-- Curled up asleep -->
      <template v-if="state === 'sleep'">
        <g class="breathe">
          <ellipse cx="-1" cy="-5" rx="10" ry="5.5" :fill="coat.body" />
          <ellipse cx="-3" cy="-3.5" rx="6" ry="2.6" :fill="coat.patch" />
          <path v-if="coat.stripe" d="M -7 -9 l 1.5 2.5 M -3 -10.5 l 1 2.8 M 1 -10.5 l 0.5 2.8" :stroke="coat.stripe" stroke-width="1.6" />
          <path d="M -10 -3 C -8 2 4 2 9 -1" fill="none" :stroke="coat.body" stroke-width="3" stroke-linecap="round" />
          <circle cx="6" cy="-6" r="4.6" :fill="coat.body" />
          <polygon points="3,-9 3.8,-12.5 6,-10" :fill="coat.body" />
          <polygon points="6.5,-10.2 9,-12.6 9.6,-8.6" :fill="coat.body" />
          <path d="M 5.6 -6 q 1.1 1 2.2 0" fill="none" stroke="#2b2230" stroke-width="0.9" stroke-linecap="round" />
        </g>
        <text x="8" y="-15" class="zzz">z</text>
      </template>

      <!-- Sitting up (and grooming), or lying with its paws tucked in -->
      <template v-else-if="upright || state === 'loaf'">
        <template v-if="upright">
          <path d="M -6 -1 C -12 -1 -12 -6 -9 -8" fill="none" :stroke="coat.body" stroke-width="3" stroke-linecap="round" class="tail" />
          <rect x="-6" y="-15" width="11" height="15" rx="5" :fill="coat.body" />
          <rect v-if="!fromBehind" x="0" y="-12" width="5" height="9" rx="2.5" :fill="coat.patch" />
          <path v-if="coat.stripe" d="M -5 -12 h 3 M -5 -8 h 3" :stroke="coat.stripe" stroke-width="1.6" />
          <rect x="1" y="-6" width="2.5" height="6" rx="1" :fill="coat.body" />
          <rect x="3.6" y="-6" width="2.5" height="6" rx="1" :fill="coat.body" />
          <rect x="1" y="-1.5" width="5.1" height="1.5" :fill="coat.patch" />
        </template>
        <template v-else>
          <path d="M -9 -2 C -12 -1 -9 1 -3 0" fill="none" :stroke="coat.body" stroke-width="3" stroke-linecap="round" />
          <rect x="-9" y="-9" width="17" height="9" rx="4.5" :fill="coat.body" />
          <rect v-if="!fromBehind" x="-5" y="-4" width="10" height="3" rx="1.5" :fill="coat.patch" />
          <path v-if="coat.stripe" d="M -6 -9 v 3 M -2 -9 v 3 M 2 -9 v 3" :stroke="coat.stripe" stroke-width="1.6" />
        </template>
        <g class="head" :transform="upright ? 'translate(-3 -6)' : 'translate(0 2)'">
          <rect x="2" y="-20" width="11" height="10" rx="4" :fill="coat.body" />
          <polygon points="3,-18 4.5,-24 7.5,-19" :fill="coat.body" />
          <polygon points="8,-19 11,-24 12.5,-18" :fill="coat.body" />
          <polygon points="4,-19 4.8,-22.4 6.5,-19.4" :fill="coat.ear" />
          <polygon points="9,-19.4 10.6,-22.4 11.6,-19" :fill="coat.ear" />
          <template v-if="!fromBehind">
            <rect x="9" y="-14" width="4.5" height="3" rx="1.5" :fill="coat.patch" />
            <template v-if="eyesShut">
              <path d="M 8.6 -16 q 1.2 -1.2 2.4 0" fill="none" stroke="#2b2230" stroke-width="0.9" stroke-linecap="round" />
            </template>
            <template v-else>
              <rect x="8.6" y="-17.4" width="2.2" height="2.6" rx="0.6" :fill="coat.eye" />
              <rect x="9.4" y="-17.2" width="0.8" height="2.2" fill="#1d1a22" />
            </template>
            <rect x="12.6" y="-14.6" width="1.3" height="1" fill="#e88a9a" />
          </template>
        </g>
        <!-- A paw up to lick while grooming -->
        <rect v-if="state === 'groom'" x="5" y="-17" width="2.5" height="6" rx="1.2" :fill="coat.body" class="paw" />
      </template>

      <!-- Standing or walking -->
      <template v-else>
        <path d="M -9 -11 C -14 -12 -15 -18 -12 -21" fill="none" :stroke="coat.body" stroke-width="3" stroke-linecap="round" class="tail" />
        <rect x="-9" :y="-6 + Math.max(0, stride) * -1.5" width="2.5" height="6" rx="1" :fill="coat.body" />
        <rect x="3" :y="-6 + Math.max(0, stride) * -1.5" width="2.5" height="6" rx="1" :fill="coat.body" />
        <rect x="-6" :y="-6 + Math.max(0, -stride) * -1.5" width="2.5" height="6" rx="1" :fill="coat.body" class="far-leg" />
        <rect x="0" :y="-6 + Math.max(0, -stride) * -1.5" width="2.5" height="6" rx="1" :fill="coat.body" class="far-leg" />
        <rect x="-10" y="-13" width="17" height="8" rx="4" :fill="coat.body" />
        <rect v-if="!fromBehind" x="-7" y="-8" width="11" height="3" rx="1.5" :fill="coat.patch" />
        <path v-if="coat.stripe" d="M -7 -13 v 3.5 M -3 -13 v 3.5 M 1 -13 v 3.5" :stroke="coat.stripe" stroke-width="1.8" />
        <g class="head">
          <rect x="2" y="-20" width="11" height="10" rx="4" :fill="coat.body" />
          <polygon points="3,-18 4.5,-24 7.5,-19" :fill="coat.body" />
          <polygon points="8,-19 11,-24 12.5,-18" :fill="coat.body" />
          <polygon points="4,-19 4.8,-22.4 6.5,-19.4" :fill="coat.ear" />
          <polygon points="9,-19.4 10.6,-22.4 11.6,-19" :fill="coat.ear" />
          <template v-if="!fromBehind">
            <rect x="9" y="-14" width="4.5" height="3" rx="1.5" :fill="coat.patch" />
            <path v-if="eyesShut" d="M 8.6 -16 q 1.2 -1.2 2.4 0" fill="none" stroke="#2b2230" stroke-width="0.9" stroke-linecap="round" />
            <template v-else>
              <rect x="8.6" y="-17.4" width="2.2" height="2.6" rx="0.6" :fill="coat.eye" />
              <rect x="9.4" y="-17.2" width="0.8" height="2.2" fill="#1d1a22" />
            </template>
            <rect x="12.6" y="-14.6" width="1.3" height="1" fill="#e88a9a" />
          </template>
        </g>
      </template>
    </g>

    <text v-if="petted" x="0" :y="top + 4" class="hearts">♥ ♥</text>

    <g v-if="showName" class="tag">
      <rect :x="-tagWidth / 2" :y="top - 2" :width="tagWidth" height="14" rx="7" />
      <text x="0" :y="top + 8">{{ name }}</text>
    </g>

    <g v-if="bubble" class="bubble">
      <rect :x="-bubbleWidth / 2" :y="top - (showName ? 26 : 22)" :width="bubbleWidth" height="19" rx="7" />
      <path :d="`M -3 ${top - (showName ? 7.5 : 3.5)} l 3 4 l 3 -4 z`" />
      <text x="0" :y="top - (showName ? 12 : 8)">{{ bubble }}</text>
    </g>
  </g>
</template>

<style scoped>
.cat {
  cursor: pointer;
}
.shadow {
  fill: rgba(0, 0, 0, 0.25);
}
.zzz,
.hearts {
  font-family: var(--font-body);
  font-weight: 800;
  text-anchor: middle;
  pointer-events: none;
}
.zzz {
  fill: #c9c3ff;
  font-size: 9px;
  stroke: #2b2230;
  stroke-width: 2px;
  paint-order: stroke;
}
.hearts {
  fill: #ec4f86;
  font-size: 9px;
}
.far-leg {
  filter: brightness(0.85);
}
.tag rect {
  fill: rgba(20, 16, 28, 0.78);
}
.tag text {
  fill: #fff;
  font-size: 9px;
  font-weight: 700;
  text-anchor: middle;
  font-family: var(--font-body);
}
.bubble rect,
.bubble path {
  fill: #fffdf8;
  stroke: #2b2230;
  stroke-width: 1;
}
.bubble path {
  stroke-width: 0;
}
.bubble text {
  fill: #2b2230;
  font-family: var(--font-body);
  font-size: 11px;
  font-weight: 700;
  text-anchor: middle;
}
.bubble {
  transform-box: fill-box;
  transform-origin: 50% 100%;
}
.tail,
.head,
.paw,
.breathe {
  transform-box: fill-box;
}
.tail {
  transform-origin: 100% 100%;
}
.head {
  transform-origin: 30% 100%;
}
.breathe {
  transform-origin: 50% 100%;
}
@media (prefers-reduced-motion: no-preference) {
  .cat-stand .tail,
  .cat-sit .tail {
    animation: swish 2.4s ease-in-out infinite alternate;
  }
  .cat-groom .head {
    animation: lick 0.5s ease-in-out infinite alternate;
  }
  .cat-groom .paw {
    animation: lick-paw 0.5s ease-in-out infinite alternate;
  }
  .cat-sleep .breathe {
    animation: breathe 3s ease-in-out infinite;
  }
  .zzz {
    animation: drift 2.6s ease-out infinite;
  }
  .hearts {
    animation: drift 1.2s ease-out 2;
  }
  .bubble {
    animation: pop 0.25s cubic-bezier(0.3, 1.6, 0.6, 1);
  }
}
@keyframes swish {
  from {
    transform: rotate(-8deg);
  }
  to {
    transform: rotate(10deg);
  }
}
@keyframes lick {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(14deg);
  }
}
@keyframes lick-paw {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(-1.5px);
  }
}
@keyframes breathe {
  0%,
  100% {
    transform: scaleY(1);
  }
  50% {
    transform: scaleY(1.07);
  }
}
@keyframes drift {
  from {
    transform: translateY(0);
    opacity: 1;
  }
  to {
    transform: translateY(-12px);
    opacity: 0;
  }
}
@keyframes pop {
  from {
    transform: scale(0.4);
    opacity: 0;
  }
  to {
    transform: none;
    opacity: 1;
  }
}
</style>
