<script setup>
import { computed } from 'vue';
import { assetUrl } from '@/api';
import { iso, tilePoints, wallTransform, wallQuad, WALL_H } from '@/museum/iso';
import { FRAME, RUG } from '@/museum/layout';

// Everything in a museum room that stays put: walls, floor, the pictures and the doors.
// The pictures and doors are buttons (Tab, then Enter or Space) as well as click targets.
const props = defineProps({
  room: { type: Object, required: true },
  hoverTile: { type: Object, default: null },
  destination: { type: Object, default: null },
});
const emit = defineEmits(['frame', 'door', 'hover']);

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
  };
});

const tiles = computed(() => {
  const list = [];
  for (let x = 0; x < W.value; x++) {
    for (let y = 0; y < D.value; y++) {
      const onRug = x >= RUG.x && x < RUG.x + RUG.w && y >= RUG.y && y < RUG.y + RUG.h;
      list.push({ key: `${x},${y}`, points: tilePoints(x, y), cls: onRug ? 'rug' : (x + y) % 2 ? 'wood-a' : 'wood-b' });
    }
  }
  return list;
});
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
    outer: wallQuad(d.wall, d.at, 1.15, 112, 0),
    inner: wallQuad(d.wall, d.at, 0.95, 104, 0),
    sign: wallTransform(d.wall, d.at, 1.15, 22, 120, 100),
  }))
);

const markerPoints = (t) => (t ? tilePoints(t.x, t.y) : '');

function activate(kind, item, event) {
  if (event?.type === 'keydown') event.preventDefault();
  emit(kind, item);
}
</script>

<template>
  <g class="backdrop">
    <defs>
      <filter id="museum-blur" x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation="7" />
      </filter>
      <linearGradient id="museum-wall-left" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f1ddd5" />
        <stop offset="1" stop-color="#e6c9bf" />
      </linearGradient>
      <linearGradient id="museum-wall-right" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f8e9e2" />
        <stop offset="1" stop-color="#efd8cf" />
      </linearGradient>
    </defs>

    <!-- Walls -->
    <polygon :points="walls.left" fill="url(#museum-wall-left)" />
    <polygon :points="walls.right" fill="url(#museum-wall-right)" />
    <polygon :points="walls.leftSkirt" class="skirt dark" />
    <polygon :points="walls.rightSkirt" class="skirt" />
    <polygon :points="walls.leftCap" class="cap" />
    <polygon :points="walls.rightCap" class="cap" />
    <polygon :points="walls.leftEnd" class="end" />
    <polygon :points="walls.rightEnd" class="end" />
    <path :d="walls.corner" class="corner" />

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
      <polygon :points="d.outer" class="door-frame" />
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
      <polygon :points="f.outer" class="frame-wood" />
      <polygon :points="f.mat" class="frame-mat" />
      <g :transform="f.picture">
        <template v-if="f.cover">
          <image
            :href="assetUrl(f.cover)"
            x="0"
            y="0"
            width="100"
            height="100"
            preserveAspectRatio="xMidYMid slice"
            :filter="f.warned ? 'url(#museum-blur)' : undefined"
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
      <polygon v-for="t in tiles" :key="t.key" :points="t.points" :class="t.cls" />
      <polygon :points="rugBorder" class="rug-border" />
      <polygon v-if="destination" :points="markerPoints(destination)" class="destination" />
      <polygon v-if="hoverTile" :points="markerPoints(hoverTile)" class="hover-tile" />
    </g>
  </g>
</template>

<style scoped>
.skirt {
  fill: #c39788;
}
.skirt.dark {
  fill: #b08476;
}
.cap {
  fill: #fff6f1;
  stroke: #d9b9ad;
  stroke-width: 0.6;
}
.end {
  fill: #d9b9ad;
}
.corner {
  stroke: #d7b6aa;
  stroke-width: 1.2;
}
.wood-a {
  fill: #d8b18a;
  stroke: #c9a07a;
  stroke-width: 0.6;
}
.wood-b {
  fill: #cfa67e;
  stroke: #c39a72;
  stroke-width: 0.6;
}
.rug {
  fill: #c75b7f;
  stroke: #b84f72;
  stroke-width: 0.5;
}
.rug-border {
  fill: none;
  stroke: #f4cf6a;
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
.frame-wood {
  fill: #a46d43;
  stroke: #7b4f2e;
  stroke-width: 1;
}
.frame-mat {
  fill: #fbf6ee;
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
.door-frame {
  fill: #8a5a3b;
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
</style>
