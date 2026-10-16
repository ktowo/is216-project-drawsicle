<script setup>
import { computed, useId } from 'vue';
import { iso, wallQuad, WALL_H } from '@/museum/iso';
import { FRAME, LAMP, ROOM_W, ROOM_D } from '@/museum/layout';

// The light fittings and their beams, drawn over the room (museum/lights.js says where the
// light falls; MuseumBackdrop.vue lets it through the shade). Purely decoration: it never takes
// clicks, and the dust in the beams only drifts for people who don't mind motion.
//   spotlight / track  a ceiling track along the pictures on each wall, a can and a beam for each
//   warm               a brass picture light over each picture, and the lamp's glow
//   golden             a warm haze from the low sun
const props = defineProps({
  lights: { type: Object, required: true },
});

const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
const mode = computed(() => props.lights.mode);
const pts = (list) => list.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
const OUT = 1.25; // how far from the wall the ceiling track hangs, in tiles
const CEILING = WALL_H + 6;

// A point on the ceiling: grid (x, y) lifted to ceiling height
const up = (x, y, lift = CEILING) => {
  const p = iso(x, y);
  return { x: p.x, y: p.y - lift };
};
// The corners of a picture's frame: [top near, top far, bottom far, bottom near]
const corners = (frame) =>
  wallQuad(frame.wall, frame.at, FRAME.width + 0.2, FRAME.height + 14, FRAME.bottom - 7)
    .split(' ')
    .map((s) => {
      const [x, y] = s.split(',').map(Number);
      return { x, y };
    });

const beams = computed(() => {
  if (!mode.value.spots) return [];
  return props.lights.pools
    .filter((p) => p.kind === 'picture')
    .map((p, i) => {
      const f = p.frame;
      const can = f.wall === 'left' ? up(OUT, f.at) : up(f.at, OUT);
      const [a, b, c, d] = corners(f);
      const spread = 10;
      const bottom = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 };
      return {
        key: `b${i}`,
        can,
        shape: pts([
          { x: can.x - 2, y: can.y },
          { x: can.x + 2, y: can.y },
          { x: c.x + (c.x > d.x ? spread : -spread), y: c.y + 6 },
          { x: d.x + (d.x > c.x ? spread : -spread), y: d.y + 6 },
        ]),
        from: can,
        to: bottom,
        motes: [0.35, 0.55, 0.75].map((t, n) => ({
          x: can.x + (bottom.x - can.x) * t + (n - 1) * 5,
          y: can.y + (bottom.y - can.y) * t,
          delay: `${(i * 0.7 + n * 1.3) % 4}s`,
        })),
        top: [a, b],
        delay: `${0.15 + i * 0.12}s`,
      };
    });
});

// The ceiling tracks the cans hang from: one along the pictures on each wall that has any
const tracks = computed(() => {
  if (!mode.value.spots) return [];
  return ['left', 'right'].flatMap((wall) => {
    const spots = props.lights.pools.filter((p) => p.kind === 'picture' && p.frame.wall === wall).map((p) => p.frame.at);
    if (!spots.length) return [];
    const from = Math.min(...spots) - 0.6;
    const to = Math.max(...spots) + 0.6;
    return [wall === 'left' ? [up(OUT, from), up(OUT, to)] : [up(from, OUT), up(to, OUT)]];
  });
});

// Brass picture lights just above each frame, with a soft fan of light down over it
const pictureLights = computed(() => {
  if (!mode.value.pictureLights) return [];
  return props.lights.pools
    .filter((p) => p.kind === 'picture')
    .map((p, i) => {
      const f = p.frame;
      const hood = wallQuad(f.wall, f.at, 0.62, 5, FRAME.bottom + FRAME.height + 12);
      const [a, b] = corners(f);
      const [h1, h2] = hood
        .split(' ')
        .slice(2)
        .map((s) => {
          const [x, y] = s.split(',').map(Number);
          return { x, y };
        });
      return {
        key: `p${i}`,
        hood,
        glow: pts([h1, h2, { x: a.x, y: a.y + 30 }, { x: b.x, y: b.y + 30 }]),
        from: { x: (h1.x + h2.x) / 2, y: h1.y },
        to: { x: (a.x + b.x) / 2, y: a.y + 30 },
        delay: `${0.15 + i * 0.12}s`,
      };
    });
});

// The room's outline on screen (walls and floor), so the sun's haze stays inside it
const outline = pts([
  up(0, ROOM_D, WALL_H),
  up(0, 0, WALL_H),
  up(ROOM_W, 0, WALL_H),
  iso(ROOM_W, 0),
  iso(ROOM_W, ROOM_D),
  iso(0, ROOM_D),
]);

const lamp = computed(() => {
  if (!mode.value.lamp) return null;
  const c = iso(LAMP.x + 0.5, LAMP.y + 0.5);
  return { x: c.x, y: c.y - 34 };
});
</script>

<template>
  <g class="lights" aria-hidden="true">
    <defs>
      <linearGradient v-for="b in beams" :id="`${uid}-${b.key}`" :key="b.key" gradientUnits="userSpaceOnUse" :x1="b.from.x" :y1="b.from.y" :x2="b.to.x" :y2="b.to.y">
        <stop offset="0" stop-color="#fff6d8" stop-opacity="0.95" />
        <stop offset="1" stop-color="#fff6d8" stop-opacity="0" />
      </linearGradient>
      <linearGradient v-for="p in pictureLights" :id="`${uid}-${p.key}`" :key="p.key" gradientUnits="userSpaceOnUse" :x1="p.from.x" :y1="p.from.y" :x2="p.to.x" :y2="p.to.y">
        <stop offset="0" stop-color="#ffe2a8" stop-opacity="0.85" />
        <stop offset="1" stop-color="#ffe2a8" stop-opacity="0" />
      </linearGradient>
      <radialGradient :id="`${uid}-lamp`">
        <stop offset="0" stop-color="#ffe0a0" stop-opacity="0.75" />
        <stop offset="1" stop-color="#ffe0a0" stop-opacity="0" />
      </radialGradient>
      <linearGradient :id="`${uid}-haze`" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffb35c" stop-opacity="0.22" />
        <stop offset="0.6" stop-color="#ff9a6b" stop-opacity="0.06" />
        <stop offset="1" stop-color="#ff9a6b" stop-opacity="0" />
      </linearGradient>
    </defs>

    <!-- Ceiling tracks and spotlight beams -->
    <line v-for="(t, i) in tracks" :key="`t${i}`" :x1="t[0].x" :y1="t[0].y" :x2="t[1].x" :y2="t[1].y" class="track" />
    <g v-for="b in beams" :key="b.key" class="beam" :style="{ animationDelay: b.delay }">
      <polygon :points="b.shape" :fill="`url(#${uid}-${b.key})`" :style="{ opacity: mode.beams }" />
      <circle v-for="(m, n) in b.motes" :key="n" :cx="m.x" :cy="m.y" r="0.9" class="mote" :style="{ animationDelay: m.delay }" />
      <rect :x="b.can.x - 3.5" :y="b.can.y - 2" width="7" height="7" rx="2" class="can" />
    </g>

    <!-- Picture lights -->
    <g v-for="p in pictureLights" :key="p.key" class="beam" :style="{ animationDelay: p.delay }">
      <polygon :points="p.glow" :fill="`url(#${uid}-${p.key})`" opacity="0.4" />
      <polygon :points="p.hood" class="hood" />
    </g>

    <!-- The lamp's glow -->
    <circle v-if="lamp" :cx="lamp.x" :cy="lamp.y" r="46" :fill="`url(#${uid}-lamp)`" class="glow" />

    <!-- Late sun -->
    <polygon v-if="mode.sun" :points="outline" :fill="`url(#${uid}-haze)`" />
  </g>
</template>

<style scoped>
.lights {
  pointer-events: none;
}
.track {
  stroke: #1d1b26;
  stroke-width: 2.5;
  stroke-linecap: round;
}
.can {
  fill: #2b2834;
  stroke: #57536a;
  stroke-width: 0.8;
}
.hood {
  fill: #c9a24a;
  stroke: #8a6a22;
  stroke-width: 0.6;
}
.mote {
  fill: #fff6d8;
  opacity: 0;
}
.beam polygon,
.glow {
  mix-blend-mode: screen;
}
@media (prefers-reduced-motion: no-preference) {
  .beam {
    animation: lights-on 0.9s ease-out both;
  }
  .mote {
    animation: mote 4s ease-in-out infinite;
  }
}
@media (prefers-reduced-motion: reduce) {
  .mote {
    display: none;
  }
}
@keyframes lights-on {
  0% {
    opacity: 0;
  }
  40% {
    opacity: 0.9;
  }
  55% {
    opacity: 0.25;
  }
  100% {
    opacity: 1;
  }
}
@keyframes mote {
  0% {
    opacity: 0;
    transform: translate(0, 0);
  }
  30% {
    opacity: 0.9;
  }
  100% {
    opacity: 0;
    transform: translate(4px, 10px);
  }
}
</style>
