<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, useId } from 'vue';
import { ArrowLeft, ArrowRight, MousePointerClick } from 'lucide-vue-next';
import MuseumBackdrop from './MuseumBackdrop.vue';
import PixelAvatar from './PixelAvatar.vue';
import ChatBubbles from './ChatBubbles.vue';
import MuseumToolbar from './MuseumToolbar.vue';
import PersonCard from './PersonCard.vue';
import PixelHead from './PixelHead.vue';
import FriendsPanel from '@/components/social/FriendsPanel.vue';
import { isMockMode } from '@/api';
import { iso, screenToTile, facingFor, WALL_H } from '@/museum/iso';
import { findPath, nearestOpen } from '@/museum/pathfinding';
import { buildRoom, arrivalTile } from '@/museum/layout';
import { boxFaces, depthOf } from '@/museum/furniture';
import { lookFor, CHATTER } from '@/museum/looks';
import { useRoomSync } from '@/museum/sync';
import { formatTime } from '@/utils/format';

// One room of the museum, drawn isometrically. Click (or tap) the floor to walk there; click a
// picture to walk up to it and look (emits `view`); click a bench or chair to sit down. The arrow
// keys walk too, and the pictures and doors are buttons you can Tab to.
//
// With `place` ({ kind, eventId }) the room is shared: you see everyone else who's in it, where
// they stand and what they say, and you can chat (museum/sync.js). Without it (or in the demo)
// the event's artists wander about instead. With reduced motion, people move without walking.
const props = defineProps({
  artworks: { type: Array, required: true }, // gallery items: { submission, giver, recipient, event? }
  room: { type: Number, default: 0 }, // v-model:room
  me: { type: Object, default: null }, // the signed-in user, or null for a guest
  visitors: { type: Array, default: () => [] }, // artists who wander about when the room isn't shared
  place: { type: Object, default: null }, // { kind: 'wing' | 'gallery', eventId }
});
const emit = defineEmits(['view', 'update:room']);

const uid = useId();
const svgRef = ref(null);
const toolbarRef = ref(null);
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
const OTHERS_SPEED = 3.2;
const NPC_SPEED = 1.7;
const EMOTE_MS = 2800;

function walker(extra) {
  return reactive({
    x: 0,
    y: 0,
    path: [],
    facing: 'nw',
    walking: false,
    sitting: false,
    emote: '',
    emoteUntil: 0,
    step: 0,
    clock: 0,
    bubble: '',
    bubbleUntil: 0,
    ...extra,
  });
}
const player = walker({ action: null });
const visitors = reactive([]); // wandering artists (not shared)
const others = reactive([]); // real people in a shared room
const destination = ref(null);
let cameFrom = null; // the room we just left, so we arrive by its door

const shared = computed(() => Boolean(props.place));
const showWanderers = computed(() => !shared.value || isMockMode);
const myName = computed(() => props.me?.displayName || 'You');
const myLook = computed(() => lookFor(props.me?.id || 'guest'));

function say(who, text, ms = 2600) {
  who.bubble = text;
  who.bubbleUntil = performance.now() + ms;
}

// The tile someone is on, or about to step onto; and where they're heading
const tileOf = (w) => (w.path.length ? w.path[0] : { x: Math.round(w.x), y: Math.round(w.y) });
const goalOf = (w) => (w.path.length ? w.path[w.path.length - 1] : { x: Math.round(w.x), y: Math.round(w.y) });
const seatAt = (x, y) => layout.value.seats.find((s) => s.x === x && s.y === y) || null;

function placeEveryone() {
  const start = arrivalTile(layout.value, cameFrom);
  Object.assign(player, {
    x: start.x,
    y: start.y,
    path: [],
    walking: false,
    sitting: false,
    action: null,
    facing: cameFrom === null ? 'nw' : 'se',
  });
  destination.value = null;
  cameFrom = null;
  others.splice(0);
  bubbles.value = [];

  // Up to four of the artists wander about, starting on free tiles spread round the room
  visitors.splice(0);
  if (!showWanderers.value) return;
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
  player.sitting = false;

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
  sync?.now();
}

// Which way is "in front" of a seat (the way you face when sitting in it)
const FRONT = { sw: [0, 1], se: [1, 0], ne: [0, -1], nw: [-1, 0] };
function seatTaken(seat) {
  return [...others, ...visitors].some((w) => w.sitting && Math.round(w.x) === seat.x && Math.round(w.y) === seat.y);
}
function goSit(seat) {
  if (seatTaken(seat)) {
    say(player, "Someone's sitting there");
    return;
  }
  if (player.sitting && Math.round(player.x) === seat.x && Math.round(player.y) === seat.y) return;
  const [fx, fy] = FRONT[seat.facing];
  const here = tileOf(player);
  const around = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const t = { x: seat.x + dx, y: seat.y + dy };
      if ((dx || dy) && layout.value.isOpen(t.x, t.y)) {
        const front = dx === fx && dy === fy ? -10 : 0;
        around.push({ ...t, score: front + Math.hypot(t.x - here.x, t.y - here.y) });
      }
    }
  }
  around.sort((a, b) => a.score - b.score);
  const spot = around.find((t) => findPath(here, t, layout.value.isOpen) !== null);
  if (spot) walkTo(spot, { type: 'seat', seat });
}

function sitDown(seat) {
  Object.assign(player, { x: seat.x, y: seat.y, path: [], walking: false, sitting: true, facing: seat.facing });
  sync?.now();
}

function arrive() {
  destination.value = null;
  const action = player.action;
  player.action = null;
  if (!action) {
    sync?.now();
    return;
  }
  if (action.type === 'frame') {
    player.facing = action.frame.view.facing;
    say(player, '✨', 1200);
    emit('view', action.frame.artwork);
    sync?.now();
  } else if (action.type === 'door') {
    player.facing = action.door.facing;
    cameFrom = layout.value.index;
    emit('update:room', action.door.to);
  } else if (action.type === 'seat') {
    if (seatTaken(action.seat)) say(player, "Someone's sitting there");
    else sitDown(action.seat);
  }
}

function onCommand(command) {
  if (command === 'sit') {
    const seat = seatAt(Math.round(player.x), Math.round(player.y));
    Object.assign(player, { path: [], walking: false, sitting: true, facing: seat ? seat.facing : player.facing });
  } else {
    player.sitting = false;
  }
  sync?.now();
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
  for (const o of others) {
    if (advance(o, OTHERS_SPEED, dt) === 'stopped') {
      o.sitting = o.pendingSit;
      o.facing = o.pendingFacing || o.facing;
    }
  }
  for (const v of visitors) {
    advance(v, NPC_SPEED, dt);
    wander(v, now);
  }
  for (const w of [player, ...others, ...visitors]) {
    if (w.bubble && now > w.bubbleUntil) w.bubble = '';
    if (w.emote && now > w.emoteUntil) w.emote = '';
  }
  // Chat bubbles drift up a row now and then, like a lift going up
  if (bubbles.value.length && now - lastShift > BUBBLE_DRIFT_MS) shiftBubbles(now);
  raf = requestAnimationFrame(tick);
}

// ---------- Sharing the room: other people and chat ----------
function applyPeople(list) {
  const here = new Set();
  for (const p of list) {
    here.add(p.user.id);
    let o = others.find((w) => w.user.id === p.user.id);
    if (!o) {
      others.push(
        walker({ user: p.user, look: lookFor(p.user.id), x: p.x, y: p.y, facing: p.facing, sitting: p.sitting, target: { x: p.x, y: p.y } })
      );
      continue;
    }
    o.user = p.user;
    if (o.target.x !== p.x || o.target.y !== p.y) {
      o.target = { x: p.x, y: p.y };
      o.sitting = false;
      o.pendingSit = p.sitting;
      o.pendingFacing = p.facing;
      // They might be heading for a seat, which is otherwise off limits
      const open = (x, y) => layout.value.isOpen(x, y) || (x === p.x && y === p.y);
      const route = calm.value ? null : findPath(tileOf(o), o.target, open);
      if (route && route.length) o.path = route;
      else Object.assign(o, { x: p.x, y: p.y, path: [], sitting: p.sitting, facing: p.facing });
    } else if (!o.path.length) {
      o.sitting = p.sitting;
      o.facing = p.facing;
    }
  }
  for (let i = others.length - 1; i >= 0; i--) if (!here.has(others[i].user.id)) others.splice(i, 1);
}

const log = ref([]);
const unread = ref(0);
const seen = new Set();
const NEW_ENOUGH_MS = 10 * 1000; // older history goes in the log without popping up

function screenLeft(w) {
  if (!w) return 50;
  const p = iso(w.x + 0.5, w.y + 0.5);
  const pct = ((p.x - view.value.minX) / (view.value.maxX - view.value.minX)) * 100;
  return Math.min(88, Math.max(12, pct));
}

function onMessages(list) {
  for (const m of list) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    log.value = [...log.value, m].slice(-100);
    const mine = m.user.id && m.user.id === props.me?.id;
    if (!mine && panel.value !== 'log') unread.value++;
    if (Date.now() - new Date(m.createdAt).getTime() > NEW_ENOUGH_MS) continue;
    const speaker = mine ? player : others.find((o) => o.user.id === m.user.id);
    addBubble({ user: m.user, name: m.user.displayName, kind: m.kind, text: m.text, left: screenLeft(speaker) });
    if (m.kind === 'emote' && m.emote && speaker) {
      speaker.emote = m.emote;
      speaker.emoteUntil = performance.now() + EMOTE_MS;
    }
  }
}

// ---------- Chat bubbles ----------
const bubbles = ref([]);
const BUBBLE_DRIFT_MS = 4500;
const MAX_ROWS = 7;
let lastShift = 0;
let bubbleId = 0;
function shiftBubbles(now = performance.now()) {
  bubbles.value = bubbles.value.map((b) => ({ ...b, row: b.row + 1 })).filter((b) => b.row <= MAX_ROWS);
  lastShift = now;
}
function addBubble(b) {
  shiftBubbles();
  bubbles.value = [...bubbles.value, { id: ++bubbleId, row: 0, ...b }];
}

// In the demo nobody else is really here, so a wandering artist answers now and then
function demoReply() {
  if (!isMockMode || !visitors.length || Math.random() < 0.4) return;
  const v = visitors[Math.floor(Math.random() * visitors.length)];
  setTimeout(() => {
    addBubble({ user: v.user, name: v.user.displayName, kind: 'say', text: CHATTER[Math.floor(Math.random() * CHATTER.length)], left: screenLeft(v) });
  }, 1200 + Math.random() * 1500);
}

const sync = props.place
  ? useRoomSync({
      place: () => (props.place ? { ...props.place, room: layout.value.index } : null),
      signedIn: () => Boolean(props.me),
      spot: () => ({ ...goalOf(player), facing: player.facing, sitting: player.sitting }),
      onPeople: applyPeople,
      onMessages,
    })
  : null;

async function send(text) {
  if (!sync) throw new Error('Chat is only open in shared rooms.');
  const message = await sync.say(text);
  demoReply();
  return message;
}

// ---------- Panels: your card, someone else's card, friends, the chat log ----------
const panel = ref(''); // me | friends | log
const picked = ref(null); // someone clicked in the room: { user }
function toggle(name) {
  panel.value = panel.value === name ? '' : name;
  picked.value = null;
  if (panel.value === 'log') unread.value = 0;
}
function pickPerson(w) {
  panel.value = '';
  picked.value = { user: w.user };
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

function onFurnitureClick(piece, event) {
  if (!piece.facing) {
    onFloorClick(event);
    return;
  }
  // A bench has a seat on each tile: take the one nearest the click
  const p = toWorld(event);
  const seats = layout.value.seats.filter((s) => piece.tiles.some((t) => t.x === s.x && t.y === s.y));
  const nearest = (s) => {
    const c = iso(s.x + 0.5, s.y + 0.5);
    return p ? Math.hypot(c.x - p.x, c.y - 12 - p.y) : 0;
  };
  goSit([...seats].sort((a, b) => nearest(a) - nearest(b))[0]);
}

// The arrow keys walk across the screen: up goes back into the room, down comes forward
const KEY_STEPS = { ArrowUp: [-1, -1], ArrowDown: [1, 1], ArrowLeft: [-1, 1], ArrowRight: [1, -1] };
function onKeydown(event) {
  if (event.target !== svgRef.value) return;
  if (event.key === 'Enter' && props.me && shared.value) {
    event.preventDefault();
    toolbarRef.value?.focus();
    return;
  }
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
    } else if (piece.kind === 'chair') {
      const back = piece.facing === 'se' ? boxFaces(t.x, t.y, 0.34, 1, 32, 0.16) : boxFaces(t.x, t.y, 1, 0.34, 32, 0.16);
      parts = { seat: boxFaces(t.x, t.y, 1, 1, 14, 0.2), back };
    } else if (piece.kind === 'plant') {
      const c = iso(t.x + 0.5, t.y + 0.5);
      parts = { pot: boxFaces(t.x, t.y, 1, 1, 18, 0.3), cx: c.x, cy: c.y };
    } else {
      const c = iso(t.x + 0.5, t.y + 0.5);
      parts = { stand: boxFaces(t.x, t.y, 1, 1, 36, 0.2), cx: c.x, cy: c.y };
    }
    return { key: `f${i}`, kind: piece.kind, piece, depth: depthOf(piece), parts };
  })
);

const people = computed(() => [
  { key: 'me', self: true, w: player, look: myLook.value, name: myName.value },
  ...others.map((o) => ({ key: `o-${o.user.id}`, self: false, real: true, w: o, look: o.look, name: o.user.displayName })),
  ...visitors.map((v, i) => ({ key: `v${i}-${v.user.id}`, self: false, w: v, look: v.look, name: v.user.displayName })),
]);

const hoveredName = ref(null);
const sprites = computed(() =>
  [
    ...furniture.value.map((f) => ({ ...f, type: 'furniture' })),
    ...people.value.map((p) => {
      const at = iso(p.w.x + 0.5, p.w.y + 0.5);
      // On a bench or chair they sit at seat height, in front of it
      const onSeat = p.w.sitting && !p.w.walking && seatAt(Math.round(p.w.x), Math.round(p.w.y));
      return {
        ...p,
        type: 'person',
        depth: p.w.x + p.w.y + 1 + (onSeat ? 0.6 : 0),
        sx: at.x,
        sy: at.y - (onSeat ? 12 : 0),
      };
    }),
  ].sort((a, b) => a.depth - b.depth)
);

const status = computed(() => {
  if (hoverInfo.value?.kind === 'frame') return `#${hoverInfo.value.number}: ${hoverInfo.value.text}`;
  if (hoverInfo.value?.kind === 'door') return `${hoverInfo.value.text}. Click to walk through.`;
  if (hoveredName.value) return `${hoveredName.value}. Click to see their card.`;
  return 'Click the floor to walk, a picture to look closer, or a bench to sit down.';
});
const peopleHere = computed(() => others.length);

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
    <div class="stage">
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
          <g
            v-if="s.type === 'furniture'"
            class="furniture"
            :class="{ seat: s.piece.facing }"
            aria-hidden="true"
            @click.stop="onFurnitureClick(s.piece, $event)"
          >
            <template v-if="s.kind === 'bench'">
              <polygon :points="s.parts.back.left" fill="#7d4f33" />
              <polygon :points="s.parts.back.right" fill="#6a412a" />
              <polygon :points="s.parts.back.top" fill="#a46d48" />
              <polygon :points="s.parts.seat.left" fill="#8a5a3b" />
              <polygon :points="s.parts.seat.right" fill="#724830" />
              <polygon :points="s.parts.seat.top" fill="#b77d55" />
            </template>
            <template v-else-if="s.kind === 'chair'">
              <polygon :points="s.parts.back.left" fill="#b84f72" />
              <polygon :points="s.parts.back.right" fill="#9c3f5f" />
              <polygon :points="s.parts.back.top" fill="#e07b9e" />
              <polygon :points="s.parts.seat.left" fill="#c75b7f" />
              <polygon :points="s.parts.seat.right" fill="#a94a6b" />
              <polygon :points="s.parts.seat.top" fill="#ec8fb0" />
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
            class="person"
            @click.stop="s.self ? toggle('me') : s.real ? pickPerson(s.w) : onVisitorClick(s.w)"
            @pointerenter="hoveredName = s.self ? null : s.name"
            @pointerleave="hoveredName = null"
          >
            <PixelAvatar
              :x="s.sx"
              :y="s.sy"
              :facing="s.w.facing"
              :walking="s.w.walking"
              :sitting="s.w.sitting && !s.w.walking"
              :emote="s.w.emote"
              :step="s.w.step"
              :look="s.look"
              :name="s.name"
              :show-name="s.self || hoveredName === s.name"
              :bubble="s.w.bubble"
              :self="s.self"
            />
          </g>
        </template>
      </svg>

      <ChatBubbles :bubbles="bubbles" :max-rows="MAX_ROWS" />

      <!-- Panels over the room -->
      <div v-if="panel === 'friends' && me" class="panel left card">
        <FriendsPanel compact />
      </div>
      <div v-if="panel === 'log'" class="panel left card log-panel">
        <h2 class="log-title">Chat in this room</h2>
        <ol v-if="log.length" class="log" role="log" aria-label="Chat in this room">
          <li v-for="m in log" :key="m.id" class="log-line" :class="m.kind">
            <PixelHead :user="m.user" :size="20" />
            <span class="min-w-0">
              <time :datetime="m.createdAt">{{ formatTime(m.createdAt) }}</time>
              <template v-if="m.kind === 'emote'"> <em>{{ m.user.displayName }} {{ m.text }}</em></template>
              <template v-else> <strong>{{ m.user.displayName }}:</strong> {{ m.text }}</template>
            </span>
          </li>
        </ol>
        <p v-else class="hint m-0">Nothing said in the last couple of minutes. Say hello!</p>
      </div>
      <div v-if="panel === 'me' && me" class="panel right">
        <PersonCard :user="me" self :sitting="player.sitting" @close="panel = ''" @sit="onCommand(player.sitting ? 'stand' : 'sit')" />
      </div>
      <div v-if="picked" class="panel right">
        <PersonCard :user="picked.user" @close="picked = null" />
      </div>
    </div>

    <div class="hud">
      <p :id="`${uid}-help`" class="status" aria-live="polite">
        <MousePointerClick :size="16" aria-hidden="true" /> {{ status }}
        <span class="sr-only">
          Use the arrow keys to walk, or Tab to the pictures and press Enter to look.
          <template v-if="me && shared">Press Enter in the room to chat.</template>
        </span>
      </p>
      <div class="hud-right">
        <span v-if="shared" class="here">{{ peopleHere ? `${peopleHere + (me ? 1 : 0)} here` : 'Just you here' }}</span>
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

    <MuseumToolbar
      v-if="shared"
      ref="toolbarRef"
      :me="me"
      :send="send"
      :muted-until="sync?.mutedUntil.value || me?.chatMutedUntil || null"
      :open="panel"
      :log-count="unread"
      @toggle="toggle"
      @command="onCommand"
    />
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
.stage {
  position: relative;
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
.person,
.furniture.seat {
  cursor: pointer;
}
.panel {
  position: absolute;
  bottom: 10px;
  z-index: 3;
  max-height: calc(100% - 20px);
  overflow: auto;
}
.panel.left {
  left: 10px;
  width: min(340px, calc(100% - 20px));
  padding: 14px;
}
.panel.right {
  right: 10px;
}
.log-title {
  margin: 0 0 8px;
  font-family: var(--font-body);
  font-size: 1rem;
  font-weight: 700;
}
.log {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 260px;
  overflow-y: auto;
  font-size: 0.86rem;
}
.log-line {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  overflow-wrap: anywhere;
}
.log-line time {
  margin-right: 6px;
  color: var(--muted);
  font-size: 0.75rem;
}
.log-line.shout {
  font-weight: 800;
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
.hud-right {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.here {
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(62, 207, 110, 0.18);
  color: #9ff0b8;
  font-size: 0.8rem;
  font-weight: 700;
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
