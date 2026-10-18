<script setup>
import { computed } from 'vue';

// One screen pet, drawn facing right in a 32 x 32 box with its feet at the bottom middle.
// Chunky and round like the museum cats: big shiny eyes, blush, a soft shadow.
//   kind: shared/pets.mjs PET_KINDS     palette: { body, belly, accent, dark, cheek }
//   state: stand | walk | sit | sleep | jump | held | eat | happy     step: walk frame
const props = defineProps({
  kind: { type: String, default: 'cat' },
  palette: { type: Object, required: true },
  state: { type: String, default: 'stand' },
  step: { type: Number, default: 0 },
  facing: { type: String, default: 'right' },
  size: { type: Number, default: 56 },
});

const QUADRUPEDS = ['cat', 'dog', 'fox', 'bunny', 'mouse', 'bear', 'dragon', 'hedgehog'];
const ORANGE = '#f2a02d';

const four = computed(() => QUADRUPEDS.includes(props.kind));
const c = computed(() => props.palette);
const odd = computed(() => props.step % 2 === 1);
const walking = computed(() => props.state === 'walk');
const sitting = computed(() => props.state === 'sit' || props.state === 'eat');
const asleep = computed(() => props.state === 'sleep');
const held = computed(() => props.state === 'held');
const jumping = computed(() => props.state === 'jump');
const happy = computed(() => props.state === 'happy');
const eating = computed(() => props.state === 'eat');
const eyesShut = computed(() => asleep.value);

// Four-legged pets: where the body and head sit for each pose
const pose = computed(() => {
  const small = props.kind === 'mouse' ? 0.86 : 1;
  if (asleep.value) return { body: [5.5, 21.5, 19, 8, 4], head: 'translate(0.5 7.5) scale(0.9)', legs: 'none', small };
  if (sitting.value) {
    return { body: [9.5, 17, 11.5, 12, 5.75], head: eating.value ? 'translate(-0.5 2) rotate(14 21 16)' : 'translate(-2.5 -3)', legs: 'sit', small };
  }
  if (held.value) return { body: [7.5, 17.5, 14, 9, 4.5], head: 'translate(-0.5 -1)', legs: 'dangle', small };
  if (jumping.value) return { body: [7, 17.5, 15, 8.5, 4.25], head: 'translate(0.5 -1.5) rotate(-6 21 16)', legs: 'stretch', small };
  const bob = walking.value && odd.value ? -0.6 : 0;
  return { body: [7, 18.5 + bob, 15, 9, 4.5], head: `translate(0 ${bob})`, legs: 'stand', small };
});

// Legs: back pair then front pair; while walking, opposite corners lift together
const legs = computed(() => {
  const p = pose.value.legs;
  const xs = [8.6, 11.3, 16.4, 19.1];
  if (p === 'none') return [];
  if (p === 'sit') return [{ x: 14, y: 26.6, h: 3.2 }, { x: 17.2, y: 26.6, h: 3.2 }];
  if (p === 'dangle') return xs.map((x, i) => ({ x, y: 25, h: 5.2 + (i % 2) * 0.6 }));
  if (p === 'stretch') return [{ x: 6.8, y: 25.5, h: 4.2 }, { x: 9.4, y: 25.8, h: 4 }, { x: 18, y: 25.6, h: 4 }, { x: 20.6, y: 25.2, h: 4.2 }];
  return xs.map((x, i) => {
    const lifted = walking.value && (i === 0 || i === 3) === odd.value;
    return { x: x + (walking.value ? (lifted ? 0.6 : -0.3) : 0), y: 26 - (lifted ? 0.9 : 0), h: 3.8 };
  });
});

// Hedgehog spines: a zigzag over the top of whatever shape the body is in
const spines = computed(() => {
  const [x, y, w, h] = pose.value.body;
  const cx = x + w / 2;
  const cy = y + h / 2 + 1;
  const rx = w / 2 + 0.6;
  const ry = h / 2 + 1.2;
  const points = [];
  const n = 13;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI * (1.08 - (i / n) * 1.16); // from the back, over the top, to the front
    const out = i % 2 === 1 ? 2.4 : 0.4;
    points.push(`${(cx + Math.cos(a) * (rx + out)).toFixed(1)},${(cy - Math.sin(a) * (ry + out)).toFixed(1)}`);
  }
  points.push(`${(cx + rx * 0.55).toFixed(1)},${(y + h).toFixed(1)}`, `${(cx - rx * 0.9).toFixed(1)},${(y + h).toFixed(1)}`);
  return points.join(' ');
});

const eyeR = computed(() => (held.value ? 1.45 : 1.15));
const sizeStyle = computed(() => ({ width: `${props.size}px`, height: `${props.size}px` }));
</script>

<template>
  <svg
    class="pet-sprite"
    :class="[`pet-${kind}`, `is-${state}`]"
    viewBox="0 0 32 32"
    :style="sizeStyle"
    aria-hidden="true"
    focusable="false"
  >
    <ellipse cx="16" cy="30.6" :rx="asleep ? 10 : 8.5" ry="1.4" class="shadow" />
    <g :transform="facing === 'left' ? 'translate(32 0) scale(-1 1)' : undefined">
      <!-- ================= Four-legged pets ================= -->
      <g v-if="four" class="breathe" :transform="pose.small !== 1 ? `translate(${16 * (1 - pose.small)} ${30 * (1 - pose.small)}) scale(${pose.small})` : undefined">
        <!-- Tails (behind the body) -->
        <path v-if="kind === 'cat'" class="tail wag-slow" :d="sitting ? 'M10.5 28.5 C5.5 29.5 4.5 25.5 7.5 24' : asleep ? 'M6 27 C2.5 25 5 21 8 22' : 'M8 22.5 C3.5 21 3.5 14.5 7 13.5'" fill="none" :stroke="c.body" stroke-width="2.3" stroke-linecap="round" />
        <path v-if="kind === 'cat' && !asleep && !sitting" d="M6.2 15.2 C6.4 14.4 6.7 13.9 7 13.5" fill="none" :stroke="c.accent" stroke-width="2.3" stroke-linecap="round" />
        <g v-if="kind === 'dog'" class="wag">
          <path :d="sitting ? 'M10 27 C7 27 6.2 25 7 24' : 'M8 21 C5.5 19.5 5.5 16.5 6.6 15.5'" fill="none" :stroke="c.body" stroke-width="2.4" stroke-linecap="round" />
        </g>
        <g v-if="kind === 'fox'" class="wag-slow">
          <path :d="asleep ? 'M7 27 C1.5 27 1.5 20 7 20.5 C9 21.5 9 25 7 27 Z' : 'M8.5 23 C2 24 1 15.5 5.8 14.5 C8.6 15.5 9.6 19.5 8.5 23 Z'" :fill="c.body" />
          <path :d="asleep ? 'M3.4 22.5 C3.4 21 5 20.2 6.6 20.6 C5.4 21.4 4.4 22 3.4 22.5 Z' : 'M3.6 17.2 C3.8 15.6 4.8 14.6 5.8 14.5 C6.6 15.4 6.8 16.6 6.4 17.4 C5.4 17 4.4 17 3.6 17.2 Z'" :fill="c.belly" />
        </g>
        <circle v-if="kind === 'bunny'" :cx="sitting ? 10 : 7.2" :cy="sitting ? 26.5 : 21.5" r="2.2" :fill="c.belly" />
        <path v-if="kind === 'mouse'" :d="sitting ? 'M10.5 28.5 C5 30 3 26 5 24.5' : 'M7.5 24 C3 25 2 20 4.5 18.5'" fill="none" :stroke="c.accent" stroke-width="0.9" stroke-linecap="round" />
        <circle v-if="kind === 'bear'" :cx="sitting ? 10.2 : 7.4" :cy="sitting ? 26 : 21.5" r="1.6" :fill="c.body" />
        <g v-if="kind === 'dragon'">
          <path :d="asleep ? 'M6.5 27 C2.5 26 3 22 6 22.5' : 'M8 23.5 C4 23.5 2.6 20 3.4 17.6'" fill="none" :stroke="c.body" stroke-width="2.4" stroke-linecap="round" />
          <polygon :points="asleep ? '5,21.4 6.6,20 7,22.6' : '2.2,18.4 3.4,15.8 4.6,18.2'" :fill="c.accent" />
          <!-- Little wings on the back; they flap while walking and jumping -->
          <path v-if="!asleep" class="wing" :class="{ flap: walking || jumping || held }" d="M12 19 C10 13.5 13.5 11.5 16 14 C15 14.8 15.6 16 16.4 16.6 C15 16.4 13.6 17.5 12 19 Z" :fill="c.accent" />
        </g>

        <!-- Legs -->
        <rect v-for="(l, i) in legs" :key="`l${i}`" :x="l.x" :y="l.y" width="2.4" :height="l.h" rx="1.15" :fill="c.body" class="leg" />
        <rect v-for="(l, i) in legs" :key="`p${i}`" :x="l.x" :y="l.y + l.h - 1.1" width="2.4" height="1.1" rx="0.55" :fill="c.belly" />

        <!-- Body -->
        <rect :x="pose.body[0]" :y="pose.body[1]" :width="pose.body[2]" :height="pose.body[3]" :rx="pose.body[4]" :fill="c.body" class="body" />
        <ellipse v-if="kind !== 'hedgehog'" :cx="pose.body[0] + pose.body[2] * 0.58" :cy="pose.body[1] + pose.body[3] * 0.68" :rx="pose.body[2] * 0.3" :ry="pose.body[3] * 0.28" :fill="c.belly" />
        <path v-if="kind === 'dragon' && !asleep" :d="`M${pose.body[0] + 6} ${pose.body[1] + pose.body[3] - 2.6} h5 M${pose.body[0] + 6.5} ${pose.body[1] + pose.body[3] - 1.4} h4`" :stroke="c.accent" stroke-width="0.6" stroke-linecap="round" />
        <!-- Hedgehog spines cover the back -->
        <polygon v-if="kind === 'hedgehog'" :points="spines" :fill="c.accent" />

        <!-- Head -->
        <g class="head" :transform="pose.head">
          <!-- Ears behind the head -->
          <template v-if="kind === 'bunny'">
            <ellipse cx="18.6" cy="6.6" rx="1.7" ry="5" :fill="c.body" :transform="held ? 'rotate(-28 18.6 11)' : 'rotate(-10 18.6 11)'" />
            <ellipse cx="22.6" cy="6.4" rx="1.7" ry="5" :fill="c.body" :transform="held ? 'rotate(30 22.6 11)' : 'rotate(12 22.6 11)'" />
            <ellipse cx="18.6" cy="7" rx="0.8" ry="3.6" :fill="c.cheek" :transform="held ? 'rotate(-28 18.6 11)' : 'rotate(-10 18.6 11)'" opacity="0.8" />
            <ellipse cx="22.6" cy="6.8" rx="0.8" ry="3.6" :fill="c.cheek" :transform="held ? 'rotate(30 22.6 11)' : 'rotate(12 22.6 11)'" opacity="0.8" />
          </template>
          <template v-else-if="kind === 'cat' || kind === 'fox'">
            <polygon points="15.8,12.6 16.8,6.6 20.4,10.2" :fill="c.body" />
            <polygon points="22.4,10 26,6.6 26.6,12.8" :fill="c.body" />
            <polygon points="16.9,11.2 17.4,8.4 19.2,10.2" :fill="kind === 'fox' ? c.dark : c.cheek" :opacity="kind === 'fox' ? 0.85 : 0.85" />
            <polygon points="23.4,10.2 25.4,8.4 25.6,11.4" :fill="kind === 'fox' ? c.dark : c.cheek" :opacity="kind === 'fox' ? 0.85 : 0.85" />
          </template>
          <template v-else-if="kind === 'mouse'">
            <circle cx="16.4" cy="9.6" r="3.4" :fill="c.body" />
            <circle cx="26.2" cy="9.6" r="3.4" :fill="c.body" />
            <circle cx="16.4" cy="9.6" r="2" :fill="c.cheek" opacity="0.75" />
            <circle cx="26.2" cy="9.6" r="2" :fill="c.cheek" opacity="0.75" />
          </template>
          <template v-else-if="kind === 'bear'">
            <circle cx="16.6" cy="10.2" r="2.4" :fill="c.body" />
            <circle cx="26" cy="10.2" r="2.4" :fill="c.body" />
            <circle cx="16.6" cy="10.2" r="1.2" :fill="c.accent" />
            <circle cx="26" cy="10.2" r="1.2" :fill="c.accent" />
          </template>
          <template v-else-if="kind === 'dragon'">
            <polygon points="17,10.4 16.2,6.2 19,9.4" fill="#fff6d8" />
            <polygon points="23.4,9.4 26.4,6.4 25.6,10.6" fill="#fff6d8" />
          </template>

          <!-- Face -->
          <circle cx="21.4" cy="15.6" :r="kind === 'bear' ? 6.8 : 6.4" :fill="kind === 'hedgehog' ? c.belly : c.body" class="face" />
          <!-- Floppy dog ears hang over the sides of the head -->
          <template v-if="kind === 'dog'">
            <ellipse cx="15.6" cy="15.4" rx="1.9" ry="3.6" :fill="c.accent" :transform="held ? 'rotate(-35 15.6 12)' : 'rotate(18 15.6 12)'" />
            <ellipse cx="27.2" cy="15.4" rx="1.9" ry="3.6" :fill="c.accent" :transform="held ? 'rotate(35 27.2 12)' : 'rotate(-18 27.2 12)'" />
          </template>
          <!-- Snouts -->
          <ellipse v-if="['dog', 'fox', 'bear'].includes(kind)" cx="23.8" cy="18" rx="2.6" ry="1.9" :fill="c.belly" />
          <ellipse v-if="kind === 'fox'" cx="19" cy="17.6" rx="2.2" ry="1.8" :fill="c.belly" />

          <template v-if="eyesShut || happy">
            <path :d="happy ? 'M18.6 15.8 q1.1 -1.5 2.2 0 M22.6 15.8 q1.1 -1.5 2.2 0' : 'M18.6 15.4 q1.1 1.2 2.2 0 M22.6 15.4 q1.1 1.2 2.2 0'" fill="none" :stroke="c.dark" stroke-width="0.75" stroke-linecap="round" />
          </template>
          <template v-else>
            <circle cx="19.7" cy="15.4" :r="eyeR" :fill="c.dark" />
            <circle cx="23.7" cy="15.4" :r="eyeR" :fill="c.dark" />
            <circle cx="20.1" cy="14.9" r="0.42" fill="#fff" />
            <circle cx="24.1" cy="14.9" r="0.42" fill="#fff" />
          </template>
          <ellipse cx="18.1" cy="17.7" rx="1.15" ry="0.7" :fill="c.cheek" opacity="0.7" />
          <ellipse cx="25.4" cy="17.7" rx="1.15" ry="0.7" :fill="c.cheek" opacity="0.7" />
          <!-- Nose and mouth -->
          <circle v-if="['dog', 'fox', 'bear', 'hedgehog'].includes(kind)" :cx="kind === 'hedgehog' ? 27.6 : 25.6" :cy="kind === 'hedgehog' ? 16.6 : 17.2" r="0.85" :fill="c.dark" />
          <ellipse v-else cx="21.7" cy="17" rx="0.55" ry="0.4" :fill="c.cheek" />
          <path v-if="held" d="M21.2 18.6 a0.6 0.7 0 1 0 1.2 0 a0.6 0.7 0 1 0 -1.2 0" :fill="c.dark" />
          <path v-else-if="eating" class="chew" d="M20.8 18.4 q0.5 0.6 1 0 q0.5 0.6 1 0" fill="none" :stroke="c.dark" stroke-width="0.5" stroke-linecap="round" />
          <path v-else d="M20.8 18.2 q0.5 0.6 1 0 q0.5 0.6 1 0" fill="none" :stroke="c.dark" stroke-width="0.5" stroke-linecap="round" />
          <!-- Dogs stick their tongue out when happy -->
          <ellipse v-if="kind === 'dog' && (happy || walking)" cx="22.2" cy="19.6" rx="0.8" ry="1" fill="#f27a8f" />
          <path v-if="kind === 'cat' && !asleep" d="M26.4 17.2 h2 M26.4 18.2 l1.8 0.6" :stroke="c.dark" stroke-width="0.3" stroke-linecap="round" opacity="0.6" />
        </g>
      </g>

      <!-- ================= Penguin ================= -->
      <g v-else-if="kind === 'penguin'" class="breathe" :class="{ waddle: walking }" :transform="walking ? `rotate(${odd ? 6 : -6} 16 29)` : undefined">
        <ellipse cx="13" cy="29.6" rx="2.2" ry="0.9" :fill="ORANGE" :transform="walking && odd ? 'translate(0 -0.6)' : undefined" />
        <ellipse cx="18.8" cy="29.6" rx="2.2" ry="0.9" :fill="ORANGE" :transform="walking && !odd ? 'translate(0 -0.6)' : undefined" />
        <ellipse cx="16" :cy="asleep ? 23 : 21" rx="7.4" :ry="asleep ? 7 : 8.6" :fill="c.body" />
        <ellipse cx="17.2" :cy="asleep ? 24.6 : 23" rx="5" :ry="asleep ? 5 : 6.4" :fill="c.belly" />
        <ellipse :cx="held || jumping ? 9.4 : 10.2" cy="21.5" rx="1.7" ry="4.2" :fill="c.accent" :transform="held || jumping ? 'rotate(-40 10 19)' : 'rotate(14 10 19)'" />
        <ellipse :cx="held || jumping ? 23.6 : 22.4" cy="21.5" rx="1.5" ry="3.6" :fill="c.accent" :transform="held || jumping ? 'rotate(40 22.4 19)' : 'rotate(-12 22.4 19)'" />
        <ellipse cx="18" :cy="asleep ? 18.6 : 16" rx="4.2" ry="3.4" :fill="c.belly" />
        <template v-if="eyesShut || happy">
          <path :d="happy ? 'M15.4 16.4 q1 -1.4 2 0 M19 16.4 q1 -1.4 2 0' : `M15.4 ${asleep ? 18.6 : 16} q1 1.1 2 0 M19 ${asleep ? 18.6 : 16} q1 1.1 2 0`" fill="none" :stroke="c.dark" stroke-width="0.7" stroke-linecap="round" />
        </template>
        <template v-else>
          <circle cx="16.4" cy="15.8" :r="eyeR" :fill="c.dark" />
          <circle cx="20" cy="15.8" :r="eyeR" :fill="c.dark" />
          <circle cx="16.8" cy="15.3" r="0.4" fill="#fff" />
          <circle cx="20.4" cy="15.3" r="0.4" fill="#fff" />
        </template>
        <polygon :points="asleep ? '17.2,19.8 19.4,20.4 17.2,21' : '17,17.4 20,18.2 17,19'" :fill="ORANGE" :class="{ chew: eating }" />
        <ellipse cx="14.6" :cy="asleep ? 20.2 : 17.8" rx="1" ry="0.6" :fill="c.cheek" opacity="0.7" />
        <ellipse cx="21.6" :cy="asleep ? 20.2 : 17.8" rx="1" ry="0.6" :fill="c.cheek" opacity="0.7" />
      </g>

      <!-- ================= Bird ================= -->
      <g v-else-if="kind === 'bird'" class="breathe">
        <path v-if="!asleep" :d="walking && odd ? 'M14 28.4 v2 M18 28.8 v1.6' : 'M14 28.6 v1.8 M18 28.6 v1.8'" :stroke="ORANGE" stroke-width="0.9" stroke-linecap="round" />
        <path d="M8.6 22 L4.6 20.6 L5.4 23.8 Z" :fill="c.accent" />
        <circle cx="16" :cy="asleep ? 24 : 21.6" r="7.6" :fill="c.body" />
        <ellipse cx="17.8" :cy="asleep ? 26 : 24" rx="4.8" ry="4.2" :fill="c.belly" />
        <path :d="asleep ? 'M14.6 16.6 q0.6 -2.2 2 -2.4 q-0.4 1.4 0.6 2.2' : 'M15 14.4 q0.4 -2.6 2.2 -3 q-0.4 1.8 0.8 2.8'" :fill="c.accent" />
        <ellipse class="wing" :class="{ flap: jumping || held || walking }" cx="12.6" :cy="asleep ? 24.4 : 22" rx="3.8" ry="2.6" :fill="c.accent" transform="rotate(-14 12.6 22)" />
        <template v-if="eyesShut || happy">
          <path :d="happy ? 'M17.6 19 q1 -1.4 2 0 M20.8 19 q1 -1.4 2 0' : `M17.6 ${asleep ? 21.4 : 19} q1 1.1 2 0 M20.8 ${asleep ? 21.4 : 19} q1 1.1 2 0`" fill="none" :stroke="c.dark" stroke-width="0.7" stroke-linecap="round" />
        </template>
        <template v-else>
          <circle cx="18.6" cy="19" :r="eyeR" :fill="c.dark" />
          <circle cx="21.8" cy="19" :r="eyeR" :fill="c.dark" />
          <circle cx="19" cy="18.5" r="0.4" fill="#fff" />
          <circle cx="22.2" cy="18.5" r="0.4" fill="#fff" />
        </template>
        <polygon :points="eating ? '23,21.6 26,23.4 23,23.4' : asleep ? '22.8,23 25.4,23.8 22.8,24.6' : '23,20 26.2,20.9 23,21.8'" :fill="ORANGE" />
        <ellipse cx="17.4" :cy="asleep ? 23.2 : 20.8" rx="1" ry="0.6" :fill="c.cheek" opacity="0.7" />
      </g>

      <!-- ================= Slime ================= -->
      <g v-else-if="kind === 'slime'" class="jiggle" :transform="walking ? (odd ? 'translate(16 30) scale(1.06 0.9) translate(-16 -30)' : undefined) : asleep ? 'translate(16 30) scale(1.12 0.78) translate(-16 -30)' : held ? 'translate(16 30) scale(0.9 1.12) translate(-16 -30)' : undefined">
        <path d="M16 10.5 C21 10.5 26.2 18.4 26.2 23.6 C26.2 28.2 21.6 30.2 16 30.2 C10.4 30.2 5.8 28.2 5.8 23.6 C5.8 18.4 11 10.5 16 10.5 Z" :fill="c.body" opacity="0.94" />
        <path d="M8 26 C9.5 29 13 29.8 16 29.8 C19 29.8 22.5 29 24 26 C21 27.8 11 27.8 8 26 Z" :fill="c.accent" opacity="0.35" />
        <ellipse cx="11.6" cy="17.4" rx="1.5" ry="2.6" fill="#fff" opacity="0.6" transform="rotate(25 11.6 17.4)" />
        <circle cx="10.6" cy="21.4" r="0.7" fill="#fff" opacity="0.5" />
        <template v-if="eyesShut || happy">
          <path :d="happy ? 'M12.6 22 q1.1 -1.5 2.2 0 M17.4 22 q1.1 -1.5 2.2 0' : 'M12.6 22 q1.1 1.2 2.2 0 M17.4 22 q1.1 1.2 2.2 0'" fill="none" :stroke="c.dark" stroke-width="0.75" stroke-linecap="round" />
        </template>
        <template v-else>
          <circle cx="13.7" cy="21.8" :r="eyeR + 0.1" :fill="c.dark" />
          <circle cx="18.5" cy="21.8" :r="eyeR + 0.1" :fill="c.dark" />
          <circle cx="14.1" cy="21.3" r="0.45" fill="#fff" />
          <circle cx="18.9" cy="21.3" r="0.45" fill="#fff" />
        </template>
        <ellipse cx="11.8" cy="24" rx="1.2" ry="0.7" :fill="c.cheek" opacity="0.7" />
        <ellipse cx="20.4" cy="24" rx="1.2" ry="0.7" :fill="c.cheek" opacity="0.7" />
        <path v-if="held" d="M15.5 24.8 a0.6 0.7 0 1 0 1.2 0 a0.6 0.7 0 1 0 -1.2 0" :fill="c.dark" />
        <path v-else :class="{ chew: eating }" d="M15 24.4 q0.55 0.6 1.1 0 q0.55 0.6 1.1 0" fill="none" :stroke="c.dark" stroke-width="0.55" stroke-linecap="round" />
      </g>

      <!-- ================= Frog ================= -->
      <g v-else-if="kind === 'frog'" class="breathe">
        <ellipse :cx="10" cy="29.2" rx="2.8" ry="1.2" :fill="c.body" :transform="walking && odd ? 'translate(-0.6 -0.6)' : undefined" />
        <ellipse :cx="22" cy="29.2" rx="2.8" ry="1.2" :fill="c.body" :transform="walking && !odd ? 'translate(0.6 -0.6)' : undefined" />
        <ellipse cx="16" :cy="asleep ? 25.6 : 24.6" rx="9" :ry="asleep ? 4.6 : 5.2" :fill="c.body" />
        <ellipse cx="16" :cy="asleep ? 26.6 : 26" rx="5.6" ry="2.8" :fill="c.belly" />
        <ellipse cx="16" :cy="asleep ? 21.6 : 20.2" rx="7.6" ry="5" :fill="c.body" />
        <circle cx="11.4" :cy="asleep ? 18 : 16" r="3" :fill="c.body" />
        <circle cx="20.6" :cy="asleep ? 18 : 16" r="3" :fill="c.body" />
        <template v-if="eyesShut || happy">
          <path :d="happy ? 'M10.2 16.4 q1.2 -1.6 2.4 0 M19.4 16.4 q1.2 -1.6 2.4 0' : `M10.2 ${asleep ? 18.2 : 16.2} q1.2 1.2 2.4 0 M19.4 ${asleep ? 18.2 : 16.2} q1.2 1.2 2.4 0`" fill="none" :stroke="c.dark" stroke-width="0.75" stroke-linecap="round" />
        </template>
        <template v-else>
          <circle cx="11.4" cy="16" r="1.9" fill="#fff" />
          <circle cx="20.6" cy="16" r="1.9" fill="#fff" />
          <circle cx="11.8" cy="16.2" :r="eyeR" :fill="c.dark" />
          <circle cx="21" cy="16.2" :r="eyeR" :fill="c.dark" />
        </template>
        <path :class="{ chew: eating }" :d="held ? 'M14.8 22.4 a1.2 1 0 1 0 2.4 0 a1.2 1 0 1 0 -2.4 0' : asleep ? 'M12 22.8 q4 1.6 8 0' : 'M11.4 21.6 q4.6 2.6 9.2 0'" :fill="held ? c.dark : 'none'" :stroke="c.dark" stroke-width="0.6" stroke-linecap="round" />
        <ellipse cx="9.6" cy="21" rx="1.2" ry="0.7" :fill="c.cheek" opacity="0.7" />
        <ellipse cx="22.4" cy="21" rx="1.2" ry="0.7" :fill="c.cheek" opacity="0.7" />
      </g>

      <!-- Extras for any pet -->
      <text v-if="asleep" x="24" y="13" class="zzz" :fill="c.dark">z</text>
      <text v-if="asleep" x="27" y="9.5" class="zzz small" :fill="c.dark">z</text>
      <g v-if="happy" class="hearts">
        <path d="M25 9.5 c-1.4 -1.6 -3.6 0 -1.6 1.9 l1.6 1.4 1.6 -1.4 c2 -1.9 -0.2 -3.5 -1.6 -1.9 z" fill="#f27a9a" />
        <path d="M8 7.5 c-1 -1.1 -2.6 0 -1.1 1.3 l1.1 1 1.1 -1 c1.5 -1.3 -0.1 -2.4 -1.1 -1.3 z" fill="#f6a5c0" class="late" />
      </g>
      <!-- A treat to munch on -->
      <g v-if="eating" class="treat">
        <circle cx="27" cy="28.2" r="1.9" fill="#e0a663" />
        <circle cx="26.4" cy="27.7" r="0.35" fill="#7c4a26" />
        <circle cx="27.6" cy="28.6" r="0.35" fill="#7c4a26" />
        <circle cx="29.6" cy="27" r="0.3" fill="#e0a663" class="crumb" />
      </g>
    </g>
  </svg>
</template>

<style scoped>
.pet-sprite {
  display: block;
  overflow: visible;
  /* A faint outline so white and pale pets still show on light pages */
  filter: drop-shadow(0 0 0.6px rgba(40, 30, 50, 0.5));
}
.shadow {
  fill: rgba(30, 20, 40, 0.16);
}
.zzz {
  font: 700 4px 'Quicksand', system-ui, sans-serif;
  opacity: 0.7;
}
.zzz.small {
  font-size: 3px;
}
@media (prefers-reduced-motion: no-preference) {
  .is-stand .breathe,
  .is-sit .breathe {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: breathe 2.6s ease-in-out infinite;
  }
  .is-sleep .breathe {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: breathe 3.6s ease-in-out infinite;
  }
  .wag {
    transform-box: fill-box;
    transform-origin: 100% 100%;
    animation: wag 0.45s ease-in-out infinite alternate;
  }
  .wag-slow {
    transform-box: fill-box;
    transform-origin: 100% 100%;
    animation: wag 1.6s ease-in-out infinite alternate;
  }
  .wing.flap {
    transform-box: fill-box;
    transform-origin: 80% 90%;
    animation: flap 0.22s ease-in-out infinite alternate;
  }
  .chew {
    transform-box: fill-box;
    transform-origin: 50% 0%;
    animation: chew 0.3s ease-in-out infinite alternate;
  }
  .is-stand .jiggle {
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: jiggle 1.8s ease-in-out infinite;
  }
  .hearts path {
    transform-box: fill-box;
    animation: float-up 1.2s ease-out infinite;
  }
  .hearts .late {
    animation-delay: 0.45s;
  }
  .zzz {
    animation: drift 2.4s ease-in-out infinite;
  }
  .zzz.small {
    animation-delay: 1.1s;
  }
  .crumb {
    animation: drift 0.9s ease-in-out infinite;
  }
}
@keyframes breathe {
  50% {
    transform: scale(1.02, 0.975);
  }
}
@keyframes wag {
  from {
    transform: rotate(-9deg);
  }
  to {
    transform: rotate(9deg);
  }
}
@keyframes flap {
  from {
    transform: rotate(-14deg);
  }
  to {
    transform: rotate(16deg);
  }
}
@keyframes chew {
  to {
    transform: scaleY(0.4);
  }
}
@keyframes jiggle {
  50% {
    transform: scale(1.05, 0.95);
  }
}
@keyframes float-up {
  from {
    transform: translateY(1px);
    opacity: 1;
  }
  to {
    transform: translateY(-4px);
    opacity: 0;
  }
}
@keyframes drift {
  0%,
  100% {
    transform: translateY(0);
    opacity: 0.35;
  }
  50% {
    transform: translateY(-1.5px);
    opacity: 0.8;
  }
}
</style>
