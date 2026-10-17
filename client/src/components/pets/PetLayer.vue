<script setup>
import { computed, reactive, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { Cookie, Hand, Heart } from 'lucide-vue-next';
import PetSprite from './PetSprite.vue';
import { lineFor } from './petLines';
import { resolvePet, PET_KINDS, MAX_SHOWN_PETS } from '@shared/pets.mjs';
import { auth } from '@/stores/auth';
import { preferences } from '@/stores/preferences';
import { toast } from '@/stores/toast';
import { pets, refreshPets, hidePet, showHiddenPets, fullnessOf, feedPet, savedSpot, saveSpot } from '@/stores/pets';

// Screen pets. The characters someone has picked as pets wander along the bottom of the screen,
// keeping to the space beside the page when there is some, and now and then jump up to sit on a
// card. They can be picked up and thrown, fed and petted, and say little things that vanish fast.
// Positions are written straight to the DOM every frame; only what changes the drawing (pose,
// facing, speech, the menu) goes through Vue.
const GRAVITY = 2400; // px/s²
const SPEED = { cat: 34, dog: 44, fox: 40, bunny: 52, mouse: 50, bear: 26, penguin: 22, bird: 38, dragon: 34, slime: 30, frog: 48, hedgehog: 22 };
// These get about in little hops instead of walking
const HOPPERS = {
  bunny: { cycle: 0.5, height: 9, pose: 'jump' },
  frog: { cycle: 0.56, height: 11, pose: 'jump' },
  bird: { cycle: 0.3, height: 5, pose: 'walk' },
  slime: { cycle: 0.62, height: 7, pose: 'walk' },
};
const HOP_AIR = 0.62; // share of each hop spent off the ground
const PERCH_SELECTOR = 'main .card, main .btn-primary';
const MAX_PERCHED = 2;
const KIND_LABEL = Object.fromEntries(PET_KINDS.map((k) => [k.value, k.label.toLowerCase()]));

const route = useRoute();
const layer = ref(null);
const narrow = ref(false);
const reduceMotion = ref(false);
const size = computed(() => (narrow.value ? 46 : 60));

const active = computed(() => !!auth.user && preferences.pets && !route.meta.hideChrome && !route.meta.noPets);
const shown = computed(() =>
  pets.list
    .filter((c) => !pets.hidden.includes(c.id))
    .slice(0, narrow.value ? 2 : MAX_SHOWN_PETS)
    .map((c) => ({ id: c.id, ...resolvePet(c) }))
);

const views = reactive({}); // id -> what the template draws
const bodies = new Map(); // id -> position and behaviour (not reactive)
const boxes = new Map(); // id -> { box, squash } elements
const geo = { w: 0, h: 0, top: 0, floor: 0, navBottom: 0, lanes: [] };

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const clock = () => performance.now() / 1000;
const half = () => size.value / 2;

// ---- Who's out ----------------------------------------------------------------------------------

watch(
  shown,
  (list) => {
    const ids = new Set(list.map((p) => p.id));
    for (const id of [...bodies.keys()]) {
      if (!ids.has(id)) {
        bodies.delete(id);
        delete views[id];
      }
    }
    list.forEach((pet, index) => {
      const p = bodies.get(pet.id);
      if (p) Object.assign(p, { kind: pet.kind, name: pet.name, index });
      else spawn(pet, index);
    });
  },
  { immediate: true }
);

function spawn(pet, index) {
  bodies.set(pet.id, {
    id: pet.id,
    kind: pet.kind,
    name: pet.name,
    index,
    x: null, // placed on the first frame, once the layer can be measured
    y: 0,
    vx: 0,
    vy: 0,
    mode: 'idle', // idle | walk | crouch | air | land | fall | held
    pose: 'sit',
    until: 0,
    target: 0,
    perch: null, // { el, dx } while sitting on top of something
    jumpTo: null,
    jump: null,
    queue: [],
    home: savedSpot(pet.id), // where they were last put down, as a share of the width
    hop: 0,
    hopY: 0,
    rot: 0,
    rotTarget: 0,
    landAt: 0,
    nextTalk: 0,
    bubbleUntil: 0,
    spots: [],
    spotsAt: -1,
  });
  views[pet.id] = { state: 'sit', step: 0, facing: Math.random() < 0.5 ? 'left' : 'right', bubble: '', side: 'mid', menu: false, menuSide: 'mid', menuBelow: false, full: fullnessOf(pet.id) };
}

watch(
  () => auth.user?.id,
  () => refreshPets(),
  { immediate: true }
);
// Turning pets back on also brings back any put away with "Hide for now"
watch(
  () => preferences.pets,
  (on) => on && showHiddenPets()
);

function setBox(id, el) {
  const entry = boxes.get(id) || {};
  entry.box = el;
  boxes.set(id, entry);
}
function setSquash(id, el) {
  const entry = boxes.get(id) || {};
  entry.squash = el;
  boxes.set(id, entry);
}

// ---- Where things are ---------------------------------------------------------------------------

let safeBottom = 0;
function measure() {
  const el = layer.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  geo.w = r.width;
  geo.h = r.height;
  geo.top = r.top;
  geo.floor = r.height - safeBottom - 3;
  const nav = document.querySelector('.topbar');
  geo.navBottom = nav ? Math.max(0, nav.getBoundingClientRect().bottom - r.top) : 0;
  geo.lanes = lanes();
}

// The strips of floor a pet keeps to: beside the page's content where there's room, otherwise the
// outer edges of the screen, so they stay out of the way of what people are doing.
function lanes() {
  const s = size.value;
  const main = document.querySelector('.app-main main') || document.querySelector('main');
  const page = main && (main.classList.contains('page') ? main : main.querySelector('.page'));
  if (page) {
    const r = page.getBoundingClientRect();
    const css = getComputedStyle(page);
    const left = r.left + parseFloat(css.paddingLeft);
    const right = r.right - parseFloat(css.paddingRight);
    const gutters = [
      [s / 2 + 6, left - s / 2 - 4],
      [right + s / 2 + 4, geo.w - s / 2 - 6],
    ].filter(([a, b]) => b - a >= s * 0.6);
    if (gutters.length) return gutters;
  }
  const edge = Math.max(s * 1.8, geo.w * 0.2);
  return [
    [s / 2 + 6, edge],
    [geo.w - edge, geo.w - s / 2 - 6],
  ];
}

function homeRange(p) {
  const lo = half() + 4;
  const hi = geo.w - half() - 4;
  if (p.home != null) {
    const x = p.home * geo.w;
    return [clamp(x - 90, lo, hi), clamp(x + 90, lo, hi)];
  }
  return geo.lanes[p.index % geo.lanes.length] || [lo, hi];
}
const homeX = (p) => rand(...homeRange(p));
const atHome = (p) => {
  const [lo, hi] = homeRange(p);
  return p.x >= lo - 2 && p.x <= hi + 2;
};

// Cards and buttons whose top edge is on screen and wide enough to sit on.
// landing: anything visible (for things that are falling), otherwise only places worth jumping to.
function perchSpots(landing = false) {
  const s = size.value;
  const highest = geo.navBottom + (landing ? 4 : s + 12);
  const lowest = geo.floor - (landing ? 6 : s + 24);
  const spots = [];
  for (const el of document.querySelectorAll(PERCH_SELECTOR)) {
    if (el.closest('[role="dialog"], .pet-layer')) continue;
    const r = el.getBoundingClientRect();
    const top = r.top - geo.top;
    if (r.width < s + 20 || top < highest || top > lowest || r.left < 0 || r.right > geo.w) continue;
    spots.push({ el, r, top });
    if (spots.length >= 80) break;
  }
  return spots;
}

function perchRect(perch) {
  const el = perch?.el;
  if (!el || !el.isConnected) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? r : null;
}

// A free spot along the top of an element, away from any other pet sitting there
function freeDx(el, r) {
  const s = size.value;
  const others = [...bodies.values()].filter((o) => o.perch?.el === el || o.jumpTo?.el === el).map((o) => (o.perch || o.jumpTo).dx);
  let dx = rand(s / 2 + 2, r.width - s / 2 - 2);
  for (let i = 0; i < 6 && others.some((o) => Math.abs(o - dx) < s); i++) dx = rand(s / 2 + 2, r.width - s / 2 - 2);
  return dx;
}

const perchedCount = () => [...bodies.values()].filter((o) => o.perch || o.jumpTo?.el).length;

// ---- The loop -----------------------------------------------------------------------------------

let raf = 0;
let lastT = 0;
let measuredAt = -1;

function frame(ms) {
  raf = requestAnimationFrame(frame);
  const t = ms / 1000;
  const dt = Math.min(0.05, Math.max(0, t - lastT));
  lastT = t;
  if (t - measuredAt > 0.5) {
    measure();
    measuredAt = t;
  }
  if (!geo.w) return;
  for (const p of bodies.values()) {
    if (p.x == null) place(p, t);
    step(p, t, dt);
    draw(p, t);
  }
}

function start() {
  if (raf || document.hidden) return;
  lastT = clock();
  measuredAt = -1;
  raf = requestAnimationFrame(frame);
}
function stop() {
  cancelAnimationFrame(raf);
  raf = 0;
}

function place(p, t) {
  const [lo, hi] = homeRange(p);
  p.x = p.home != null ? clamp(p.home * geo.w, lo, hi) : rand(lo, hi);
  p.y = geo.floor;
  idle(p, 'sit', t, rand(1, 3) + p.index * 0.7);
  p.nextTalk = t + rand(5, 12) + p.index * 4;
}

function step(p, t, dt) {
  const v = views[p.id];
  if (!v) return;
  if (v.bubble && t > p.bubbleUntil) v.bubble = '';
  switch (p.mode) {
    case 'held':
      p.rot += (p.rotTarget - p.rot) * Math.min(1, dt * 12);
      p.rotTarget *= Math.pow(0.02, dt);
      break;
    case 'fall':
      fall(p, t, dt);
      break;
    case 'crouch':
      if (t >= p.until) launch(p, t);
      break;
    case 'air':
      fly(p, t);
      break;
    case 'land':
      followSurface(p, t);
      if (t >= p.until) settle(p, t);
      break;
    case 'walk':
      walk(p, t, dt);
      break;
    default:
      followSurface(p, t);
      if (p.mode !== 'idle') break;
      if (t >= p.until) next(p, t);
      else if (p.lookAt && t >= p.lookAt) {
        v.facing = v.facing === 'left' ? 'right' : 'left';
        p.lookAt = 0;
      }
  }
  if (p.mode === 'idle' || p.mode === 'walk') chatter(p, t);
}

// Keep a pet on whatever it's standing on as the page scrolls; tumble off when it goes away
function followSurface(p, t) {
  if (!p.perch) {
    p.y = geo.floor;
    p.x = clamp(p.x, half(), geo.w - half());
    return;
  }
  const r = perchRect(p.perch);
  const top = r ? r.top - geo.top : null;
  if (r && top > geo.floor) {
    // Scrolled down past the floor: they just end up back on it
    p.perch = null;
    p.y = geo.floor;
    return;
  }
  if (!r || top < geo.navBottom + 4 || p.perch.dx < 0 || p.perch.dx > r.width) {
    p.perch = null;
    p.vx = 0;
    p.vy = 0;
    p.mode = 'fall';
    p.bounced = false;
    views[p.id].state = 'jump';
    return;
  }
  p.x = r.left + p.perch.dx;
  p.y = top;
}

function idle(p, pose, t, duration) {
  p.mode = 'idle';
  p.pose = pose;
  p.until = t + duration;
  p.lookAt = pose === 'stand' ? t + duration * 0.5 : 0;
  p.hopY = 0;
  const v = views[p.id];
  v.state = pose;
  v.step = 0;
}

function next(p, t) {
  if (p.queue.length) {
    const s = p.queue.shift();
    idle(p, s.pose, t, s.duration);
    if (s.say) say(p, t, s.say);
    return;
  }
  if (views[p.id].menu) return idle(p, 'stand', t, 600);
  decide(p, t);
}

const isNight = () => {
  const h = new Date().getHours();
  return h >= 23 || h < 6;
};

function decide(p, t) {
  const r = Math.random();
  const sleepy = isNight() ? 2 : 1;
  if (reduceMotion.value) return idle(p, r < 0.75 ? 'sit' : 'sleep', t, rand(10, 20));
  if (p.perch) {
    if (r < 0.3) return idle(p, 'sit', t, rand(4, 9));
    if (r < 0.3 + 0.12 * sleepy) return idle(p, 'sleep', t, rand(6, 12));
    if (r < 0.62) return walkTo(p, freeDx(p.perch.el, perchRect(p.perch)), t);
    if (r < 0.7 && jumpToPerch(p, t)) return;
    return jumpDown(p, t);
  }
  // Somewhere over the page (just jumped down from a card): head back to the side first
  if (!atHome(p) && Math.random() < 0.8) return walkTo(p, homeX(p), t);
  if (r < 0.4) return walkTo(p, homeX(p), t);
  if (r < 0.52) return idle(p, 'sit', t, rand(3, 7));
  if (r < 0.52 + 0.07 * sleepy) return idle(p, 'sleep', t, rand(8, 16));
  if (r < 0.74) return idle(p, 'stand', t, rand(1.4, 3));
  if (r < 0.82) return leap(p, homeX(p), t);
  if (r < 0.95 && jumpToPerch(p, t)) return;
  return walkTo(p, homeX(p), t);
}

function speedOf(p) {
  return (SPEED[p.kind] || 32) * (size.value / 52);
}

function walkTo(p, target, t) {
  p.mode = 'walk';
  p.target = target;
  p.hop = 0;
  const from = p.perch ? p.perch.dx : p.x;
  p.until = t + (Math.abs(target - from) / speedOf(p)) * 1.8 + 2;
}

function walk(p, t, dt) {
  const v = views[p.id];
  const hopper = HOPPERS[p.kind];
  let speed = speedOf(p);
  let pose = 'walk';
  let grounded = true;
  p.hopY = 0;
  if (hopper) {
    p.hop += dt / hopper.cycle;
    const u = p.hop % 1;
    if (u < HOP_AIR) {
      p.hopY = -Math.sin((Math.PI * u) / HOP_AIR) * hopper.height * (size.value / 52);
      speed /= HOP_AIR;
      pose = hopper.pose;
      grounded = false;
    } else {
      speed = 0;
      pose = 'stand';
    }
  }
  const from = p.perch ? p.perch.dx : p.x;
  const d = p.target - from;
  const moved = from + Math.sign(d) * Math.min(Math.abs(d), speed * dt);
  if (p.perch) p.perch.dx = moved;
  else p.x = moved;
  followSurface(p, t);
  if (p.mode !== 'walk') return; // walked off the edge of something
  if (Math.abs(d) > 0.5) v.facing = d < 0 ? 'left' : 'right';
  v.state = pose;
  v.step = Math.floor(t / 0.17);
  if ((Math.abs(d) <= 0.5 && grounded) || t > p.until) idle(p, Math.random() < 0.5 ? 'stand' : 'sit', t, rand(1.5, 4));
}

// ---- Jumping ------------------------------------------------------------------------------------

function jumpToPerch(p, t) {
  if (!p.perch && perchedCount() >= MAX_PERCHED) return false;
  const spots = perchSpots().filter((s) => {
    const rise = p.y - s.top;
    const nearest = clamp(p.x, s.r.left, s.r.right);
    return s.el !== p.perch?.el && Math.abs(nearest - p.x) < 460 && rise > 30 && rise < 460;
  });
  if (!spots.length) return false;
  const s = spots[Math.floor(Math.random() * spots.length)];
  startJump(p, { el: s.el, dx: freeDx(s.el, s.r) }, t);
  return true;
}

// Down to the floor, straight into their own lane when it's close enough
function jumpDown(p, t) {
  const [lo, hi] = homeRange(p);
  const nearest = clamp(p.x, lo, hi);
  const dir = p.x < geo.w / 2 ? -1 : 1;
  const x = Math.abs(nearest - p.x) < 320 ? clamp(nearest + rand(-20, 20), lo, hi) : p.x + dir * rand(40, 120);
  startJump(p, { x: clamp(x, half() + 4, geo.w - half() - 4) }, t);
}

function leap(p, x, t) {
  if (Math.abs(x - p.x) < 40) return walkTo(p, x, t);
  startJump(p, { x }, t);
}

function startJump(p, to, t) {
  p.mode = 'crouch';
  p.until = t + 0.16;
  p.jumpTo = to;
  p.hopY = 0;
  const v = views[p.id];
  v.state = 'stand';
  const target = targetPoint(to);
  if (Math.abs(target.x - p.x) > 2) v.facing = target.x < p.x ? 'left' : 'right';
}

function targetPoint(to) {
  if (to.el) {
    const r = perchRect(to);
    if (r) return { x: r.left + to.dx, y: r.top - geo.top };
    to.x = clamp(to.x ?? geo.w / 2, half(), geo.w - half());
    to.el = null; // it went away mid-jump: come down on the floor instead
  }
  return { x: to.x, y: geo.floor };
}

function launch(p, t) {
  const target = targetPoint(p.jumpTo);
  if (p.jumpTo.el) p.jumpTo.x = target.x;
  const rise = p.y - target.y;
  const dist = Math.hypot(target.x - p.x, rise);
  p.jump = {
    x0: p.x,
    y0: p.y,
    t0: t,
    duration: clamp(0.42 + dist / 1500, 0.45, 0.95),
    height: rise > 0 ? 36 + rise * 0.32 : 26,
  };
  p.perch = null;
  p.mode = 'air';
  views[p.id].state = 'jump';
}

function fly(p, t) {
  const j = p.jump;
  const target = targetPoint(p.jumpTo);
  const u = Math.min(1, (t - j.t0) / j.duration);
  p.x = j.x0 + (target.x - j.x0) * u;
  p.y = j.y0 + (target.y - j.y0) * u - 4 * j.height * u * (1 - u);
  if (u < 1) return;
  if (p.jumpTo.el) p.perch = { el: p.jumpTo.el, dx: p.jumpTo.dx };
  p.jumpTo = null;
  land(p, t);
}

function land(p, t) {
  p.mode = 'land';
  p.until = t + 0.18;
  p.landAt = t;
  p.vx = 0;
  p.vy = 0;
  p.rot = 0;
  views[p.id].state = 'stand';
  if (p.dropped) {
    // Put down somewhere new by hand: that's their spot now
    p.dropped = false;
    if (!p.perch) {
      p.home = p.x / geo.w;
      saveSpot(p.id, p.home);
    }
  }
}

function settle(p, t) {
  if (p.thrown) {
    p.thrown = false;
    if (Math.random() < 0.7) say(p, t, 'thrown');
    return idle(p, 'happy', t, 1.1);
  }
  if (p.perch) {
    if (Math.random() < 0.3) say(p, t, 'perched');
    return idle(p, 'sit', t, rand(3, 8));
  }
  idle(p, 'stand', t, rand(0.8, 2));
}

// Dropped, thrown or knocked off something: gravity, a bounce off the walls, and landing on the
// floor or the top of a card on the way down
function fall(p, t, dt) {
  const prevY = p.y;
  p.vy += GRAVITY * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.vx *= Math.pow(0.5, dt);
  p.rot += (clamp(p.vx * 0.03, -20, 20) - p.rot) * Math.min(1, dt * 8);
  const h = half();
  if (p.x < h) {
    p.x = h;
    p.vx = Math.abs(p.vx) * 0.5;
  } else if (p.x > geo.w - h) {
    p.x = geo.w - h;
    p.vx = -Math.abs(p.vx) * 0.5;
  }
  if (p.y < size.value) {
    p.y = size.value;
    p.vy = Math.abs(p.vy) * 0.3;
  }
  views[p.id].state = 'jump';
  if (p.vy <= 0) return;
  if (t - p.spotsAt > 0.25) {
    p.spots = perchSpots(true);
    p.spotsAt = t;
  }
  for (const s of p.spots) {
    if (prevY <= s.top && p.y >= s.top && p.x >= s.r.left + 8 && p.x <= s.r.right - 8) {
      p.perch = { el: s.el, dx: p.x - s.r.left };
      p.y = s.top;
      return land(p, t);
    }
  }
  if (p.y >= geo.floor) {
    p.y = geo.floor;
    if (p.vy > 650 && !p.bounced) {
      p.vy = -p.vy * 0.28;
      p.vx *= 0.7;
      p.bounced = true;
      return;
    }
    land(p, t);
  }
}

// ---- Drawing ------------------------------------------------------------------------------------

function draw(p, t) {
  const el = boxes.get(p.id);
  if (!el?.box || !el.squash) return;
  const s = size.value;
  let sx = 1;
  let sy = 1;
  let rot = 0;
  if (p.mode === 'crouch') {
    sx = 1.14;
    sy = 0.82;
  } else if (p.mode === 'land') {
    const k = 1 - clamp((t - p.landAt) / 0.18, 0, 1);
    sx = 1 + 0.18 * k;
    sy = 1 - 0.22 * k;
  } else if (p.mode === 'air') {
    const u = (t - p.jump.t0) / p.jump.duration;
    if (u < 0.6) {
      sx = 0.93;
      sy = 1.09;
    }
  } else if (p.mode === 'fall' || p.mode === 'held') {
    rot = p.rot;
    if (p.mode === 'fall') {
      sx = 0.95;
      sy = 1.06;
    }
  }
  el.box.style.transform = `translate3d(${(p.x - s / 2).toFixed(1)}px, ${(p.y - s + p.hopY).toFixed(1)}px, 0)`;
  el.squash.style.transform = `rotate(${rot.toFixed(1)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
}

// ---- Talking ------------------------------------------------------------------------------------

function say(p, t, mood) {
  const v = views[p.id];
  v.bubble = lineFor(p.kind, mood, p.name);
  v.side = p.x < 70 ? 'left' : p.x > geo.w - 70 ? 'right' : 'mid';
  p.bubbleUntil = t + 1.7;
}

function chatter(p, t) {
  if (t < p.nextTalk) return;
  const v = views[p.id];
  const hungry = v.full < 25;
  p.nextTalk = t + (hungry ? rand(8, 14) : rand(12, 26));
  if (v.menu || (p.mode === 'idle' && p.pose === 'sleep')) return;
  say(p, t, hungry && Math.random() < 0.6 ? 'hungry' : 'chat');
}

// ---- Picking up and throwing --------------------------------------------------------------------

let drag = null;
let swallowClick = false;

function onDown(e, id) {
  if (e.button !== 0 || drag) return;
  const p = bodies.get(id);
  if (!p || p.x == null) return;
  const y = e.clientY - geo.top;
  drag = { id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, offX: p.x - e.clientX, offY: p.y - y, moved: false, samples: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }] };
  e.currentTarget.setPointerCapture?.(e.pointerId);
}

function onMove(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const p = bodies.get(drag.id);
  if (!p) return;
  if (!drag.moved) {
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 6) return;
    drag.moved = true;
    pickUp(p, clock());
  }
  const last = drag.samples[drag.samples.length - 1];
  drag.samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
  if (drag.samples.length > 6) drag.samples.shift();
  const s = size.value;
  p.x = clamp(e.clientX + drag.offX, s / 2, geo.w - s / 2);
  p.y = clamp(e.clientY - geo.top + drag.offY, s * 0.9, geo.floor);
  // Swing a little as they're carried about
  const vx = (e.clientX - last.x) / Math.max(1, e.timeStamp - last.t);
  p.rotTarget = clamp(-vx * 14, -24, 24);
}

function onUp(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const d = drag;
  drag = null;
  if (!d.moved) return; // a tap: the click handler opens the menu
  swallowClick = true;
  setTimeout(() => (swallowClick = false), 0);
  const first = d.samples[0];
  const last = d.samples[d.samples.length - 1];
  const ms = Math.max(16, last.t - first.t);
  const fresh = e.timeStamp - last.t < 90; // stopped before letting go: just drop them
  const vx = fresh ? ((last.x - first.x) / ms) * 1000 : 0;
  const vy = fresh ? ((last.y - first.y) / ms) * 1000 : 0;
  release(bodies.get(d.id), clamp(vx, -1100, 1100), clamp(vy, -1100, 600), clock());
}

function onCancel(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  const d = drag;
  drag = null;
  if (d.moved) release(bodies.get(d.id), 0, 0, clock());
}

function pickUp(p, t) {
  const v = views[p.id];
  v.menu = false;
  p.mode = 'held';
  p.perch = null;
  p.jumpTo = null;
  p.queue = [];
  p.hopY = 0;
  p.rot = 0;
  p.rotTarget = 0;
  v.state = 'held';
  if (Math.random() < 0.5) say(p, t, 'picked');
}

function release(p, vx, vy, t) {
  if (!p) return;
  p.dropped = true;
  p.thrown = Math.hypot(vx, vy) > 500;
  if (reduceMotion.value) {
    // No falling animation: straight onto whatever is underneath
    const below = perchSpots(true)
      .filter((s) => s.top >= p.y && p.x >= s.r.left + 8 && p.x <= s.r.right - 8)
      .sort((a, b) => a.top - b.top)[0];
    p.perch = below ? { el: below.el, dx: p.x - below.r.left } : null;
    p.y = below ? below.top : geo.floor;
    p.thrown = false;
    return land(p, t);
  }
  p.vx = vx;
  p.vy = vy;
  p.bounced = false;
  p.spotsAt = -1;
  p.mode = 'fall';
}

// ---- The little menu ----------------------------------------------------------------------------

const menuRoot = new Map();

function onClick(id, e) {
  if (swallowClick) return;
  const p = bodies.get(id);
  const v = views[id];
  if (!p || !v) return;
  if (v.menu) return closeMenu(id);
  if (p.mode !== 'idle' && p.mode !== 'walk') return;
  for (const other of Object.keys(views)) if (other !== id) views[other].menu = false;
  const t = clock();
  if (p.mode === 'idle' && p.pose === 'sleep') say(p, t, 'woken');
  v.full = fullnessOf(id);
  v.menuSide = p.x < 120 ? 'left' : p.x > geo.w - 120 ? 'right' : 'mid';
  v.menuBelow = p.y - size.value - 190 < geo.navBottom;
  v.menu = true;
  idle(p, 'stand', t, 600);
  v.facing = p.x < geo.w / 2 ? 'right' : 'left';
  // Opened from the keyboard: move focus into the menu
  if (e.detail === 0) nextTick(() => menuRoot.get(id)?.querySelector('button')?.focus());
}

function closeMenu(id, { focusPet = false } = {}) {
  const v = views[id];
  const p = bodies.get(id);
  if (!v?.menu) return;
  v.menu = false;
  if (p && p.mode === 'idle' && !p.queue.length) p.until = Math.min(p.until, clock() + 1.5);
  if (focusPet) boxes.get(id)?.box?.querySelector('.pet-body')?.focus();
}

function queue(id, steps) {
  const p = bodies.get(id);
  if (!p) return;
  p.queue = steps;
  if (p.mode === 'idle' || p.mode === 'walk') {
    p.mode = 'idle';
    p.until = 0;
  }
}

function feed(id) {
  const p = bodies.get(id);
  const full = feedPet(id);
  if (full == null) {
    say(p, clock(), 'full');
    return queue(id, [{ pose: 'sit', duration: 1.4 }]);
  }
  views[id].full = full;
  queue(id, [
    { pose: 'eat', duration: 2.2 },
    { pose: 'happy', duration: 1.3, say: 'fed' },
  ]);
}

function pat(id) {
  queue(id, [{ pose: 'happy', duration: 1.8, say: 'petted' }]);
}

function hide(id) {
  const pet = shown.value.find((s) => s.id === id);
  closeMenu(id);
  hidePet(id);
  toast.info(`${pet?.name || 'Your pet'} is having a nap until your next visit. The paw button brings everyone back.`);
}

const hearts = (full) => Math.round(full / 20);

function onDocPointerDown(e) {
  for (const [id, v] of Object.entries(views)) {
    if (v.menu && !boxes.get(id)?.box?.contains(e.target)) closeMenu(id);
  }
}
function onKey(e) {
  if (e.key !== 'Escape') return;
  for (const [id, v] of Object.entries(views)) if (v.menu) closeMenu(id, { focusPet: true });
}

// ---- Starting and stopping ----------------------------------------------------------------------

let narrowQuery = null;
let motionQuery = null;
const syncNarrow = () => (narrow.value = !!narrowQuery?.matches);
const syncMotion = () => (reduceMotion.value = !!motionQuery?.matches);

function onVisibility() {
  if (document.hidden) stop();
  else if (active.value && shown.value.length) start();
}
function onResize() {
  measuredAt = -1;
}

watch(
  () => active.value && shown.value.length > 0,
  async (on) => {
    if (!on) return stop();
    await nextTick();
    if (layer.value) {
      safeBottom = parseFloat(getComputedStyle(layer.value).paddingBottom) || 0;
      start();
    }
  },
  { immediate: true, flush: 'post' }
);

// New page: look again for the page edges and things to sit on
watch(
  () => route.path,
  () => {
    measuredAt = -1;
    setTimeout(() => (measuredAt = -1), 400);
  }
);

onMounted(() => {
  narrowQuery = window.matchMedia('(max-width: 640px)');
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  syncNarrow();
  syncMotion();
  narrowQuery.addEventListener('change', syncNarrow);
  motionQuery.addEventListener('change', syncMotion);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('pointerdown', onDocPointerDown, true);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
});

onBeforeUnmount(() => {
  stop();
  narrowQuery?.removeEventListener('change', syncNarrow);
  motionQuery?.removeEventListener('change', syncMotion);
  document.removeEventListener('visibilitychange', onVisibility);
  document.removeEventListener('pointerdown', onDocPointerDown, true);
  document.removeEventListener('keydown', onKey);
  window.removeEventListener('resize', onResize);
});
</script>

<template>
  <aside v-if="active && shown.length" ref="layer" class="pet-layer" aria-label="Your screen pets">
    <div
      v-for="pet in shown"
      :key="pet.id"
      :ref="(el) => setBox(pet.id, el)"
      class="pet"
      :class="{ open: views[pet.id]?.menu, held: views[pet.id]?.state === 'held' }"
      :style="{ width: `${size}px`, height: `${size}px` }"
    >
      <template v-if="views[pet.id]">
        <Transition name="bubble">
          <p v-if="views[pet.id].bubble" class="bubble" :class="`side-${views[pet.id].side}`" aria-hidden="true">
            {{ views[pet.id].bubble }}
          </p>
        </Transition>

        <button
          type="button"
          class="pet-body"
          :aria-label="`${pet.name} the ${KIND_LABEL[pet.kind]}, your screen pet`"
          :aria-expanded="views[pet.id].menu ? 'true' : 'false'"
          @pointerdown="onDown($event, pet.id)"
          @pointermove="onMove"
          @pointerup="onUp"
          @pointercancel="onCancel"
          @click="onClick(pet.id, $event)"
          @dragstart.prevent
        >
          <span class="pop">
            <span :ref="(el) => setSquash(pet.id, el)" class="squash">
              <PetSprite
                :kind="pet.kind"
                :palette="pet.palette"
                :state="views[pet.id].state"
                :step="views[pet.id].step"
                :facing="views[pet.id].facing"
                :size="size"
              />
            </span>
          </span>
        </button>

        <Transition name="menu">
          <div
            v-if="views[pet.id].menu"
            :ref="(el) => menuRoot.set(pet.id, el)"
            class="pet-menu"
            :class="[`side-${views[pet.id].menuSide}`, { below: views[pet.id].menuBelow }]"
            role="group"
            :aria-label="pet.name"
          >
            <p class="menu-name">
              {{ pet.name }} <span class="menu-kind">{{ KIND_LABEL[pet.kind] }}</span>
            </p>
            <p class="hearts" :title="`Fullness ${hearts(views[pet.id].full)} of 5`">
              <span class="sr-only">Fullness {{ hearts(views[pet.id].full) }} of 5</span>
              <Heart
                v-for="i in 5"
                :key="i"
                :size="15"
                aria-hidden="true"
                :class="{ empty: i > hearts(views[pet.id].full) }"
                :fill="i > hearts(views[pet.id].full) ? 'none' : 'currentColor'"
              />
            </p>
            <div class="menu-actions">
              <button type="button" class="btn btn-primary btn-xs" @click="feed(pet.id)"><Cookie :size="15" aria-hidden="true" /> Feed</button>
              <button type="button" class="btn btn-outline btn-xs" @click="pat(pet.id)"><Hand :size="15" aria-hidden="true" /> Pet</button>
            </div>
            <div class="menu-foot">
              <RouterLink :to="{ name: 'character-edit', params: { id: pet.id } }" @click="closeMenu(pet.id)">About {{ pet.name }}</RouterLink>
              <button type="button" class="link-button" @click="hide(pet.id)">Hide for now</button>
            </div>
          </div>
        </Transition>
      </template>
    </div>
  </aside>
</template>

<style scoped>
/* Above the page, under the navbar, menus, modals and toasts */
.pet-layer {
  position: fixed;
  inset: 0;
  z-index: 35;
  overflow: hidden;
  pointer-events: none;
  padding-bottom: env(safe-area-inset-bottom);
}
.pet {
  position: absolute;
  top: 0;
  left: 0;
  will-change: transform;
  pointer-events: none;
}
.pet.open {
  z-index: 2;
}
.pet-body {
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  border-radius: 40%;
  background: none;
  cursor: grab;
  pointer-events: auto;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.pet-body:focus-visible {
  outline: 2px solid var(--pink);
  outline-offset: 2px;
}
.pet.held .pet-body {
  cursor: grabbing;
}
.pop,
.squash {
  display: block;
  transform-origin: 50% 100%;
}
/* Carried by the scruff */
.pet.held .squash {
  transform-origin: 50% 15%;
}
.pop {
  animation: pet-pop 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
@keyframes pet-pop {
  from {
    transform: scale(0);
  }
}
.pet-body:hover .pop {
  scale: 1.06;
  transition: scale 0.15s;
}

/* Speech: never in the way of the cursor, gone in a moment */
.bubble {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  translate: -50% 0;
  margin: 0;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  border: 1.5px solid var(--border-strong);
  box-shadow: var(--shadow);
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1.3;
  white-space: nowrap;
  pointer-events: none;
  transform-origin: 50% 100%;
}
.bubble::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  width: 7px;
  height: 7px;
  margin: -3px 0 0 -4px;
  background: inherit;
  border: inherit;
  border-width: 0 1.5px 1.5px 0;
  rotate: 45deg;
}
.bubble.side-left {
  left: 0;
  translate: none;
  transform-origin: 20% 100%;
}
.bubble.side-left::after {
  left: 20px;
}
.bubble.side-right {
  left: auto;
  right: 0;
  translate: none;
  transform-origin: 80% 100%;
}
.bubble.side-right::after {
  left: auto;
  right: 16px;
}
.bubble-enter-active {
  transition:
    scale 0.22s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.15s;
}
.bubble-leave-active {
  transition:
    scale 0.15s,
    opacity 0.15s;
}
.bubble-enter-from,
.bubble-leave-to {
  scale: 0.5;
  opacity: 0;
}

.pet-menu {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  translate: -50% 0;
  width: 212px;
  padding: 12px 14px;
  border-radius: 18px;
  background: var(--surface);
  color: var(--text);
  border: 1.5px solid var(--border-strong);
  box-shadow: var(--shadow);
  pointer-events: auto;
  transform-origin: 50% 100%;
}
.pet-menu.side-left {
  left: 0;
  translate: none;
  transform-origin: 15% 100%;
}
.pet-menu.side-right {
  left: auto;
  right: 0;
  translate: none;
  transform-origin: 85% 100%;
}
.pet-menu.below {
  bottom: auto;
  top: calc(100% + 10px);
  transform-origin: 50% 0;
}
.menu-enter-active {
  transition:
    scale 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.15s;
}
.menu-leave-active {
  transition: opacity 0.12s;
}
.menu-enter-from,
.menu-leave-to {
  scale: 0.85;
  opacity: 0;
}
.menu-name {
  margin: 0;
  font-weight: 800;
  overflow-wrap: anywhere;
}
.menu-kind {
  font-weight: 600;
  font-size: 0.8rem;
  color: var(--muted);
}
.hearts {
  display: flex;
  gap: 3px;
  margin: 6px 0 10px;
  color: var(--pink);
}
.hearts .empty {
  color: var(--border-strong);
}
.menu-actions {
  display: flex;
  gap: 6px;
}
.menu-actions .btn {
  flex: 1;
}
.menu-foot {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
  font-size: 0.8rem;
}
.menu-foot a,
.link-button {
  color: var(--muted);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.link-button {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  cursor: pointer;
}
.menu-foot a:hover,
.link-button:hover {
  color: var(--text);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .pop {
    animation: none;
  }
  .bubble-enter-active,
  .bubble-leave-active,
  .menu-enter-active,
  .menu-leave-active {
    transition: none;
  }
}
@media print {
  .pet-layer {
    display: none;
  }
}
</style>
