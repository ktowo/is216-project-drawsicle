<script setup>
import { computed } from 'vue';

// A little pixel-art visitor, drawn with its feet at (x, y). The sprite is drawn facing right;
// facing left mirrors it. From behind ('n' facings) you see the back of their head.
// sitting lowers them into a chair; emote plays a short animation (wave, dance, laugh, heart,
// clap, cheer). Animations are skipped for people who prefer less motion (see the CSS).
const props = defineProps({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  facing: { type: String, default: 'se' }, // se | sw | ne | nw
  walking: { type: Boolean, default: false },
  sitting: { type: Boolean, default: false },
  emote: { type: String, default: '' },
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
const drop = computed(() => (props.sitting ? 9 : 0)); // sitting sinks the body into the seat

const tagWidth = computed(() => Math.max(36, Math.min(130, props.name.length * 6.6 + 16)));
const bubbleText = computed(() => (props.bubble.length > 34 ? `${props.bubble.slice(0, 33)}…` : props.bubble));
const bubbleWidth = computed(() => Math.max(40, Math.min(220, bubbleText.value.length * 6.4 + 20)));
const top = computed(() => -70 + drop.value);
</script>

<template>
  <g :transform="`translate(${x.toFixed(1)} ${y.toFixed(1)})`" class="avatar" :class="[{ self }, emote && `emote-${emote}`]">
    <ellipse cx="0" cy="0" rx="12" ry="5" class="shadow" />
    <g :transform="`translate(0 ${bob + drop}) ${mirrored ? 'scale(-1 1)' : ''}`">
      <g class="body">
        <!-- Legs and shoes: standing, or folded forward on a seat -->
        <template v-if="sitting">
          <rect x="-6" y="-14" width="13" height="5" rx="2" :fill="look.pants" />
          <rect x="-6" y="-11" width="13" height="5" rx="2" :fill="look.pants" class="shade" />
          <rect x="5" y="-11" width="4" height="9" :fill="look.pants" />
          <rect x="5" y="-3" width="6" height="3" fill="#2b2230" />
        </template>
        <template v-else>
          <rect x="-6" :y="-13 + Math.max(0, stride) * -2" width="5" :height="13 - Math.max(0, stride) * 2" :fill="look.pants" />
          <rect x="1" :y="-13 + Math.max(0, -stride) * -2" width="5" :height="13 - Math.max(0, -stride) * 2" :fill="look.pants" />
          <rect x="-7" :y="-3 + Math.max(0, stride) * -2" width="6" height="3" fill="#2b2230" />
          <rect x="1" :y="-3 + Math.max(0, -stride) * -2" width="6" height="3" fill="#2b2230" />
        </template>
        <!-- Back arm, body, front arm -->
        <g class="arm back-arm">
          <rect x="-11" :y="-27 + stride" width="4" height="13" rx="2" :fill="look.shirt" class="shade" />
        </g>
        <rect x="-8" y="-29" width="16" height="17" rx="3" :fill="look.shirt" />
        <rect x="-8" y="-15" width="16" height="3" :fill="look.pants" opacity="0.9" />
        <g class="arm front-arm">
          <rect x="7" :y="-27 - stride" width="4" height="13" rx="2" :fill="look.shirt" />
          <rect x="7" :y="-16 - stride" width="4" height="3" rx="1" :fill="look.skin" />
        </g>
        <!-- Head -->
        <g class="head">
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
            <rect v-if="emote === 'laugh'" x="1" y="-34" width="6" height="3" rx="1.5" fill="#b5536b" />
            <rect v-else x="2" y="-33" width="4" height="1.5" rx="0.75" fill="#b5536b" />
            <rect x="5" y="-36" width="3" height="2" rx="1" fill="#f19bb0" opacity="0.6" />
          </template>
        </g>
      </g>
    </g>

    <!-- Floating extras for some emotes -->
    <text v-if="emote === 'heart'" x="0" :y="-52 + drop" class="float heart">♥</text>
    <text v-if="emote === 'laugh'" x="10" :y="-50 + drop" class="float haha">ha!</text>
    <text v-if="emote === 'cheer'" x="0" :y="-56 + drop" class="float confetti">✦ ✧ ✦</text>

    <g v-if="showName" class="tag">
      <rect :x="-tagWidth / 2" :y="top" :width="tagWidth" height="15" rx="7.5" />
      <text x="0" :y="top + 11">{{ name }}</text>
    </g>

    <g v-if="bubble" class="bubble">
      <rect :x="-bubbleWidth / 2" :y="top - (showName ? 28 : 14)" :width="bubbleWidth" height="22" rx="8" />
      <path :d="`M -5 ${top - (showName ? 6.5 : -7.5)} l 5 7 l 5 -7 z`" />
      <text x="0" :y="top - (showName ? 13 : 1)">{{ bubbleText }}</text>
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
.arm,
.body,
.head,
.float {
  transform-box: fill-box;
}
.front-arm {
  transform-origin: 50% 0%;
}
.back-arm {
  transform-origin: 50% 0%;
}
.body {
  transform-origin: 50% 100%;
}
.float {
  text-anchor: middle;
  font-family: var(--font-body);
  font-weight: 800;
  pointer-events: none;
}
.heart {
  fill: #ec4f86;
  font-size: 15px;
}
.haha {
  fill: #fff;
  font-size: 10px;
  stroke: #2b2230;
  stroke-width: 2.5px;
  paint-order: stroke;
}
.confetti {
  fill: #f4cf6a;
  font-size: 11px;
}

@media (prefers-reduced-motion: no-preference) {
  .emote-wave .front-arm {
    animation: wave 0.5s ease-in-out infinite alternate;
  }
  .emote-dance .body {
    animation: dance 0.5s ease-in-out infinite alternate;
  }
  .emote-laugh .head {
    animation: shake 0.18s linear infinite alternate;
  }
  .emote-clap .front-arm {
    animation: clap 0.22s ease-in-out infinite alternate;
  }
  .emote-clap .back-arm {
    animation: clap-back 0.22s ease-in-out infinite alternate;
  }
  .emote-cheer .front-arm,
  .emote-cheer .back-arm {
    transform: rotate(180deg);
  }
  .emote-cheer .body {
    animation: hop 0.4s ease-out infinite alternate;
  }
  .float {
    animation: rise 1.4s ease-out infinite;
  }
}
/* Without motion, emotes still show their pose */
@media (prefers-reduced-motion: reduce) {
  .emote-wave .front-arm,
  .emote-cheer .front-arm,
  .emote-cheer .back-arm {
    transform: rotate(180deg);
  }
}

@keyframes wave {
  from {
    transform: rotate(150deg);
  }
  to {
    transform: rotate(205deg);
  }
}
@keyframes dance {
  from {
    transform: translateY(0) rotate(-7deg);
  }
  to {
    transform: translateY(-4px) rotate(7deg);
  }
}
@keyframes shake {
  from {
    transform: translateX(-1px) rotate(-3deg);
  }
  to {
    transform: translateX(1px) rotate(3deg);
  }
}
@keyframes clap {
  from {
    transform: rotate(-20deg);
  }
  to {
    transform: rotate(-70deg);
  }
}
@keyframes clap-back {
  from {
    transform: rotate(20deg);
  }
  to {
    transform: rotate(-30deg);
  }
}
@keyframes hop {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(-6px);
  }
}
@keyframes rise {
  from {
    transform: translateY(0);
    opacity: 1;
  }
  to {
    transform: translateY(-18px);
    opacity: 0;
  }
}
</style>
