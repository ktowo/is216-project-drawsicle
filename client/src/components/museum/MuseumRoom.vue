<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, useId } from 'vue';
import { ArrowLeft, ArrowRight, MousePointerClick } from 'lucide-vue-next';
import MuseumBackdrop from './MuseumBackdrop.vue';
import PixelAvatar from './PixelAvatar.vue';
import { iso, screenToTile, facingFor, WALL_H } from '@/museum/iso';
import { findPath, nearestOpen } from '@/museum/pathfinding';
import { buildRoom, arrivalTile } from '@/museum/layout';
import { boxFaces, depthOf } from '@/museum/furniture';
import { lookFor, CHATTER } from '@/museum/looks';

// One room of the museum, drawn isometrically. Click (or tap) the floor to walk there; click a
// picture to walk up to it and look (emits `view`). The arrow keys walk too, and the pictures
// and doors are buttons you can Tab to. With reduced motion people move without walking.
const props = defineProps({
  artworks: { type: Array, required: true }, // gallery items: { submission, giver, recipient, event? }
  room: { type: Number, default: 0 }, // v-model:room
  me: { type: Object, default: null }, // the signed-in user, or null for a guest
  visitors: { type: Array, default: () => [] }, // other people wandering about (user minis)
});
const emit = defineEmits(['view', 'update:room']);

const uid = useId();
const svgRef = ref(null);
const layout = computed(() => buildRoom(props.artworks, props.room));

const calm = ref(false);
let motionQuery = null;
const onMotionChange = () => (calm.value = Boolean(motionQuery?.matches));

// ---------- The scene's size ----------
const view = computed(() => {
  const { width: W, depth: D } = layout.value;
  const minX = iso(0, D).x - 26;
  const maxX = iso(W, 0).x + 26;
  const minY = -WALL_H - 22;
  const maxY = iso(W, D).y + 20;
  return { box: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`, minX, minY, maxX, maxY };
});

// ---------- People ----------
const SPEED = 3.6; // tiles a second
const VISITOR_SPEED = 1.7;

function walker(extra) {
  return reactive({ x: 0, y: 0, path: [], facing: 'nw', walking: false, step: 0, clock: 0, bubble: '', bubbleUntil: 0, ...extra });
}
const player = walker({ action: null });
const visitors = reactive([]);
const destination = ref(null);
let cameFrom = null; // the room we just left, so we arrive by its door

const myName = computed(() => props.me?.displayName || 'You');
const myLook = computed(() => lookFor(props.me?.id || 'guest'));

function say(who, text, ms = 2600) {
  who.bubble = text;
  who.bubbleUntil = performance.now() + ms;
}

function placeEveryone() {
  const start = arrivalTile(layout.value, cameFrom);
  Object.assign(player, { x: start.x, y: start.y, path: [], walking: false, action: null, facing: cameFrom === null ? 'nw' : 'se' });
  destination.value = null;
  cameFrom = null;

  // Up to four of the artists wander about, starting on free tiles spread round the room
  visitors.splice(0);
  const taken = new Set([`${start.x},${start.y}`, ...layout.value.frames.map((f) => `${f.view.x},${f.view.y}`)]);
  const spots = [];
  for (let x = 1; x < layout.value.width - 1; x++) {
    for (let y = 2; y < layout.value.depth - 1; y++) {
      if (layout.value.isOpen(x, y) && !taken.has(`${x},${y}`)) spots.push({ x, y });
    }
  }
  props.visitors.slice(0, 4).forEach((user, i) => {
    const spot = spots[(i * 7 + layout.value.index * 3 + 5) % spots.length];
    if (!spot) return;
    spots.splice(spots.indexOf(spot), 1);
    visitors.push(
      walker({
        user,
        look: lookFor(user.id || user.displayName),
        x: spot.x,
        y: spot.y,
        facing: ['se', 'sw', 'ne', 'nw'][i % 4],
        nextMove: performance.now() + 1500 + i * 1700,
      })
    );
  });
}

// The tile someone is on, or about to step onto
const tileOf = (w) => (w.path.length ? w.path[0] : { x: Math.round(w.x), y: Math.round(w.y) });

function walkTo(target, action = null) {
  const here = tileOf(player);
  let goal = target;
  if (!layout.value.isOpen(goal.x, goal.y)) {
    goal = nearestOpen(goal, here, layout.value.isOpen, layout.value.width, layout.value.depth);
    if (!goal) return;
  }
  const route = findPath(here, goal, layout.value.isOpen);
  if (route === null) return;
  player.action = action;

  if (calm.value || route.length === 0) {
    // No walking: appear there, facing the way the last step went
    const last = route.length ? route[route.length - 1] : here;
    const prev = route.length > 1 ? route[route.length - 2] : here;
    player.facing = facingFor(last.x - prev.x, last.y - prev.y, player.facing);
    Object.assign(player, { x: last.x, y: last.y, path: [], walking: false });
    destination.value = null;
    arrive();
    return;
  }
  // Mid-step: finish the step under way, then follow the new route from there
  player.path = player.path.length ? [player.path[0], ...route] : route;
  destination.value = goal;
}

function arrive() {
  destination.value = null;
  const action = player.action;
  player.action = null;
  if (!action) return;
  if (action.type === 'frame') {
    player.facing = action.frame.view.facing;
    say(player, '✨', 1200);
    emit('view', action.frame.artwork);
  } else if (action.type === 'door') {
    player.facing = action.door.facing;
    cameFrom = layout.value.index;
    emit('update:room', action.door.to);
  }
}

// ---------- Moving, once a frame ----------
function advance(w, speed, dt) {
  if (!w.path.length) {
    const was = w.walking;
    w.walking = false;
    return was ? 'stopped' : false;
  }
  const next = w.path[0];
  const dx = next.x - w.x;
  const dy = next.y - w.y;
  const dist = Math.hypot(dx, dy);
  const stride = speed * dt;
  w.facing = facingFor(Math.sign(Math.round(dx * 10)), Math.sign(Math.round(dy * 10)), w.facing);
  if (dist <= stride) {
    w.x = next.x;
    w.y = next.y;
    w.path.shift();
  } else {
    w.x += (dx / dist) * stride;
    w.y += (dy / dist) * stride;
  }
  w.walking = true;
  w.clock += dt;
  if (w.clock > 0.15) {
    w.clock = 0;
    w.step++;
  }
  return true;
}

function wander(v, now) {
  if (calm.value || v.walking || now < v.nextMove) return;
  v.nextMove = now + 3500 + Math.random() * 5000;
  const here = tileOf(v);
  const options = [];
  for (let dx = -3; dx <= 3; dx++) {
    for (let dy = -3; dy <= 3; dy++) {
      const x = here.x + dx;
      const y = here.y + dy;
      if ((dx || dy) && y >= 2 && layout.value.isOpen(x, y)) options.push({ x, y });
    }
  }
  const goal = options[Math.floor(Math.random() * options.length)];
  const route = goal && findPath(here, goal, layout.value.isOpen);
  if (route) v.path = route.slice(0, 5);
  if (Math.random() < 0.3) say(v, CHATTER[Math.floor(Math.random() * CHATTER.length)]);
}

let raf = 0;
let last = 0;
function tick(now) {
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
  last = now;
  if (advance(player, SPEED, dt) === 'stopped') arrive();
  for (const v of visitors) {
    advance(v, VISITOR_SPEED, dt);
    wander(v, now);
  }
  for (const w of [player, ...visitors]) if (w.bubble && now > w.bubbleUntil) w.bubble = '';
  raf = requestAnimationFrame(tick);
}

// ---------- Pointer and keyboard ----------
const hoverTile = ref(null);
const hoverInfo = ref(null);

function toWorld(event) {
  const svg = svgRef.value;
  const matrix = svg?.getScreenCTM();
  if (!matrix) return null;
  const p = svg.createSVGPoint();
  p.x = event.clientX;
  p.y = event.clientY;
  return p.matrixTransform(matrix.inverse());
}

function onPointerMove(event) {
  const p = toWorld(event);
  hoverTile.value = p ? screenToTile(p.x, p.y, layout.value.width, layout.value.depth) : null;
}

function onFloorClick(event) {
  const p = toWorld(event);
  const tile = p && screenToTile(p.x, p.y, layout.value.width, layout.value.depth);
  if (tile) walkTo(tile);
}

// The arrow keys walk across the screen: up goes back into the room, down comes forward
const KEY_STEPS = { ArrowUp: [-1, -1], ArrowDown: [1, 1], ArrowLeft: [-1, 1], ArrowRight: [1, -1] };
function onKeydown(event) {
  if (event.target !== svgRef.value) return;
  const step = KEY_STEPS[event.key];
  if (!step) return;
  event.preventDefault();
  const here = tileOf(player);
  // Try the diagonal first, then each half of it, so walls and benches don't stop you dead
  const tries = [step, [step[0], 0], [0, step[1]]];
  for (const [dx, dy] of tries) {
    const target = { x: here.x + dx, y: here.y + dy };
    if (layout.value.isOpen(target.x, target.y)) {
      walkTo(target);
      return;
    }
  }
}

function onVisitorClick(v) {
  const theirs = layout.value.frames.find((f) => f.artwork.giver?.id && f.artwork.giver.id === v.user.id);
  say(v, theirs ? `I made "${theirs.artwork.submission.title || 'that one'}"!` : `Hi, I'm ${v.user.displayName}!`, 3200);
  v.facing = facingFor(player.x - v.x, player.y - v.y, v.facing);
}

// ---------- What gets drawn, nearest last ----------
const furniture = computed(() =>
  layout.value.furniture.map((piece, i) => {
    const [t] = piece.tiles;
    const span = piece.tiles.length;
    let parts;
    if (piece.kind === 'bench') {
      parts = { seat: boxFaces(t.x, t.y, span, 1, 15, 0.18), back: boxFaces(t.x, t.y, span, 0.32, 30, 0.12) };
    } else if (piece.kind === 'plant') {
      const c = iso(t.x + 0.5, t.y + 0.5);
      parts = { pot: boxFaces(t.x, t.y, 1, 1, 18, 0.3), cx: c.x, cy: c.y };
    } else {
      const c = iso(t.x + 0.5, t.y + 0.5);
      parts = { stand: boxFaces(t.x, t.y, 1, 1, 36, 0.2), cx: c.x, cy: c.y };
    }
    return { key: `f${i}`, kind: piece.kind, depth: depthOf(piece), parts };
  })
);

const people = computed(() => [
  { key: 'me', self: true, w: player, look: myLook.value, name: myName.value },
  ...visitors.map((v, i) => ({ key: `v${i}-${v.user.id}`, self: false, w: v, look: v.look, name: v.user.displayName })),
]);

const sprites = computed(() =>
  [
    ...furniture.value.map((f) => ({ ...f, type: 'furniture' })),
    ...people.value.map((p) => {
      const at = iso(p.w.x + 0.5, p.w.y + 0.5);
      return { ...p, type: 'person', depth: p.w.x + p.w.y + 1, sx: at.x, sy: at.y };
    }),
  ].sort((a, b) => a.depth - b.depth)
);

const hoveredVisitor = ref(null);
const status = computed(() => {
  if (hoverInfo.value?.kind === 'frame') return `#${hoverInfo.value.number}: ${hoverInfo.value.text}`;
  if (hoverInfo.value?.kind === 'door') return `${hoverInfo.value.text}. Click to walk through.`;
  if (hoveredVisitor.value) return `${hoveredVisitor.value}. Click to say hello.`;
  return 'Click the floor to walk about, and click a picture to take a closer look.';
});

function goToRoom(index) {
  cameFrom = layout.value.index;
  emit('update:room', index);
}

watch(
  () => [props.room, props.artworks.length, props.visitors.length],
  () => placeEveryone()
);

onMounted(() => {
  motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') || null;
  onMotionChange();
  motionQuery?.addEventListener?.('change', onMotionChange);
  placeEveryone();
  raf = requestAnimationFrame(tick);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  motionQuery?.removeEventListener?.('change', onMotionChange);
});

defineExpose({ walkTo });
</script>

<template>
  <div class="museum-room">
    <svg
      ref="svgRef"
      :viewBox="view.box"
      class="scene"
      tabindex="0"
      role="application"
      :aria-label="`Museum room ${layout.index + 1} of ${layout.count}`"
      :aria-describedby="`${uid}-help`"
      @pointermove="onPointerMove"
      @pointerleave="hoverTile = null"
      @keydown="onKeydown"
    >
      <rect :x="view.minX" :y="view.minY" :width="view.maxX - view.minX" :height="view.maxY - view.minY" class="void" />
      <MuseumBackdrop
        :room="layout"
        :hover-tile="hoverTile"
        :destination="destination"
        @frame="(f) => walkTo(f.view, { type: 'frame', frame: f })"
        @door="(d) => walkTo(d.tile, { type: 'door', door: d })"
        @hover="hoverInfo = $event"
        @click="onFloorClick"
      />

      <template v-for="s in sprites" :key="s.key">
        <g v-if="s.type === 'furniture'" class="furniture" aria-hidden="true" @click="onFloorClick">
          <template v-if="s.kind === 'bench'">
            <polygon :points="s.parts.back.left" fill="#7d4f33" />
            <polygon :points="s.parts.back.right" fill="#6a412a" />
            <polygon :points="s.parts.back.top" fill="#a46d48" />
            <polygon :points="s.parts.seat.left" fill="#8a5a3b" />
            <polygon :points="s.parts.seat.right" fill="#724830" />
            <polygon :points="s.parts.seat.top" fill="#b77d55" />
          </template>
          <template v-else-if="s.kind === 'plant'">
            <polygon :points="s.parts.pot.left" fill="#c4643f" />
            <polygon :points="s.parts.pot.right" fill="#a9512f" />
            <polygon :points="s.parts.pot.top" fill="#5a3a26" />
            <ellipse :cx="s.parts.cx - 9" :cy="s.parts.cy - 34" rx="9" ry="14" fill="#3f9b5f" />
            <ellipse :cx="s.parts.cx + 9" :cy="s.parts.cy - 32" rx="9" ry="13" fill="#4fb36f" />
            <ellipse :cx="s.parts.cx" :cy="s.parts.cy - 46" rx="9" ry="15" fill="#5cc27c" />
          </template>
          <template v-else>
            <polygon :points="s.parts.stand.left" fill="#e9e3ea" />
            <polygon :points="s.parts.stand.right" fill="#d4ccd6" />
            <polygon :points="s.parts.stand.top" fill="#fbf8fc" />
            <circle :cx="s.parts.cx" :cy="s.parts.cy - 52" r="11" fill="#ec6a93" />
            <circle :cx="s.parts.cx + 7" :cy="s.parts.cy - 62" r="6" fill="#f6a5c0" />
            <rect :x="s.parts.cx - 3" :y="s.parts.cy - 44" width="6" height="8" fill="#c94f78" />
          </template>
        </g>
        <g
          v-else
          :class="{ visitor: !s.self }"
          @click.stop="!s.self && onVisitorClick(s.w)"
          @pointerenter="!s.self && (hoveredVisitor = s.name)"
          @pointerleave="hoveredVisitor = null"
        >
          <PixelAvatar
            :x="s.sx"
            :y="s.sy"
            :facing="s.w.facing"
            :walking="s.w.walking"
            :step="s.w.step"
            :look="s.look"
            :name="s.name"
            :show-name="s.self || hoveredVisitor === s.name"
            :bubble="s.w.bubble"
            :self="s.self"
          />
        </g>
      </template>
    </svg>

    <div class="hud">
      <p :id="`${uid}-help`" class="status" aria-live="polite">
        <MousePointerClick :size="16" aria-hidden="true" /> {{ status }}
        <span class="sr-only">Use the arrow keys to walk, or Tab to the pictures and press Enter to look.</span>
      </p>
      <div v-if="layout.count > 1" class="rooms">
        <button type="button" class="btn btn-ghost btn-xs" :disabled="layout.index === 0" @click="goToRoom(layout.index - 1)">
          <ArrowLeft :size="14" aria-hidden="true" /> Previous room
        </button>
        <span class="room-count">Room {{ layout.index + 1 }} of {{ layout.count }}</span>
        <button
          type="button"
          class="btn btn-ghost btn-xs"
          :disabled="layout.index >= layout.count - 1"
          @click="goToRoom(layout.index + 1)"
        >
          Next room <ArrowRight :size="14" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.museum-room {
  display: flex;
  flex-direction: column;
  border-radius: 18px;
  overflow: hidden;
  background: #232838;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
}
.scene {
  display: block;
  width: 100%;
  height: auto;
  max-height: 72vh;
  touch-action: manipulation;
  user-select: none;
  cursor: pointer;
}
.scene:focus {
  outline: none;
}
.scene:focus-visible {
  box-shadow: inset 0 0 0 3px #ec6a93;
}
.void {
  fill: #232838;
}
.visitor {
  cursor: pointer;
}
.hud {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 14px;
  padding: 10px 14px;
  background: rgba(0, 0, 0, 0.35);
  color: #f3eaf0;
}
.status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  min-width: 0;
  font-size: 0.88rem;
  overflow-wrap: anywhere;
}
.rooms {
  display: flex;
  align-items: center;
  gap: 6px;
}
.rooms .btn {
  color: #f3eaf0;
}
.rooms .btn:disabled {
  opacity: 0.4;
}
.room-count {
  font-size: 0.82rem;
  font-weight: 700;
  white-space: nowrap;
}
</style>
