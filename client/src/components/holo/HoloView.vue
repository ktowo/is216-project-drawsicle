<script>
// One sparkle tile per gift for the whole visit (kept across openings)
const tiles = new Map();
</script>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { X, ArrowLeft, ArrowRight } from 'lucide-vue-next';
import { assetUrl } from '@/api';
import { createTilt } from '@/utils/holoTilt';
import { sparkleTile } from '@/utils/sparkles';

// The museum's Holo view (docs/specs/holo-view.md): one gift's picture as a holographic card that
// tilts toward the pointer, with an iridescent sheen, a soft glare and sparkles that light up under
// the light. ← → flip through the room's artworks; Shift + arrows tilt; Esc closes.
//   <HoloView v-if="holo" :items="items" :index="index" @update:index="..." @close="holo = false" />
//
// Smoothness rules (learned in the prototype, keep them): per frame only `transform` and `opacity`
// change, on layers painted once; the pointer is measured against a wrapper that never tilts, read
// on enter / resize / scroll only; the page underneath is taken out of rendering while open.
const props = defineProps({
  items: { type: Array, required: true }, // museum artworks: [{ submission, giver, recipient, event }]
  index: { type: Number, required: true },
});
const emit = defineEmits(['close', 'update:index']);

const item = computed(() => props.items[props.index] || null);
const sub = computed(() => item.value?.submission || null);
const image = computed(() => assetUrl(sub.value?.images?.[0] || ''));
const warned = computed(() => (sub.value?.contentWarnings || []).length > 0);
const revealed = ref(false);
const foil = computed(() => !warned.value || revealed.value);
const nameOf = (u) => u?.displayName || 'Someone';
const altText = computed(() => sub.value?.imageDescriptions?.[0] || sub.value?.title || 'A gift');

const sparkles = computed(() => {
  const id = sub.value?.id;
  if (!id) return '';
  if (!tiles.has(id)) tiles.set(id, `url(${sparkleTile(id)})`);
  return tiles.get(id);
});

// ---------- Tilt ----------
const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const tilt = createTilt({ reduced });
const card = ref(null);
const wrap = ref(null);
const sheen = ref(null);
const glare = ref(null);
const lamp = ref(null);
const stars = ref(null);
let frame = 0;
let box = null;
const keyPoint = { x: 0.5, y: 0.5 };

function draw(time) {
  const p = tilt.tick(time);
  const dx = p.lightX - 0.5;
  const dy = p.lightY - 0.5;
  const scale = (1 + p.lift * 0.03).toFixed(4);
  if (card.value) card.value.style.transform = `rotateX(${p.rx.toFixed(2)}deg) rotateY(${p.ry.toFixed(2)}deg) scale3d(${scale}, ${scale}, 1)`;
  if (sheen.value) {
    sheen.value.style.transform = `translate3d(${(-dx * 50).toFixed(2)}%, ${(-dy * 50).toFixed(2)}%, 0)`;
    sheen.value.style.opacity = (0.1 + p.strength * 0.2).toFixed(3);
  }
  if (glare.value) {
    glare.value.style.transform = `translate3d(${(dx * 100).toFixed(2)}%, ${(dy * 100).toFixed(2)}%, 0)`;
    glare.value.style.opacity = (0.45 + p.strength * 0.55).toFixed(3);
  }
  if (lamp.value && stars.value) {
    // The light moves; the stars under it stay put on the picture
    lamp.value.style.transform = `translate3d(${(dx * 100).toFixed(2)}%, ${(dy * 100).toFixed(2)}%, 0)`;
    stars.value.style.transform = `translate3d(${(-dx * 100).toFixed(2)}%, ${(-dy * 100).toFixed(2)}%, 0)`;
    lamp.value.style.opacity = (0.6 + p.strength * 0.4).toFixed(3);
  }
  frame = p.settled ? 0 : requestAnimationFrame(draw);
}
function wake() {
  if (!frame) frame = requestAnimationFrame(draw);
}

// The card's untilted area: the wrapper's box minus its padding (the wrapper never tilts)
function measure() {
  if (!wrap.value) return (box = null);
  const r = wrap.value.getBoundingClientRect();
  const pad = parseFloat(getComputedStyle(wrap.value).paddingLeft) || 0;
  box = { left: r.left + pad, top: r.top + pad, width: r.width - pad * 2, height: r.height - pad * 2 };
}
function pointFrom(e) {
  if (!box) measure();
  if (!box) return;
  keyPoint.x = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
  keyPoint.y = Math.min(1, Math.max(0, (e.clientY - box.top) / box.height));
  tilt.pointAt(keyPoint.x, keyPoint.y, e.timeStamp);
  wake();
}
let dragging = false;
function onPointerMove(e) {
  if (reduced) return;
  if (e.pointerType === 'mouse' || dragging) pointFrom(e);
}
function onPointerDown(e) {
  if (reduced || e.pointerType === 'mouse') return;
  dragging = true;
  wrap.value?.setPointerCapture?.(e.pointerId);
  pointFrom(e);
}
function onPointerUp(e) {
  if (!dragging) return;
  dragging = false;
  // Letting go of a touch drag: ease back to centre
  if (e.pointerType !== 'mouse') {
    keyPoint.x = keyPoint.y = 0.5;
    tilt.leave();
    wake();
  }
}
function onPointerLeave() {
  box = null;
  if (dragging) return;
  keyPoint.x = keyPoint.y = 0.5;
  tilt.leave();
  wake();
}

// Keyboard: Shift + arrows tilt by stepping a virtual pointer (starts where the pointer left it)
function keyTilt(key, at) {
  const step = 0.1;
  if (key === 'ArrowLeft') keyPoint.x = Math.max(0, keyPoint.x - step);
  if (key === 'ArrowRight') keyPoint.x = Math.min(1, keyPoint.x + step);
  if (key === 'ArrowUp') keyPoint.y = Math.max(0, keyPoint.y - step);
  if (key === 'ArrowDown') keyPoint.y = Math.min(1, keyPoint.y + step);
  tilt.pointAt(keyPoint.x, keyPoint.y, at);
  wake();
}

// ---------- Flip, close, focus ----------
const stage = ref(null);
function go(step) {
  const next = props.index + step;
  if (next >= 0 && next < props.items.length) emit('update:index', next);
}
watch(
  () => props.index,
  () => {
    revealed.value = false;
    box = null;
  }
);
// New foil layers (another artwork, or a warned picture just shown) need this frame's pose
watch([() => props.index, foil], async () => {
  await nextTick();
  if (!frame) draw(performance.now());
});

function onKeydown(e) {
  // Handled here so the viewer underneath doesn't also react
  e.stopPropagation();
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
    return;
  }
  if (e.key.startsWith('Arrow') && e.shiftKey) {
    e.preventDefault();
    if (!reduced) keyTilt(e.key, e.timeStamp);
    return;
  }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    go(e.key === 'ArrowLeft' ? -1 : 1);
    return;
  }
  if (e.key === 'Tab') {
    // Keep focus inside the stage
    const focusable = [...stage.value.querySelectorAll('button:not([disabled])')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === stage.value)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

// The live museum room and the viewer's blurred backdrop keep redrawing; while the Holo view is
// open they're taken out of rendering (the room's own loop pauses once it's off screen)
const underneath = [];
let savedScroll = 0;
function hideUnderneath() {
  savedScroll = window.scrollY;
  for (const el of document.querySelectorAll('#app, .modal-backdrop')) {
    underneath.push([el, el.style.display]);
    el.style.display = 'none';
  }
}
function restoreUnderneath() {
  for (const [el, display] of underneath.splice(0)) el.style.display = display;
  window.scrollTo(0, savedScroll);
}

let returnFocus = null;
onMounted(async () => {
  returnFocus = document.activeElement;
  hideUnderneath();
  window.addEventListener('resize', measure);
  window.addEventListener('scroll', measure, { passive: true });
  await nextTick();
  stage.value?.focus();
  wake();
});
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  frame = 0;
  window.removeEventListener('resize', measure);
  window.removeEventListener('scroll', measure);
  restoreUnderneath();
  // After the page is back, so the button can take focus again
  requestAnimationFrame(() => returnFocus?.focus?.());
});
</script>

<template>
  <Teleport to="body">
    <div
      ref="stage"
      class="holo-stage"
      role="dialog"
      aria-modal="true"
      :aria-label="`Holographic view of ${sub?.title || 'this gift'}`"
      tabindex="-1"
      @keydown="onKeydown"
      @click.self="emit('close')"
    >
      <button type="button" class="holo-close" aria-label="Close the holographic view" @click="emit('close')">
        <X :size="22" aria-hidden="true" />
      </button>

      <figure
        v-if="sub"
        ref="wrap"
        class="holo-wrap"
        @pointermove="onPointerMove"
        @pointerdown="onPointerDown"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @pointerleave="onPointerLeave"
      >
        <div ref="card" class="holo-card" :class="{ still: reduced }">
          <div class="art" :class="{ blurred: !foil }">
            <img :src="image" :alt="altText" draggable="false" />
            <div v-if="foil" class="foil" aria-hidden="true">
              <div ref="sheen" class="sheen" />
              <div ref="lamp" class="lamp"><div ref="stars" class="stars" :style="{ backgroundImage: sparkles }" /></div>
              <div ref="glare" class="glare" />
            </div>
            <div v-else class="warning">
              <p>Content warning: {{ sub.contentWarnings.join(', ') }}</p>
              <button type="button" class="btn btn-outline btn-sm" @click="revealed = true">Show it</button>
            </div>
          </div>
          <figcaption class="caption">
            <b>{{ sub.title || 'Untitled gift' }}</b>
            <span>
              by {{ nameOf(item.giver) }} for {{ nameOf(item.recipient) }}<template v-if="item.event"> · {{ item.event.name }}</template>
            </span>
          </figcaption>
        </div>
      </figure>

      <div class="holo-flip">
        <button type="button" :disabled="index <= 0" aria-label="Previous artwork" @click="go(-1)">
          <ArrowLeft :size="18" aria-hidden="true" />
        </button>
        <span aria-live="polite">{{ index + 1 }} / {{ items.length }}</span>
        <button type="button" :disabled="index >= items.length - 1" aria-label="Next artwork" @click="go(1)">
          <ArrowRight :size="18" aria-hidden="true" />
        </button>
      </div>
      <p class="holo-hint">Move over the card to tilt it · Shift + arrows to tilt · ← → to flip · Esc to close</p>
    </div>
  </Teleport>
</template>

<style scoped>
.holo-stage {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 16px;
  background: radial-gradient(circle at 50% 40%, #2a2433, #0b0a10 70%);
  outline: none;
}
.holo-close,
.holo-flip button {
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  cursor: pointer;
}
.holo-close {
  position: absolute;
  top: 16px;
  right: 20px;
  width: 44px;
  height: 44px;
}
.holo-flip {
  display: flex;
  align-items: center;
  gap: 14px;
  color: #e9e2f5;
  font-family: ui-monospace, monospace;
}
.holo-flip button {
  width: 40px;
  height: 40px;
}
.holo-flip button:disabled {
  opacity: 0.3;
  cursor: default;
}
.holo-close:focus-visible,
.holo-flip button:focus-visible {
  outline: 3px solid #f6a5c0;
  outline-offset: 2px;
}
.holo-hint {
  margin: 0;
  font-size: 0.8rem;
  color: #a99fb8;
  text-align: center;
}

.holo-wrap {
  margin: 0;
  padding: 24px;
  perspective: 1000px;
  touch-action: none;
}
/* Transform is set from script each frame; nothing else on the card changes */
.holo-card {
  position: relative;
  width: min(420px, 82vw, 62vh);
  padding: 14px 14px 0;
  border-radius: 22px;
  background: #fffaf3;
  box-shadow: 0 40px 90px rgba(0, 0, 0, 0.55);
  will-change: transform;
  user-select: none;
  isolation: isolate;
}
.holo-card.still {
  transform: none !important;
}
.art {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 14px;
  background: #ddd;
  transform: translateZ(0);
}
.art img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.art.blurred img {
  filter: blur(22px);
}
.foil {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
/* Oversized sheets, painted once and slid on the GPU */
.sheen {
  position: absolute;
  left: -50%;
  top: -50%;
  width: 200%;
  height: 200%;
  background: linear-gradient(115deg, #ff9bd2 0%, #ffe28a 14%, #9bffd9 28%, #8fc8ff 42%, #c9a2ff 56%, #ff9bd2 70%, #ffe28a 84%, #9bffd9 100%);
  mix-blend-mode: color-dodge;
  opacity: 0.1;
  will-change: transform, opacity;
}
.lamp {
  position: absolute;
  left: -50%;
  top: -50%;
  width: 200%;
  height: 200%;
  overflow: hidden;
  mix-blend-mode: screen;
  -webkit-mask-image: radial-gradient(circle at 50% 50%, #000 0%, rgba(0, 0, 0, 0.4) 18%, transparent 36%);
  mask-image: radial-gradient(circle at 50% 50%, #000 0%, rgba(0, 0, 0, 0.4) 18%, transparent 36%);
  will-change: transform, opacity;
}
.stars {
  position: absolute;
  inset: 0;
  background-size: 256px 256px;
  background-position: center;
  will-change: transform;
}
.glare {
  position: absolute;
  left: -50%;
  top: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0) 30%);
  mix-blend-mode: soft-light;
  will-change: transform, opacity;
}
.warning {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 20px;
  text-align: center;
  color: #fff;
  background: rgba(0, 0, 0, 0.35);
}
.caption {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 4px 14px;
  font-size: 0.85rem;
  color: #2f2d2b;
}
.caption b {
  font-size: 1.05rem;
}
.caption span {
  color: #6f645b;
}
</style>
