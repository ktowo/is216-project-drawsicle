<script setup>
import { computed } from 'vue';

// A little pixel-art visitor, drawn with its feet at (x, y). The sprite is drawn facing right;
// facing left mirrors it. From behind ('n' facings) you see the back of their head.
const props = defineProps({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  facing: { type: String, default: 'se' }, // se | sw | ne | nw
  walking: { type: Boolean, default: false },
  step: { type: Number, default: 0 }, // which frame of the walk cycle
  look: { type: Object, required: true }, // { skin, hair, shirt, pants, style }
  name: { type: String, default: '' },
  showName: { type: Boolean, default: false },
  bubble: { type: String, default: '' },
  self: { type: Boolean, default: false },
});

const mirrored = computed(() => props.facing.endsWith('w'));
const fromBehind = computed(() => props.facing.startsWith('n'));
// Legs and arms swap every frame while walking; a small bob makes it feel alive
const stride = computed(() => (props.walking ? (props.step % 2 === 0 ? 1 : -1) : 0));
const bob = computed(() => (props.walking && props.step % 2 === 0 ? -1 : 0));

const tagWidth = computed(() => Math.max(36, Math.min(130, props.name.length * 6.6 + 16)));
const bubbleText = computed(() => (props.bubble.length > 34 ? `${props.bubble.slice(0, 33)}…` : props.bubble));
const bubbleWidth = computed(() => Math.max(40, Math.min(220, bubbleText.value.length * 6.4 + 20)));
</script>

<template>
  <g :transform="`translate(${x.toFixed(1)} ${y.toFixed(1)})`" class="avatar" :class="{ self }">
    <ellipse cx="0" cy="0" rx="12" ry="5" class="shadow" />
    <g :transform="`translate(0 ${bob}) ${mirrored ? 'scale(-1 1)' : ''}`">
      <!-- Legs and shoes -->
      <rect x="-6" :y="-13 + Math.max(0, stride) * -2" width="5" :height="13 - Math.max(0, stride) * 2" :fill="look.pants" />
      <rect x="1" :y="-13 + Math.max(0, -stride) * -2" width="5" :height="13 - Math.max(0, -stride) * 2" :fill="look.pants" />
      <rect x="-7" :y="-3 + Math.max(0, stride) * -2" width="6" height="3" fill="#2b2230" />
      <rect x="1" :y="-3 + Math.max(0, -stride) * -2" width="6" height="3" fill="#2b2230" />
      <!-- Back arm, body, front arm -->
      <rect x="-11" :y="-27 + stride" width="4" height="13" rx="2" :fill="look.shirt" class="shade" />
      <rect x="-8" y="-29" width="16" height="17" rx="3" :fill="look.shirt" />
      <rect x="-8" y="-15" width="16" height="3" :fill="look.pants" opacity="0.9" />
      <rect x="7" :y="-27 - stride" width="4" height="13" rx="2" :fill="look.shirt" />
      <rect x="7" :y="-16 - stride" width="4" height="3" rx="1" :fill="look.skin" />
      <!-- Head -->
      <rect x="-8" y="-45" width="16" height="16" rx="4" :fill="look.skin" />
      <template v-if="fromBehind">
        <rect x="-9" y="-48" width="18" height="17" rx="5" :fill="look.hair" />
        <rect v-if="look.style === 'long'" x="-9" y="-36" width="18" height="10" rx="3" :fill="look.hair" />
      </template>
      <template v-else>
        <rect x="-9" y="-48" width="18" height="7" rx="3" :fill="look.hair" />
        <rect x="-9" y="-45" width="4" height="9" rx="2" :fill="look.hair" />
        <rect v-if="look.style === 'long'" x="-9" y="-40" width="5" height="16" rx="2" :fill="look.hair" />
        <rect v-if="look.style === 'bun'" x="-4" y="-53" width="8" height="6" rx="3" :fill="look.hair" />
        <rect x="0" y="-39" width="2" height="3" fill="#2b2230" />
        <rect x="5" y="-39" width="2" height="3" fill="#2b2230" />
        <rect x="2" y="-33" width="4" height="1.5" rx="0.75" fill="#b5536b" />
        <rect x="5" y="-36" width="3" height="2" rx="1" fill="#f19bb0" opacity="0.6" />
      </template>
    </g>

    <g v-if="showName" class="tag">
      <rect :x="-tagWidth / 2" y="-70" :width="tagWidth" height="15" rx="7.5" />
      <text x="0" y="-59">{{ name }}</text>
    </g>

    <g v-if="bubble" class="bubble">
      <rect :x="-bubbleWidth / 2" :y="showName ? -98 : -84" :width="bubbleWidth" height="22" rx="8" />
      <path :d="`M -5 ${showName ? -76.5 : -62.5} l 5 7 l 5 -7 z`" />
      <text x="0" :y="showName ? -83 : -69">{{ bubbleText }}</text>
    </g>
  </g>
</template>

<style scoped>
.shadow {
  fill: rgba(0, 0, 0, 0.28);
}
.shade {
  filter: brightness(0.82);
}
.tag rect {
  fill: rgba(20, 16, 28, 0.78);
}
.self .tag rect {
  fill: var(--pink-dark, #c94f78);
}
.tag text {
  fill: #fff;
  font-size: 10px;
  font-weight: 700;
  text-anchor: middle;
  font-family: var(--font-body);
}
.bubble rect,
.bubble path {
  fill: #fffdf8;
  stroke: #2b2230;
  stroke-width: 1.2;
}
.bubble path {
  stroke-width: 0;
}
.bubble text {
  fill: #2b2230;
  font-size: 11px;
  font-weight: 600;
  text-anchor: middle;
  font-family: var(--font-body);
}
</style>
