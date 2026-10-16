<script setup>
import { computed, useId } from 'vue';
import { Repeat } from 'lucide-vue-next';
import { personName } from './helpers';
import { pluralize } from '@/utils/format';

// The matches drawn as gift loops: each ring is a group of artists who make gifts for each other
// in a circle, with arrows from artist to recipient. Hovering an arrow highlights that pair in the
// list beside it (and the other way round, through `highlight`). On narrow screens, and for
// screen readers, the same loops are a plain list.
const props = defineProps({
  matches: { type: Array, default: () => [] }, // [{ id, giver, recipient }]
  highlight: { type: String, default: null }, // a match id
});
const emit = defineEmits(['highlight']);
const uid = useId();

const NODE_R = 17;
const SPACING = 72; // room for each person around a ring
const MIN_R = 62;
const PAD_X = 92; // beside each ring, for names
const PAD_Y = 36; // above and below it
const WRAP = 700; // rings wrap onto a new row past this width
const GAP = 12;
const LABEL_LIMIT = 18; // bigger loops show names on hover only

// Follow giver -> recipient until we're back where we started. Chains that don't close (only in a
// draft with someone left out) start from their first giver so they stay in one piece.
const loops = computed(() => {
  const valid = props.matches.filter((m) => m.giver?.id && m.recipient?.id);
  const byGiver = new Map(valid.map((m) => [m.giver.id, m]));
  const recipients = new Set(valid.map((m) => m.recipient.id));
  const starts = [...valid.filter((m) => !recipients.has(m.giver.id)), ...valid];
  const seen = new Set();
  const out = [];
  for (const start of starts) {
    if (seen.has(start.id)) continue;
    const chain = [];
    let m = start;
    while (m && !seen.has(m.id)) {
      seen.add(m.id);
      chain.push(m);
      m = byGiver.get(m.recipient.id);
    }
    out.push({ matches: chain, closed: m === chain[0] });
  }
  return out.sort((a, b) => b.matches.length - a.matches.length);
});

const initials = (user) =>
  personName(user)
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
const shortName = (user) => {
  const name = personName(user);
  return name.length > 12 ? `${name.slice(0, 11)}…` : name;
};

// Ring sizes and where each one sits: left to right, wrapping into rows, each row centred
const layout = computed(() => {
  const sizes = loops.value.map((loop) => {
    // An open chain (a draft with someone left out) also ends at someone who gives nothing yet
    const count = loop.matches.length + (loop.closed ? 0 : 1);
    const r = Math.max(MIN_R, (count * SPACING) / (2 * Math.PI));
    return { r, count, w: 2 * (r + PAD_X), h: 2 * (r + PAD_Y) };
  });
  const limit = Math.max(WRAP, ...sizes.map((x) => x.w));
  const rows = [];
  for (const [i, { w, h }] of sizes.entries()) {
    const row = rows[rows.length - 1];
    if (row && row.used + GAP + w <= limit) {
      row.items.push(i);
      row.used += GAP + w;
      row.height = Math.max(row.height, h);
    } else {
      rows.push({ items: [i], used: w, height: h });
    }
  }
  // As wide as the widest row, so a single small loop isn't lost in empty space
  const width = Math.max(...rows.map((r) => r.used));
  const place = new Map();
  let y = 0;
  for (const row of rows) {
    let x = (width - row.used) / 2;
    for (const i of row.items) {
      place.set(i, { x, y: y + (row.height - sizes[i].h) / 2 });
      x += sizes[i].w + GAP;
    }
    y += row.height + GAP;
  }

  const rings = [];
  for (const [li, loop] of loops.value.entries()) {
    const { r, count, w, h } = sizes[li];
    const { x, y: top } = place.get(li);
    const cx = x + w / 2;
    const cy = top + h / 2;
    const at = (i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
      return { angle, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    };
    // People in order round the ring, starting at the top and going clockwise
    const people = loop.matches.map((m, i) => ({ user: m.giver, match: m, ...at(i) }));
    if (!loop.closed) people.push({ user: loop.matches[loop.matches.length - 1].recipient, match: null, ...at(count - 1) });
    rings.push({ cx, cy, r, loop, people, showNames: people.length <= LABEL_LIMIT });
  }
  return { rings, width, height: Math.max(0, y - GAP) };
});

// The curved arrow for one match, from the giver's dot to the recipient's
function arrowPath(ring, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const sx = from.x + ux * (NODE_R + 2);
  const sy = from.y + uy * (NODE_R + 2);
  const ex = to.x - ux * (NODE_R + 4);
  const ey = to.y - uy * (NODE_R + 4);
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  // Bend outwards from the ring's centre; two people swapping gifts bend to opposite sides
  let ox = mx - ring.cx;
  let oy = my - ring.cy;
  let olen = Math.hypot(ox, oy);
  if (olen < 1) {
    ox = -uy;
    oy = ux;
    olen = 1;
  }
  const bend = ring.people.length === 2 ? ring.r * 0.55 : len * 0.12;
  const qx = mx + (ox / olen) * bend;
  const qy = my + (oy / olen) * bend;
  return `M ${sx.toFixed(1)} ${sy.toFixed(1)} Q ${qx.toFixed(1)} ${qy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
}

const arrows = computed(() =>
  layout.value.rings.flatMap((ring, ri) =>
    ring.loop.matches.map((m, i) => {
      const from = ring.people[i];
      const to = ring.people[(i + 1) % ring.people.length];
      // The last arrow of an open chain points at the extra person, not back to the start
      return { key: `${ri}-${m.id}`, match: m, d: arrowPath(ring, from, to) };
    })
  )
);

const highlighted = computed(() => props.matches.find((m) => m.id === props.highlight) || null);
const isActive = (user) =>
  Boolean(highlighted.value && (highlighted.value.giver?.id === user?.id || highlighted.value.recipient?.id === user?.id));

function labelAnchor(angle) {
  const c = Math.cos(angle);
  return c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle';
}
function labelPos(ring, p) {
  const out = ring.r + NODE_R + 10;
  return { x: ring.cx + out * Math.cos(p.angle), y: ring.cy + out * Math.sin(p.angle) + 4 };
}

const summary = computed(() => {
  const n = loops.value.length;
  if (!n) return '';
  if (n === 1 && loops.value[0].closed) return `Everyone is in one loop of ${pluralize(loops.value[0].matches.length, 'artist')}.`;
  return `${pluralize(n, 'loop')}: ${loops.value.map((l) => l.matches.length).join(', ')} artists.`;
});
</script>

<template>
  <figure v-if="loops.length" class="card loop-card" :aria-labelledby="`${uid}-cap`">
    <figcaption :id="`${uid}-cap`" class="cap">
      <span class="cap-title"><Repeat :size="17" aria-hidden="true" /> Gift loops</span>
      <span class="hint">{{ summary }} Follow the arrows from artist to recipient.</span>
    </figcaption>

    <div class="canvas">
      <svg
        :viewBox="`0 0 ${layout.width} ${layout.height}`"
        :style="{ maxWidth: `${Math.round(layout.width * 1.15)}px` }"
        class="diagram"
        :class="{ focused: Boolean(highlighted) }"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <marker :id="`${uid}-head`" viewBox="0 0 10 10" refX="7" refY="5" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" class="head" />
          </marker>
          <marker :id="`${uid}-head-on`" viewBox="0 0 10 10" refX="7" refY="5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" class="head on" />
          </marker>
        </defs>

        <circle v-for="(ring, ri) in layout.rings" :key="`ring-${ri}`" :cx="ring.cx" :cy="ring.cy" :r="ring.r" class="ring" />

        <path
          v-for="a in arrows"
          :key="a.key"
          :d="a.d"
          class="arrow"
          :class="{ on: a.match.id === highlight }"
          :marker-end="`url(#${uid}-head${a.match.id === highlight ? '-on' : ''})`"
          @mouseenter="emit('highlight', a.match.id)"
          @mouseleave="emit('highlight', null)"
        >
          <title>{{ personName(a.match.giver) }} makes a gift for {{ personName(a.match.recipient) }}</title>
        </path>

        <g v-for="(ring, ri) in layout.rings" :key="`people-${ri}`">
          <g
            v-for="p in ring.people"
            :key="p.user.id"
            class="person"
            :class="{ on: isActive(p.user) }"
            @mouseenter="p.match && emit('highlight', p.match.id)"
            @mouseleave="emit('highlight', null)"
          >
            <title>{{ personName(p.user) }}</title>
            <circle :cx="p.x" :cy="p.y" :r="NODE_R" class="node" />
            <text :x="p.x" :y="p.y + 4" class="initials">{{ initials(p.user) }}</text>
            <text
              v-if="ring.showNames"
              :x="labelPos(ring, p).x"
              :y="labelPos(ring, p).y"
              :text-anchor="labelAnchor(p.angle)"
              class="name"
            >
              {{ shortName(p.user) }}
            </text>
          </g>
        </g>
      </svg>
    </div>

    <!-- The same loops in words: shown on small screens, read by screen readers everywhere -->
    <ol class="loop-list">
      <li v-for="(loop, i) in loops" :key="i">
        <strong>Loop {{ i + 1 }}</strong> ({{ pluralize(loop.matches.length, 'artist') }}):
        <template v-for="(m, j) in loop.matches" :key="m.id">
          {{ personName(m.giver) }}{{ j < loop.matches.length - 1 ? ' → ' : '' }}
        </template>
        <template v-if="loop.closed"> → back to {{ personName(loop.matches[0].giver) }}</template>
        <template v-else> → {{ personName(loop.matches[loop.matches.length - 1].recipient) }} (not making a gift yet)</template>
      </li>
    </ol>
  </figure>
</template>

<style scoped>
.loop-card {
  margin: 0;
  padding: 16px 18px;
}
.cap {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
  margin-bottom: 8px;
}
.cap-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
}
.canvas {
  max-height: 560px;
  overflow: auto;
}
.diagram {
  display: block;
  margin: 0 auto;
  width: 100%;
  height: auto;
  font-family: var(--font-body);
}
.ring {
  fill: none;
  stroke: var(--border);
  stroke-width: 1.5;
  stroke-dasharray: 3 5;
}
.arrow {
  fill: none;
  stroke: var(--muted);
  stroke-width: 2;
  opacity: 0.75;
  cursor: pointer;
  transition: stroke 0.15s, stroke-width 0.15s, opacity 0.15s;
}
.head {
  fill: var(--muted);
}
.head.on {
  fill: var(--pink-dark);
}
.arrow.on {
  stroke: var(--pink-dark);
  stroke-width: 3.5;
  opacity: 1;
}
.focused .arrow:not(.on) {
  opacity: 0.25;
}
.node {
  fill: var(--pink-soft);
  stroke: var(--pink);
  stroke-width: 2;
  transition: fill 0.15s;
}
.person {
  cursor: default;
}
.person.on .node {
  fill: var(--pink);
  stroke: var(--pink-dark);
}
.focused .person:not(.on) {
  opacity: 0.45;
}
.initials {
  font-size: 11px;
  font-weight: 800;
  text-anchor: middle;
  fill: var(--pink-dark);
  pointer-events: none;
}
.person.on .initials {
  fill: #fff;
}
.name {
  font-size: 12px;
  font-weight: 600;
  fill: var(--text);
}
.loop-list {
  margin: 8px 0 0;
  padding-left: 20px;
  font-size: 0.9rem;
}
.loop-list li + li {
  margin-top: 4px;
}

/* Wide enough for the drawing: the list is for screen readers only */
@media (min-width: 560px) {
  .loop-list {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
}
/* Too narrow to read the drawing: show the list instead */
@media (max-width: 559px) {
  .canvas {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .arrow,
  .node {
    transition: none;
  }
}
</style>
