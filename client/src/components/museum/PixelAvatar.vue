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
          <!-- Hair, seen from behind -->
          <template v-if="fromBehind">
            <rect v-if="look.style === 'buzz'" x="-8" y="-46" width="16" height="12" rx="4" :fill="look.hair" opacity="0.85" />
            <template v-else>
              <rect x="-9" y="-48" width="18" height="17" rx="5" :fill="look.hair" />
              <rect v-if="look.style === 'long'" x="-9" y="-36" width="18" height="10" rx="3" :fill="look.hair" />
              <rect v-if="look.style === 'bob'" x="-10" y="-40" width="20" height="8" rx="3" :fill="look.hair" />
              <rect v-if="look.style === 'bun'" x="-4" y="-53" width="8" height="6" rx="3" :fill="look.hair" />
              <polygon v-if="look.style === 'spiky'" points="-9,-46 -6,-53 -3,-47 0,-54 3,-47 6,-53 9,-46" :fill="look.hair" />
            </template>
          </template>
          <!-- Hair and face, from the front -->
          <template v-else>
            <rect v-if="look.style === 'buzz'" x="-8" y="-46" width="16" height="4" rx="2" :fill="look.hair" opacity="0.85" />
            <polygon v-else-if="look.style === 'spiky'" points="-9,-41 -9,-47 -6,-53 -3,-47 0,-54 3,-47 6,-53 9,-47 9,-42" :fill="look.hair" />
            <template v-else>
              <rect :x="look.style === 'bob' ? -10 : -9" y="-48" :width="look.style === 'bob' ? 20 : 18" height="7" rx="3" :fill="look.hair" />
              <rect :x="look.style === 'bob' ? -10 : -9" y="-45" :width="look.style === 'bob' ? 5 : 4" :height="look.style === 'bob' ? 13 : 9" rx="2" :fill="look.hair" />
              <rect v-if="look.style === 'long'" x="-9" y="-40" width="5" height="16" rx="2" :fill="look.hair" />
              <rect v-if="look.style === 'bun'" x="-4" y="-53" width="8" height="6" rx="3" :fill="look.hair" />
            </template>
            <rect x="0" y="-39" width="2" height="3" fill="#2b2230" />
            <rect x="5" y="-39" width="2" height="3" fill="#2b2230" />
            <rect v-if="emote === 'laugh'" x="1" y="-34" width="6" height="3" rx="1.5" fill="#b5536b" />
            <rect v-else x="2" y="-33" width="4" height="1.5" rx="0.75" fill="#b5536b" />
            <rect x="5" y="-36" width="3" height="2" rx="1" fill="#f19bb0" opacity="0.6" />
            <g v-if="look.accessory === 'glasses'" class="glasses">
              <rect x="-1.5" y="-40.5" width="4.5" height="4.5" rx="1" />
              <rect x="4" y="-40.5" width="4.5" height="4.5" rx="1" />
              <path d="M 3 -38.5 L 4 -38.5" />
            </g>
          </template>
          <!-- Accessories (the same from either side) -->
          <template v-if="look.accessory === 'beret'">
            <rect x="-10" y="-52" width="18" height="6" rx="3" fill="#c4314f" />
            <rect x="-2" y="-55" width="3" height="3" rx="1" fill="#c4314f" />
          </template>
          <template v-else-if="look.accessory === 'bow'">
            <polygon points="-9,-53 -4,-49.5 -9,-46" fill="#f48fb1" />
            <polygon points="1,-53 -4,-49.5 1,-46" fill="#f48fb1" />
            <circle cx="-4" cy="-49.5" r="1.6" fill="#d04876" />
          </template>
          <template v-else-if="look.accessory === 'headphones'">
            <path d="M -9 -42 Q -9 -53 0 -53 Q 9 -53 9 -42" fill="none" stroke="#2f2f3a" stroke-width="2" />
            <rect x="-11" y="-43" width="4" height="7" rx="1.5" fill="#ec6a93" />
            <rect v-if="fromBehind" x="7" y="-43" width="4" height="7" rx="1.5" fill="#ec6a93" />
          </template>
          <template v-else-if="look.accessory === 'flower'">
            <circle cx="-8" cy="-50" r="2" fill="#f6a5c0" />
            <circle cx="-5" cy="-50" r="2" fill="#f6a5c0" />
            <circle cx="-6.5" cy="-52.5" r="2" fill="#f6a5c0" />
            <circle cx="-6.5" cy="-47.5" r="2" fill="#f6a5c0" />
            <circle cx="-6.5" cy="-50" r="1.4" fill="#f4cf6a" />
          </template>
          <polygon
            v-else-if="look.accessory === 'crown'"
            points="-7,-48 -7,-54 -4,-51 0,-56 4,-51 7,-54 7,-48"
            fill="#f4cf6a"
            stroke="#c99a2e"
            stroke-width="0.8"
          />
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
.glasses rect,
.glasses path {
  fill: rgba(255, 255, 255, 0.25);
  stroke: #2b2230;
  stroke-width: 1;
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
  /* A little routine: bounce and sway, arms pumping in turn, and a quick spin now and then */
  .emote-dance .body {
    animation: dance 1.6s ease-in-out infinite;
  }
  .emote-dance .front-arm {
    animation: dance-arm 0.4s ease-in-out infinite alternate;
  }
  .emote-dance .back-arm {
    animation: dance-arm-back 0.4s ease-in-out infinite alternate;
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
  .emote-dance .front-arm,
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
  0%,
  100% {
    transform: translateY(0) rotate(-7deg);
  }
  20% {
    transform: translateY(-5px) rotate(0deg);
  }
  40% {
    transform: translateY(0) rotate(7deg);
  }
  60% {
    transform: translateY(-5px) rotate(0deg) scaleX(1);
  }
  70% {
    transform: translateY(-7px) scaleX(-1);
  }
  80% {
    transform: translateY(-3px) scaleX(1);
  }
}
@keyframes dance-arm {
  from {
    transform: rotate(150deg);
  }
  to {
    transform: rotate(40deg);
  }
}
@keyframes dance-arm-back {
  from {
    transform: rotate(-40deg);
  }
  to {
    transform: rotate(-170deg);
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
