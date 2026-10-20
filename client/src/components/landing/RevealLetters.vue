<script setup>
import { ref, computed } from 'vue';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import PersonLink from '@/components/events/PersonLink.vue';
import { assetUrl } from '@/api';

// "Real gifts. Real thank-yous.": a fanned stack of letters, each leading with the recipient's
// thank-you note, then a small thumbnail of the gift, who it was for and who drew it. Only gifts
// both people agreed to show, with a note. Buttons, arrow keys and swipe; never moves on its own.
const props = defineProps({
  gifts: { type: Array, required: true },
});

const letters = computed(() => props.gifts.filter((g) => g.thanks?.message));
const index = ref(0);
const count = computed(() => letters.value.length);
const at = (offset) => letters.value[(index.value + offset + count.value) % count.value];

function next() {
  index.value = (index.value + 1) % count.value;
}
function prev() {
  index.value = (index.value - 1 + count.value) % count.value;
}
function onKey(e) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  // Keep the arrows to the stack: no page scroll, nothing else reacting
  e.preventDefault();
  e.stopPropagation();
  e.key === 'ArrowLeft' ? prev() : next();
}

// Swipe: a mostly horizontal drag of 40px or more turns the letter
let startX = null;
let startY = null;
function onPointerDown(e) {
  if (e.pointerType === 'mouse') return;
  startX = e.clientX;
  startY = e.clientY;
}
function onPointerUp(e) {
  if (startX === null) return;
  const dx = e.clientX - startX;
  const dy = e.clientY - startY;
  startX = null;
  if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy)) dx < 0 ? next() : prev();
}

const thumb = (g) => assetUrl(g.submission.thumbnails?.[0] || g.submission.images?.[0] || '');
const hasThumb = (g) => g.submission.type === 'art' && (g.submission.thumbnails?.[0] || g.submission.images?.[0]);
const warned = (g) => (g.submission.contentWarnings || []).length > 0;
</script>

<template>
  <section v-if="count" class="reveals" aria-labelledby="reveals-heading">
    <p class="eyebrow"><span class="dot" aria-hidden="true" /> After the reveal</p>
    <h2 id="reveals-heading" class="title">Real gifts. Real thank-yous.</h2>
    <p class="sub">Notes recipients wrote back, shared with both people's permission.</p>

    <div
      class="letters"
      :class="{ single: count === 1 }"
      tabindex="0"
      role="group"
      aria-roledescription="carousel"
      :aria-label="`Thank-you notes, ${index + 1} of ${count}. Use the arrow keys to turn.`"
      @keydown="onKey"
      @pointerdown="onPointerDown"
      @pointerup="onPointerUp"
      @pointercancel="startX = null"
    >
      <template v-if="count > 1">
        <div class="letter side left" aria-hidden="true" @click="prev">
          <blockquote class="note">{{ at(-1).thanks.message }}</blockquote>
        </div>
        <div class="letter side right" aria-hidden="true" @click="next">
          <blockquote class="note">{{ at(1).thanks.message }}</blockquote>
        </div>
      </template>
        <article :key="at(0).submission.id" class="letter front" aria-live="polite">
          <blockquote class="note">“{{ at(0).thanks.message }}”</blockquote>
          <div class="foot">
            <img
              v-if="hasThumb(at(0))"
              :src="thumb(at(0))"
              :alt="at(0).submission.imageDescriptions?.[0] || `${at(0).submission.title}, the gift`"
              :class="{ blurred: warned(at(0)) }"
              loading="lazy"
            />
            <div class="who">
              <p class="from">
                <PersonLink :user="at(0).recipient" :size="0" />, about <b>{{ at(0).submission.title }}</b>
              </p>
              <p class="by">
                Drawn by <PersonLink :user="at(0).giver" :size="0" />
                <template v-if="at(0).characterName"> for {{ at(0).characterName }}</template>
                · {{ at(0).event.name }}
              </p>
            </div>
          </div>
        </article>
    </div>

    <div v-if="count > 1" class="controls">
      <button type="button" class="nav" aria-label="Previous note" @click="prev"><ChevronLeft :size="18" /></button>
      <span class="counter" aria-hidden="true">{{ index + 1 }} / {{ count }}</span>
      <button type="button" class="nav" aria-label="Next note" @click="next"><ChevronRight :size="18" /></button>
    </div>
  </section>
</template>

<style scoped>
.reveals {
  max-width: 1120px;
  margin: 0 auto;
  padding: 72px 0 24px;
  text-align: center;
}
.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font: 700 0.78rem ui-monospace, monospace;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted);
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--pink);
  box-shadow: 0 0 10px var(--pink);
}
.title {
  margin: 10px 0 0;
  font-size: clamp(1.8rem, 4vw, 3rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.05;
}
.sub {
  margin: 10px 0 0;
  color: var(--muted);
}
.letters {
  position: relative;
  min-height: 360px;
  max-width: 900px;
  margin: 30px auto 0;
  outline: none;
  touch-action: pan-y;
}
.letters:focus-visible {
  box-shadow: var(--focus-ring);
  border-radius: 22px;
}
.letter {
  position: absolute;
  top: 0;
  left: 50%;
  width: min(520px, 100%);
  text-align: left;
  padding: 28px 30px 22px;
  border-radius: 22px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.14);
}
.letter.front {
  transform: translateX(-50%);
  z-index: 2;
}
.letter.side {
  top: 30px;
  opacity: 0.45;
  cursor: pointer;
  max-height: 280px;
  overflow: hidden;
  transition: transform 0.35s, opacity 0.35s;
}
.letter.left { transform: translateX(-120%) rotate(-4deg) scale(0.9); }
.letter.right { transform: translateX(20%) rotate(4deg) scale(0.9); }
.note {
  margin: 0;
  font-size: clamp(1.3rem, 2.6vw, 1.75rem);
  line-height: 1.35;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.foot {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 22px;
  padding-top: 16px;
  border-top: 1px dashed var(--border);
}
.foot img {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  object-fit: cover;
  flex-shrink: 0;
}
.foot img.blurred {
  filter: blur(8px);
}
.from {
  margin: 0;
  font-size: 0.95rem;
}
.by {
  margin: 2px 0 0;
  font-size: 0.8rem;
  color: var(--muted);
}
.controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 18px;
}
.nav {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.nav:hover {
  border-color: var(--pink);
}
.counter {
  font-family: ui-monospace, monospace;
  letter-spacing: 0.1em;
  color: var(--muted);
}
.letter.front { animation: turn 0.3s ease; }
@keyframes turn { from { opacity: 0; transform: translateX(-50%) translateY(10px); } }
@media (max-width: 700px) {
  .letter.side { display: none; }
  .letters { min-height: 400px; }
}
@media (prefers-reduced-motion: reduce) {
  .letter.side { transition: none; }
  .letter.front { animation: none; }
}
</style>
