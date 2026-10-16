<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount, useId } from 'vue';
import { ArrowLeft, ArrowRight, MousePointerClick, Lightbulb, LightbulbOff } from 'lucide-vue-next';
import MuseumBackdrop from './MuseumBackdrop.vue';
import MuseumFurniture from './MuseumFurniture.vue';
import MuseumLights from './MuseumLights.vue';
import PixelAvatar from './PixelAvatar.vue';
import PixelCat from './PixelCat.vue';
import ChatBubbles from './ChatBubbles.vue';
import MuseumToolbar from './MuseumToolbar.vue';
import PersonCard from './PersonCard.vue';
import PixelHead from './PixelHead.vue';
import GuestbookPanel from './GuestbookPanel.vue';
import FriendsPanel from '@/components/social/FriendsPanel.vue';
import { api, isMockMode } from '@/api';
import { iso, screenToTile, facingFor, WALL_H } from '@/museum/iso';
import { findPath, nearestOpen } from '@/museum/pathfinding';
import { buildRoom, arrivalTile, CAT_BED } from '@/museum/layout';
import { sliceFurniture, tileDepth } from '@/museum/furniture';
import { roomLights, brightnessAt } from '@/museum/lights';
import { roomCats, catPlan, petReaction, MOODS, CAT_SLOT_MS } from '@/museum/cats';
import { lookFor, CHATTER } from '@/museum/looks';
import { useRoomSync } from '@/museum/sync';
import { formatTime } from '@/utils/format';
import { EMOTES, PET_EMOTE } from '@shared/chat.mjs';
import { themeFor } from '@shared/museum-themes.mjs';

// One room of the museum, drawn isometrically. Click (or tap) the floor to walk there; click a
// picture to walk up to it and look (emits `view`); click a bench to sit down, a cat to pet it,
// or the stand by the entrance to read the guestbook. The arrow keys walk too, and the pictures
// and doors are buttons you can Tab to.
//
// With `place` ({ kind, eventId }) the room is shared: you see everyone else who's in it, where
// they stand and what they say, and you can chat (museum/sync.js). Without it (or in the demo)
// the event's artists wander about instead. With reduced motion, people move without walking.
//
// `theme` is the event's room design (shared/museum-themes.mjs); 'auto' changes it room by room.
const props = defineProps({
  artworks: { type: Array, required: true }, // gallery items: { submission, giver, recipient, event? }
  room: { type: Number, default: 0 }, // v-model:room
  me: { type: Object, default: null }, // the signed-in user, or null for a guest
  visitors: { type: Array, default: () => [] }, // artists who wander about when the room isn't shared
  place: { type: Object, default: null }, // { kind: 'wing' | 'gallery', eventId }
  theme: { type: String, default: 'auto' },
});
const emit = defineEmits(['view', 'update:room']);

const uid = useId();
const svgRef = ref(null);
const toolbarRef = ref(null);
const layout = computed(() => buildRoom(props.artworks, props.room));

const calm = ref(false);
let motionQuery = null;
const onMotionChange = () => (calm.value = Boolean(motionQuery?.matches));

// ---------- The room's design and light ----------
const roomTheme = computed(() => themeFor(props.theme, layout.value.index));
// Darker designs can be lit up for anyone who finds them hard to see (remembered here only)
const LIGHTS_KEY = 'drawsicle:museum:lights';
function savedLights() {
  try {
    return localStorage.getItem(LIGHTS_KEY) === 'on';
  } catch {
    return false;
  }
}
const lightsOn = ref(savedLights());
watch(lightsOn, (on) => {
  try {
    localStorage.setItem(LIGHTS_KEY, on ? 'on' : 'off');
  } catch {
    // Not remembered; nothing else changes
  }
});
const designLights = computed(() => roomLights(layout.value, roomTheme.value));
const lights = computed(() => (lightsOn.value ? roomLights(layout.value, roomTheme.value, { lightsOn: true }) : designLights.value));
const canDim = computed(() => designLights.value.mode.dark > 0);
const litAt = (x, y) => brightnessAt(lights.value, x, y);

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
const CAT_SPEED = 1.5;
const EMOTE_MS = 2800;
const DANCE_MS = 10 * 1000; // a dance stops on its own after this (or when you walk, sit or /stop)

function walker(extra) {
  return reactive({
    x: 0,
    y: 0,
    path: [],
    facing: 'nw',
    walking: false,
    sitting: false,
    dancing: false,
    danceUntil: 0,
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
const myLook = computed(() => lookFor(props.me || 'guest'));

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
  placeCats();

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
        look: lookFor(user),
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
  player.dancing = false;

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

// Walk to a free tile next to `target` (the nearest one you can reach, or the one in front of
// it when `front` says which way that is), then do `action`
function approach(target, action, front = null) {
  const here = tileOf(player);
  const around = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const t = { x: target.x + dx, y: target.y + dy };
      if ((dx || dy) && layout.value.isOpen(t.x, t.y)) {
        const ahead = front && dx === front[0] && dy === front[1] ? -10 : 0;
        around.push({ ...t, score: ahead + Math.hypot(t.x - here.x, t.y - here.y) });
      }
    }
  }
  around.sort((a, b) => a.score - b.score);
  const spot = around.find((t) => findPath(here, t, layout.value.isOpen) !== null);
  if (spot) walkTo(spot, action);
  return Boolean(spot);
}

// Which way is "in front" of a seat (the way you face when sitting in it)
const FRONT = { sw: [0, 1], se: [1, 0], ne: [0, -1], nw: [-1, 0] };
function seatTaken(seat) {
  return [...others, ...visitors].some((w) => w.sitting && Math.round(w.x) === seat.x && Math.round(w.y) === seat.y);
}
function goSit(seat) {
  if (!seat) return;
  if (seatTaken(seat)) {
    say(player, "Someone's sitting there");
    return;
  }
  if (player.sitting && Math.round(player.x) === seat.x && Math.round(player.y) === seat.y) return;
  approach(seat, { type: 'seat', seat }, FRONT[seat.facing]);
}

function sitDown(seat) {
  Object.assign(player, { x: seat.x, y: seat.y, path: [], walking: false, sitting: true, dancing: false, facing: seat.facing });
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
  } else if (action.type === 'cat') {
    petCat(action.cat);
  } else if (action.type === 'guestbook') {
    player.facing = facingFor(action.stand.x - player.x, action.stand.y - player.y, player.facing);
    openPanel('guestbook');
    sync?.now();
  }
}

function onCommand(command) {
  if (command === 'sit') {
    const seat = seatAt(Math.round(player.x), Math.round(player.y));
    Object.assign(player, { path: [], walking: false, sitting: true, dancing: false, facing: seat ? seat.facing : player.facing });
  } else if (command === 'stop') {
    Object.assign(player, { dancing: false, danceUntil: 0, emote: '', emoteUntil: 0 });
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
  if (Math.random() < 0.15) {
    // Now and then someone stops to dance for a bit instead
    v.dancing = true;
    v.danceUntil = now + 4000 + Math.random() * 4000;
    return;
  }
  if (route) v.path = route.slice(0, 5);
  if (Math.random() < 0.3) say(v, CHATTER[Math.floor(Math.random() * CHATTER.length)]);
}

// ---------- The cats ----------
const cats = reactive([]);
let catTiles = [];
const catPlace = () => (props.place ? `${props.place.kind}:${props.place.eventId}` : 'museum');
const catSlot = () => Math.floor(Date.now() / CAT_SLOT_MS);
const catStats = ref({}); // key -> { pets, lastPetBy }
const hoveredCat = ref(null);

function placeCats() {
  cats.splice(0);
  const found = roomCats(layout.value);
  catTiles = found.tiles;
  const slot = catSlot();
  found.cats.forEach((cat, i) => {
    const plan = catPlan(catPlace(), cat, slot, catTiles);
    cats.push(
      walker({
        cat,
        x: plan.target.x,
        y: plan.target.y,
        facing: ['sw', 'se'][i % 2],
        slot,
        plan,
        state: plan.activity,
        mood: plan.mood,
        moodUntil: 0,
        holdUntil: 0,
        pets: [],
        petted: false,
        petUntil: 0,
        // Mood bubbles now and then, each cat at its own pace
        nextChat: performance.now() + 2500 + i * 3500,
      })
    );
  });
}

function moveCat(c, now) {
  const slot = catSlot();
  if (slot === c.slot || now < c.holdUntil) return;
  c.slot = slot;
  c.plan = catPlan(catPlace(), c.cat, slot, catTiles);
  if (now > c.moodUntil) c.mood = c.plan.mood;
  const here = tileOf(c);
  const route = findPath(here, c.plan.target, layout.value.isOpenForCats);
  if (!route || !route.length) return;
  if (calm.value) Object.assign(c, { x: c.plan.target.x, y: c.plan.target.y, path: [] });
  else c.path = route;
}

function updateCat(c, now, dt) {
  advance(c, CAT_SPEED, dt);
  moveCat(c, now);
  if (c.petted && now > c.petUntil) c.petted = false;
  c.state = c.walking ? 'walk' : c.petted ? 'sit' : c.plan.activity;
  if (now > c.nextChat && !c.walking) {
    c.nextChat = now + 9000 + Math.random() * 8000;
    say(c, MOODS[c.mood]?.emoji || '😺', 2600);
  }
}

// Someone (`by`, a walker) pets a cat: it shows how it feels about that, and runs off if it's
// had too much fuss for now
function catReacts(c, by) {
  const now = performance.now();
  c.pets = [...c.pets.filter((t) => now - t < 60 * 1000), now];
  const reaction = petReaction(c.pets.slice(0, -1), now);
  c.mood = reaction.mood;
  c.moodUntil = now + 20 * 1000;
  c.nextChat = now + 6000;
  if (by) {
    by.facing = facingFor(c.x - by.x, c.y - by.y, by.facing);
    by.emote = PET_EMOTE;
    by.emoteUntil = now + EMOTE_MS;
    by.dancing = false;
  }
  if (reaction.mood === 'grumpy') {
    say(c, `${reaction.bubble} ${reaction.say}`, 2400);
    c.holdUntil = 0;
    c.slot = -1; // off somewhere else straight away
    return;
  }
  say(c, `${reaction.bubble} ${reaction.say}`, 2600);
  Object.assign(c, { path: [], petted: true, petUntil: now + EMOTE_MS, holdUntil: now + 5000 });
  if (by) c.facing = facingFor(by.x - c.x, by.y - c.y, c.facing);
}

const nextTo = (a, b) => Math.abs(Math.round(a.x) - Math.round(b.x)) <= 1 && Math.abs(Math.round(a.y) - Math.round(b.y)) <= 1;

function goPet(c) {
  if (nextTo(player, c) && !player.path.length) petCat(c);
  else approach(tileOf(c), { type: 'cat', cat: c });
}

// In a shared room the pet goes through chat, so everyone sees it (and it's counted); the
// reaction plays when the message comes back. Elsewhere, or if chat says no, it just happens here.
function petCat(c) {
  player.sitting = false;
  if (shared.value && props.me) {
    send(`/${PET_EMOTE} ${c.cat.key}`).catch(() => catReacts(c, player));
  } else {
    catReacts(c, player);
  }
}

async function loadCatStats() {
  try {
    const { cats: list } = await api('/museum/rooms/cats');
    catStats.value = Object.fromEntries(list.map((c) => [c.key, c]));
  } catch {
    // The counts are a nicety; the cats carry on without them
  }
}
const petCount = (c) => catStats.value[c.cat.key]?.pets || 0;

// ---------- The loop ----------
let raf = 0;
let last = 0;
let onScreen = true;
let observer = null;
function step(now) {
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
  for (const c of cats) updateCat(c, now, dt);
  for (const w of [player, ...others, ...visitors, ...cats]) {
    if (w.bubble && now > w.bubbleUntil) w.bubble = '';
    if (w.emote && now > w.emoteUntil) w.emote = '';
    if (w.dancing && !w.walking) {
      w.clock += dt;
      if (w.clock > 0.22) {
        w.clock = 0;
        w.step++;
      }
    }
    if (w.danceUntil && now > w.danceUntil) {
      w.dancing = false;
      w.danceUntil = 0;
      if (w === player) sync?.now();
    }
  }
  // Chat bubbles drift up a row now and then, like a lift going up
  if (bubbles.value.length && now - lastShift > BUBBLE_DRIFT_MS) shiftBubbles(now);
}
function tick(now) {
  if (!onScreen) {
    raf = 0;
    last = 0;
    return;
  }
  try {
    step(now);
  } catch (e) {
    // One bad frame mustn't freeze the room (people mid-walk, emotes that never end)
    console.error(e);
  }
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
        walker({
          user: p.user,
          look: lookFor(p.user),
          x: p.x,
          y: p.y,
          facing: p.facing,
          sitting: p.sitting,
          dancing: Boolean(p.dancing),
          target: { x: p.x, y: p.y },
        })
      );
      continue;
    }
    o.user = p.user;
    o.look = lookFor(p.user);
    o.dancing = Boolean(p.dancing);
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
  return Math.min(98, Math.max(2, pct));
}

// history: the room's recent chat, fetched on walking in. It goes in the log (and very recent
// lines pop up), but its emotes don't play again: they happened before you got here.
function onMessages(list, { history = false } = {}) {
  for (const m of list) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    log.value = [...log.value, m].slice(-100);
    const mine = m.user.id && m.user.id === props.me?.id;
    if (!mine && panel.value !== 'log') unread.value++;
    if (Date.now() - new Date(m.createdAt).getTime() > NEW_ENOUGH_MS) continue;
    const speaker = mine ? player : others.find((o) => o.user.id === m.user.id);
    addBubble({ user: m.user, name: m.user.displayName, kind: m.kind, text: m.text, left: screenLeft(speaker) });
    if (history || m.kind !== 'emote' || !m.emote) continue;
    if (m.emote === PET_EMOTE) {
      const cat = cats.find((c) => c.cat.key === m.target);
      if (cat) catReacts(cat, speaker || null);
      if (catStats.value[m.target]) catStats.value[m.target].pets++;
    } else if (speaker && m.emote === 'dance') {
      // A dance lasts a little while, or until you walk, sit down or type /stop
      Object.assign(speaker, { dancing: true, sitting: false, danceUntil: performance.now() + DANCE_MS });
      if (mine) sync?.now();
    } else if (speaker) {
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
      spot: () => ({ ...goalOf(player), facing: player.facing, sitting: player.sitting, dancing: player.dancing }),
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

// ---------- Panels: your card, someone else's card, friends, the chat log, the guestbook ----------
const panel = ref(''); // me | friends | log | guestbook
const picked = ref(null); // someone clicked in the room: { user }
function openPanel(name) {
  panel.value = name;
  picked.value = null;
  if (name === 'log') unread.value = 0;
}
function toggle(name) {
  openPanel(panel.value === name ? '' : name);
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

// Each slice of a bench is one seat; the guestbook stand opens the guestbook
function onFurnitureClick(slice, event) {
  if (slice.piece.facing) goSit(seatAt(slice.tile.x, slice.tile.y));
  else if (slice.kind === 'guestbook' && props.place) approach(slice.tile, { type: 'guestbook', stand: slice.tile });
  else onFloorClick(event);
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
  // 1-6: quick emotes, in the order of the emote bar
  const quick = /^[1-9]$/.test(event.key) ? EMOTES[Number(event.key) - 1] : null;
  if (quick && props.me && shared.value) {
    event.preventDefault();
    send(`/${quick.key}`).catch(() => {});
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
// Furniture comes in one-tile slices so it sorts properly among the people (museum/furniture.js)
const furniture = computed(() => sliceFurniture(layout.value.furniture));

const people = computed(() => [
  { key: 'me', self: true, w: player, look: myLook.value, name: myName.value },
  ...others.map((o) => ({ key: `o-${o.user.id}`, self: false, real: true, w: o, look: o.look, name: o.user.displayName })),
  ...visitors.map((v, i) => ({ key: `v${i}-${v.user.id}`, self: false, w: v, look: v.look, name: v.user.displayName })),
]);

const hoveredName = ref(null);
const sprites = computed(() =>
  [
    ...furniture.value.map((f) => ({ ...f, type: 'furniture', dim: litAt(f.tile.x + 0.5, f.tile.y + 0.5) })),
    ...people.value.map((p) => {
      const at = iso(p.w.x + 0.5, p.w.y + 0.5);
      // On a bench they sit at seat height
      const onSeat = p.w.sitting && !p.w.walking && seatAt(Math.round(p.w.x), Math.round(p.w.y));
      return {
        ...p,
        type: 'person',
        // Sitting: just after the seat, so before a backrest that's nearer the viewer
        depth: onSeat ? tileDepth(onSeat.x, onSeat.y) + 0.01 : p.w.x + p.w.y + 1,
        sx: at.x,
        sy: at.y - (onSeat ? 12 : 0),
        dim: litAt(p.w.x + 0.5, p.w.y + 0.5),
      };
    }),
    ...cats.map((c) => {
      const at = iso(c.x + 0.5, c.y + 0.5);
      const inBed = !c.walking && Math.round(c.x) === CAT_BED.x && Math.round(c.y) === CAT_BED.y;
      return {
        key: `cat-${c.cat.key}`,
        type: 'cat',
        c,
        depth: c.x + c.y + 1 + (inBed ? 0.01 : 0),
        sx: at.x,
        sy: at.y - (inBed ? 6 : 0),
        dim: litAt(c.x + 0.5, c.y + 0.5),
      };
    }),
  ].sort((a, b) => a.depth - b.depth)
);

const status = computed(() => {
  if (hoverInfo.value?.kind === 'frame') return `#${hoverInfo.value.number}: ${hoverInfo.value.text}`;
  if (hoverInfo.value?.kind === 'door') return `${hoverInfo.value.text}. Click to walk through.`;
  if (hoveredName.value) return `${hoveredName.value}. Click to see their card.`;
  const c = hoveredCat.value;
  if (c) {
    const mood = MOODS[c.mood] || MOODS.content;
    const pets = petCount(c);
    return `${c.cat.name} is feeling ${mood.label} ${mood.emoji}${pets ? `, petted ${pets.toLocaleString()} ${pets === 1 ? 'time' : 'times'}` : ''}. Loves ${c.cat.likes}. Click to pet.`;
  }
  return 'Click the floor to walk, a picture to look closer, a bench to sit down, or a cat to pet it.';
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
  loadCatStats();
  raf = requestAnimationFrame(tick);
  // Nothing to animate while the room is scrolled away: stop the loop, start it again on return
  if (typeof IntersectionObserver !== 'undefined' && svgRef.value) {
    observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen && !raf) raf = requestAnimationFrame(tick);
    });
    observer.observe(svgRef.value);
  }
});
onBeforeUnmount(() => {
  observer?.disconnect();
  cancelAnimationFrame(raf);
  motionQuery?.removeEventListener?.('change', onMotionChange);
});

defineExpose({ walkTo });
</script>

<template>
  <div class="museum-room" :style="{ background: roomTheme.void }">
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
        <MuseumBackdrop
          :room="layout"
          :theme="roomTheme"
          :lights="lights"
          :view="view"
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
            :class="{ seat: s.piece.facing, stand: s.kind === 'guestbook' }"
            aria-hidden="true"
            @click.stop="onFurnitureClick(s, $event)"
          >
            <MuseumFurniture :slice="s" :theme="roomTheme" :dim="s.dim" />
          </g>
          <g
            v-else-if="s.type === 'cat'"
            class="cat-sprite"
            @click.stop="goPet(s.c)"
            @pointerenter="hoveredCat = s.c"
            @pointerleave="hoveredCat = null"
          >
            <PixelCat
              :x="s.sx"
              :y="s.sy"
              :facing="s.c.facing"
              :state="s.c.state"
              :step="s.c.step"
              :coat="s.c.cat.coat"
              :petted="s.c.petted"
              :bubble="s.c.bubble"
              :name="s.c.cat.name"
              :show-name="hoveredCat === s.c"
              :dim="s.dim"
            />
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
              :walking="s.w.walking || s.w.dancing"
              :sitting="s.w.sitting && !s.w.walking"
              :emote="s.w.emote || (s.w.dancing && !s.w.walking ? 'dance' : '')"
              :step="s.w.step"
              :look="s.look"
              :name="s.name"
              :show-name="s.self || hoveredName === s.name"
              :bubble="s.w.bubble"
              :self="s.self"
              :dim="s.dim"
              :edges="[view.minX, view.maxX]"
            />
          </g>
        </template>

        <MuseumLights :lights="lights" />
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
      <div v-if="panel === 'guestbook' && place" class="panel left bare">
        <GuestbookPanel :place="place" :me="me" @close="panel = ''" />
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
          <template v-if="me && shared">Press Enter in the room to chat, or 1 to 6 for quick emotes. Type /pet and a cat's name to pet it.</template>
        </span>
      </p>
      <div class="hud-right">
        <span class="design" :title="roomTheme.blurb">{{ roomTheme.label }}</span>
        <button
          v-if="canDim"
          type="button"
          class="btn btn-ghost btn-xs lights-switch"
          :aria-pressed="lightsOn ? 'true' : 'false'"
          @click="lightsOn = !lightsOn"
        >
          <Lightbulb v-if="!lightsOn" :size="14" aria-hidden="true" />
          <LightbulbOff v-else :size="14" aria-hidden="true" />
          {{ lightsOn ? 'Dim the lights' : 'Lights on' }}
        </button>
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
      :dancing="player.dancing"
      :guestbook="Boolean(place)"
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
.person,
.cat-sprite,
.furniture.seat,
.furniture.stand {
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
.panel.left.bare {
  width: auto;
  padding: 0;
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
.design {
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 0.8rem;
  font-weight: 700;
}
.lights-switch {
  color: #f3eaf0;
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
