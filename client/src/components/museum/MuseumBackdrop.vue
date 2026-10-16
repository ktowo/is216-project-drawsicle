<script setup>
import { computed, useId } from 'vue';
import { assetUrl } from '@/api';
import { iso, tilePoints, wallTransform, wallQuad, WALL_H } from '@/museum/iso';
import { FRAME, RUG } from '@/museum/layout';
import DoodlePattern from './DoodlePattern.vue';

// Everything in a museum room that stays put: the doodles behind it, walls, floor, the
// pictures and the doors, in the room design's colours (shared/museum-themes.mjs). Darker designs
// lay a shade over the walls and floor with holes where the light falls (museum/lights.js).
// The pictures and doors are buttons (Tab, then Enter or Space) as well as click targets.
const props = defineProps({
  room: { type: Object, required: true },
  theme: { type: Object, required: true },
  lights: { type: Object, required: true }, // roomLights()
  view: { type: Object, required: true }, // { minX, minY, maxX, maxY }
  hoverTile: { type: Object, default: null },
  destination: { type: Object, default: null },
});
const emit = defineEmits(['frame', 'door', 'hover']);

const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
const ids = {
  blur: `${uid}-blur`,
  wallLeft: `${uid}-wall-left`,
  wallRight: `${uid}-wall-right`,
  pattern: `${uid}-pattern`,
  mask: `${uid}-mask`,
  hole: `${uid}-hole`,
};
const url = (id) => `url(#${id})`;

const W = computed(() => props.room.width);
const D = computed(() => props.room.depth);
const pt = (p, lift = 0) => `${p.x},${p.y - lift}`;

// Back walls: the left one along x = 0, the right one along y = 0, each with a skirting board
// along the bottom and a thick top edge
const walls = computed(() => {
  const o = iso(0, 0);
  const l = iso(0, D.value);
  const r = iso(W.value, 0);
  const T = 9; // wall thickness on screen
  return {
    left: [pt(o, WALL_H), pt(l, WALL_H), pt(l), pt(o)].join(' '),
    right: [pt(o, WALL_H), pt(r, WALL_H), pt(r), pt(o)].join(' '),
    leftSkirt: [pt(o, 12), pt(l, 12), pt(l), pt(o)].join(' '),
    rightSkirt: [pt(o, 12), pt(r, 12), pt(r), pt(o)].join(' '),
    leftCap: [pt(o, WALL_H), pt(l, WALL_H), `${l.x - T},${l.y - WALL_H - T / 2}`, `${o.x},${o.y - WALL_H - T}`].join(' '),
    rightCap: [pt(o, WALL_H), pt(r, WALL_H), `${r.x + T},${r.y - WALL_H - T / 2}`, `${o.x},${o.y - WALL_H - T}`].join(' '),
    leftEnd: [pt(l), pt(l, WALL_H), `${l.x - T},${l.y - WALL_H - T / 2}`, `${l.x - T},${l.y - T / 2}`].join(' '),
    rightEnd: [pt(r), pt(r, WALL_H), `${r.x + T},${r.y - WALL_H - T / 2}`, `${r.x + T},${r.y - T / 2}`].join(' '),
    corner: `M ${o.x} ${o.y} L ${o.x} ${o.y - WALL_H}`,
    floor: [iso(0, 0), iso(W.value, 0), iso(W.value, D.value), iso(0, D.value)].map((p) => pt(p)).join(' '),
  };
});

const tiles = computed(() => {
  const list = [];
  for (let x = 0; x < W.value; x++) {
    for (let y = 0; y < D.value; y++) {
      const onRug = x >= RUG.x && x < RUG.x + RUG.w && y >= RUG.y && y < RUG.y + RUG.h;
      list.push({ key: `${x},${y}`, points: tilePoints(x, y), fill: onRug ? 0 : (x + y) % 2 ? 1 : 2 });
    }
  }
  return list;
});
const floorFill = (n) => (n === 0 ? props.theme.rug[0] : props.theme.floor[n - 1]);
const floorLine = (n) => (n === 0 ? props.theme.rug[1] : props.theme.floor[2]);
const rugBorder = computed(() =>
  [iso(RUG.x, RUG.y), iso(RUG.x + RUG.w, RUG.y), iso(RUG.x + RUG.w, RUG.y + RUG.h), iso(RUG.x, RUG.y + RUG.h)]
    .map((p) => `${p.x},${p.y}`)
    .join(' ')
);

const warnedOf = (sub) => (sub.contentWarnings || []).length > 0;
const coverOf = (sub) => sub.thumbnails?.[0] || sub.images?.[0] || null;
const nameOf = (user) => user?.displayName || 'someone';
// A story or a link-only gift hangs as a little card with its title on it
function titleLines(sub) {
  const words = (sub.title || 'Untitled').split(/\s+/);
  const lines = [''];
  for (const w of words) {
    const line = lines[lines.length - 1];
    if ((line + ' ' + w).trim().length > 13 && line) {
      if (lines.length === 3) break;
      lines.push(w);
    } else lines[lines.length - 1] = (line + ' ' + w).trim();
  }
  return lines;
}

const frames = computed(() =>
  props.room.frames.map((f) => {
    const sub = f.artwork.submission;
    return {
      ...f,
      sub,
      cover: coverOf(sub),
      warned: warnedOf(sub),
      label: `${sub.title || 'Untitled gift'} by ${nameOf(f.artwork.giver)}, for ${nameOf(f.artwork.recipient)}`,
      outer: wallQuad(f.wall, f.at, FRAME.width + 0.2, FRAME.height + 14, FRAME.bottom - 7),
      mat: wallQuad(f.wall, f.at, FRAME.width + 0.08, FRAME.height + 5, FRAME.bottom - 2.5),
      picture: wallTransform(f.wall, f.at, FRAME.width, FRAME.height, FRAME.bottom, 100),
      plaque: wallQuad(f.wall, f.at, 0.5, 9, FRAME.bottom - 22),
      lines: coverOf(sub) ? [] : titleLines(sub),
    };
  })
);

const doors = computed(() =>
  props.room.doors.map((d) => ({
    ...d,
    outer: wallQuad(d.wall, d.at, 1, 112, 0),
    inner: wallQuad(d.wall, d.at, 0.82, 104, 0),
    sign: wallTransform(d.wall, d.at, 1, 22, 120, 100),
  }))
);

// ---------- Light ----------
const mode = computed(() => props.lights.mode);
// The floor's grid laid flat on screen: draw in tiles inside this and it lands on the floor
const FLOOR = 'matrix(32 16 -32 16 0 0)';
const pools = computed(() =>
  props.lights.pools.map((p, i) => ({
    ...p,
    key: `${p.kind}-${i}`,
    // A picture's light also washes the wall round it
    wall: p.frame ? wallTransform(p.frame.wall, p.frame.at, mode.value.spots ? 2.5 : 1.9, 140, 6, 100) : null,
    delay: `${0.15 + i * 0.12}s`,
  }))
);
// Golden hour: the sun comes in low from the left and lies across the floor in long stripes
const sunbeams = [
  [1, 1.4, 9.6, 4.2, 1.0],
  [1, 3.9, 9.6, 6.7, 0.75],
  [1, 6.4, 9.6, 9.2, 0.9],
].map(([x0, y0, x1, y1, w]) => `${x0},${y0} ${x1},${y1} ${x1},${y1 + w} ${x0},${y0 + w}`);

const markerPoints = (t) => (t ? tilePoints(t.x, t.y) : '');

function activate(kind, item, event) {
  if (event?.type === 'keydown') event.preventDefault();
  emit(kind, item);
}
</script>

<template>
  <g class="backdrop">
    <defs>
      <filter :id="ids.blur" x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation="7" />
      </filter>
      <linearGradient :id="ids.wallLeft" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" :stop-color="theme.wallLeft[0]" />
        <stop offset="1" :stop-color="theme.wallLeft[1]" />
      </linearGradient>
      <linearGradient :id="ids.wallRight" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" :stop-color="theme.wallRight[0]" />
        <stop offset="1" :stop-color="theme.wallRight[1]" />
      </linearGradient>
      <!-- Faint doodles behind the room -->
      <DoodlePattern :id="ids.pattern" colour="#ffffff" />
      <!-- Light: black lets it through the shade, so each pool is a soft-edged hole -->
      <radialGradient :id="ids.hole">
        <stop offset="0" stop-color="#000" stop-opacity="1" />
        <stop offset="0.55" stop-color="#000" stop-opacity="0.8" />
        <stop offset="1" stop-color="#000" stop-opacity="0" />
      </radialGradient>
      <mask v-if="mode.dark" :id="ids.mask" maskUnits="userSpaceOnUse" :x="view.minX" :y="view.minY" :width="view.maxX - view.minX" :height="view.maxY - view.minY">
        <rect :x="view.minX" :y="view.minY" :width="view.maxX - view.minX" :height="view.maxY - view.minY" fill="#fff" />
        <g v-for="p in pools" :key="p.key" class="light-on" :style="{ animationDelay: p.delay }">
          <g v-if="p.wall" :transform="p.wall">
            <ellipse cx="50" cy="48" rx="48" ry="54" :fill="url(ids.hole)" />
          </g>
          <g :transform="FLOOR">
            <circle :cx="p.x" :cy="p.y" :r="p.r" :fill="url(ids.hole)" />
          </g>
        </g>
      </mask>
    </defs>

    <!-- Behind the room -->
    <rect :x="view.minX" :y="view.minY" :width="view.maxX - view.minX" :height="view.maxY - view.minY" :fill="theme.void" />
    <rect :x="view.minX" :y="view.minY" :width="view.maxX - view.minX" :height="view.maxY - view.minY" :fill="url(ids.pattern)" opacity="0.06" />

    <!-- Walls -->
    <polygon :points="walls.left" :fill="url(ids.wallLeft)" />
    <polygon :points="walls.right" :fill="url(ids.wallRight)" />
    <polygon :points="walls.leftSkirt" :fill="theme.skirt[0]" />
    <polygon :points="walls.rightSkirt" :fill="theme.skirt[1]" />
    <polygon :points="walls.leftCap" :fill="theme.cap[0]" :stroke="theme.cap[1]" stroke-width="0.6" />
    <polygon :points="walls.rightCap" :fill="theme.cap[0]" :stroke="theme.cap[1]" stroke-width="0.6" />
    <polygon :points="walls.leftEnd" :fill="theme.cap[1]" />
    <polygon :points="walls.rightEnd" :fill="theme.cap[1]" />
    <path :d="walls.corner" :stroke="theme.cap[1]" stroke-width="1.2" />

    <!-- Doors to the next and previous rooms -->
    <g
      v-for="d in doors"
      :key="d.label"
      class="door"
      role="button"
      tabindex="0"
      :aria-label="`${d.label}: walk through the door`"
      @click.stop="activate('door', d)"
      @keydown.enter="activate('door', d, $event)"
      @keydown.space="activate('door', d, $event)"
      @mouseenter="emit('hover', { kind: 'door', text: d.label })"
      @mouseleave="emit('hover', null)"
      @focus="emit('hover', { kind: 'door', text: d.label })"
      @blur="emit('hover', null)"
    >
      <polygon :points="d.outer" :fill="theme.frame[0]" />
      <polygon :points="d.inner" class="door-dark" />
      <g :transform="d.sign">
        <rect x="6" y="0" width="88" height="100" rx="14" class="sign" />
        <text x="50" y="68" class="sign-text">{{ d.to > room.index ? 'Next →' : '← Back' }}</text>
      </g>
      <polygon :points="d.outer" class="focus-ring" />
    </g>

    <!-- Pictures -->
    <g
      v-for="f in frames"
      :key="f.sub.id"
      class="frame"
      role="button"
      tabindex="0"
      :aria-label="`Look at ${f.label}`"
      @click.stop="activate('frame', f)"
      @keydown.enter="activate('frame', f, $event)"
      @keydown.space="activate('frame', f, $event)"
      @mouseenter="emit('hover', { kind: 'frame', text: f.label, number: f.number })"
      @mouseleave="emit('hover', null)"
      @focus="emit('hover', { kind: 'frame', text: f.label, number: f.number })"
      @blur="emit('hover', null)"
    >
      <polygon :points="f.outer" :fill="theme.frame[0]" :stroke="theme.frame[1]" stroke-width="1" />
      <polygon :points="f.mat" :fill="theme.frame[2]" />
      <g :transform="f.picture">
        <template v-if="f.cover">
          <image
            :href="assetUrl(f.cover)"
            x="0"
            y="0"
            width="100"
            height="100"
            preserveAspectRatio="xMidYMid slice"
            :filter="f.warned ? url(ids.blur) : undefined"
          />
          <template v-if="f.warned">
            <rect width="100" height="100" class="veil" />
            <text x="50" y="52" class="veil-icon">⚠</text>
            <text x="50" y="74" class="veil-text">Content note</text>
          </template>
        </template>
        <template v-else>
          <rect width="100" height="100" class="paper" />
          <line v-for="n in 6" :key="n" x1="12" :x2="88" :y1="44 + n * 8" :y2="44 + n * 8" class="paper-line" />
          <text v-for="(line, i) in f.lines" :key="i" x="50" :y="18 + i * 11" class="paper-title">{{ line }}</text>
        </template>
      </g>
      <polygon :points="f.plaque" class="plaque" />
      <polygon :points="f.outer" class="focus-ring" />
    </g>

    <!-- Floor -->
    <g class="floor">
      <polygon v-for="t in tiles" :key="t.key" :points="t.points" :fill="floorFill(t.fill)" :stroke="floorLine(t.fill)" stroke-width="0.6" />
      <polygon :points="rugBorder" class="rug-border" :stroke="theme.rug[2]" />
      <g v-if="mode.sun" :transform="FLOOR" class="sun">
        <polygon v-for="(b, i) in sunbeams" :key="i" :points="b" />
      </g>
    </g>

    <!-- The shade over a darker room, with the light let through -->
    <g v-if="mode.dark" :mask="url(ids.mask)" class="shade" :style="{ opacity: mode.dark }">
      <polygon :points="walls.left" :fill="mode.shade" />
      <polygon :points="walls.right" :fill="mode.shade" />
      <polygon :points="walls.floor" :fill="mode.shade" />
    </g>

    <polygon v-if="destination" :points="markerPoints(destination)" class="destination" />
    <polygon v-if="hoverTile" :points="markerPoints(hoverTile)" class="hover-tile" />
  </g>
</template>

<style scoped>
.shade {
  pointer-events: none;
  transition: opacity 0.6s ease;
}
.sun polygon {
  fill: #ffd98c;
  opacity: 0.28;
  pointer-events: none;
}
.rug-border {
  fill: none;
  stroke-width: 3;
  stroke-dasharray: 8 5;
}
.hover-tile {
  fill: rgba(255, 255, 255, 0.22);
  stroke: #fff;
  stroke-width: 1.5;
  pointer-events: none;
}
.destination {
  fill: rgba(236, 106, 147, 0.35);
  stroke: #ec6a93;
  stroke-width: 2;
  pointer-events: none;
}
.frame,
.door {
  cursor: pointer;
  outline: none;
}
.plaque {
  fill: #e6c35c;
  stroke: #a88834;
  stroke-width: 0.5;
}
.veil {
  fill: rgba(40, 28, 44, 0.5);
}
.veil-icon {
  font-size: 30px;
  text-anchor: middle;
  fill: #fff;
}
.veil-text {
  font-size: 12px;
  font-weight: 700;
  text-anchor: middle;
  fill: #fff;
  font-family: var(--font-body);
}
.paper {
  fill: #fffaf0;
}
.paper-line {
  stroke: #e8dcc6;
  stroke-width: 1.4;
}
.paper-title {
  font-size: 11px;
  font-weight: 800;
  text-anchor: middle;
  fill: #6b4a3a;
  font-family: var(--font-body);
}
.door-dark {
  fill: #2a2233;
}
.sign {
  fill: #ec6a93;
}
.sign-text {
  font-size: 44px;
  font-weight: 800;
  text-anchor: middle;
  fill: #fff;
  font-family: var(--font-body);
}
.focus-ring {
  fill: none;
  stroke: transparent;
  stroke-width: 3;
  pointer-events: none;
}
.frame:hover .focus-ring,
.door:hover .focus-ring {
  stroke: rgba(255, 255, 255, 0.85);
}
.frame:focus-visible .focus-ring,
.door:focus-visible .focus-ring {
  stroke: #ec6a93;
  stroke-width: 4;
}
/* The lights come up one picture after another as you walk in */
@media (prefers-reduced-motion: no-preference) {
  .light-on {
    animation: lights-on 0.9s ease-out both;
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
    opacity: 0.3;
  }
  100% {
    opacity: 1;
  }
}
</style>
