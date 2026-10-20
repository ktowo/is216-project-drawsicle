<script setup>
// A tile of little doodles (hearts, stars, paws, a cat, popsicles, pencils...) in one colour,
// laid in rows at 70°. Put it inside <defs> and fill a shape with url(#id).
defineProps({
  id: { type: String, required: true },
  colour: { type: String, default: 'currentColor' },
});

// Each doodle: where it sits in the 180 x 180 tile, how big (24 units = 1), and its tilt.
// fill: solid shapes; line: drawn as outlines
const HEART = 'M12 21s-7.5-4.6-9.3-9.4C1.4 8.1 3.4 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.6 0 5.6 3.6 4.3 7.1C19.5 16.4 12 21 12 21z';
const STAR = 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z';
const SPARKLE = 'M12 2C12.8 7.5 16.5 11.2 22 12 16.5 12.8 12.8 16.5 12 22 11.2 16.5 7.5 12.8 2 12 7.5 11.2 11.2 7.5 12 2z';
const CAT = 'M5 9V3.5L9.5 7Q12 6.3 14.5 7L19 3.5V9q2 3 1 6.5-2 5-8 5t-8-5q-1-3.5 1-6.5z';
const POPSICLE = 'M8 14V7a4 4 0 0 1 8 0v7a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1zM12 15v6';
const PENCIL = 'M15 4.5 19.5 9 9 19.5l-5.5 1 1-5.5zM13 6.5l4.5 4.5';
const PALETTE = 'M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z';
const MOON = 'M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z';

const DOODLES = [
  { x: 10, y: 12, s: 0.9, r: -12, fill: HEART },
  { x: 62, y: 6, s: 0.8, r: 10, line: POPSICLE },
  { x: 112, y: 18, s: 0.7, r: 0, fill: SPARKLE },
  { x: 146, y: 46, s: 0.9, r: 14, line: CAT, dots: [[9.5, 12.5], [14.5, 12.5]] },
  { x: 30, y: 62, s: 0.85, r: 18, line: PENCIL },
  { x: 86, y: 70, s: 0.75, r: -8, fill: STAR },
  { x: 8, y: 116, s: 0.95, r: 0, line: PALETTE, dots: [[13.5, 6.5], [17.5, 10.5], [6.5, 12.5], [8.5, 7.5]] },
  { x: 60, y: 128, s: 0.8, paw: true, r: -16 },
  { x: 116, y: 112, s: 0.8, r: 12, line: MOON },
  { x: 150, y: 150, s: 0.55, r: 0, fill: SPARKLE },
  { x: 104, y: 156, s: 0.7, r: -20, fill: HEART },
];
// A paw: one pad and four toes
const PAW = [
  [12, 15.5, 4.2, 3.6],
  [6.2, 9.8, 1.9, 2.4],
  [10, 6.6, 1.9, 2.4],
  [14, 6.6, 1.9, 2.4],
  [17.8, 9.8, 1.9, 2.4],
];
</script>

<template>
  <pattern :id="id" patternUnits="userSpaceOnUse" width="180" height="180" patternTransform="rotate(70)">
    <g
      v-for="(d, i) in DOODLES"
      :key="i"
      :transform="`translate(${d.x} ${d.y}) rotate(${d.r} ${12 * d.s} ${12 * d.s}) scale(${d.s})`"
      :fill="d.fill || d.paw ? colour : 'none'"
      :stroke="d.line ? colour : 'none'"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path v-if="d.fill" :d="d.fill" />
      <path v-else-if="d.line" :d="d.line" />
      <template v-else-if="d.paw">
        <ellipse v-for="(p, n) in PAW" :key="n" :cx="p[0]" :cy="p[1]" :rx="p[2]" :ry="p[3]" />
      </template>
      <circle v-for="(dot, n) in d.dots || []" :key="`d${n}`" :cx="dot[0]" :cy="dot[1]" r="1.1" :fill="colour" stroke="none" />
    </g>
  </pattern>
</template>
