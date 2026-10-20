<script setup>
import { ref, computed } from 'vue';
import { RouterLink } from 'vue-router';
import { CARD_COLORS } from '@shared/taste.mjs';
import { assetUrl } from '@/api';
import { galleryTiles } from '@/utils/showcase';
import { userProfileLink } from '@/utils/events';
import { useSpotlight } from '@/composables/useSpotlight';

// "The gallery": revealed gifts both people agreed to show, on a full-width dark band. Each tile
// lights up under the cursor in its artist's card colour and links to the artist's profile.
// Content-warned gifts stay blurred.
const props = defineProps({
  gifts: { type: Array, required: true },
});

const DEFAULT_COLOUR = CARD_COLORS[0].swatch;
const colourOf = (value) => CARD_COLORS.find((c) => c.value === value)?.swatch || DEFAULT_COLOUR;
const nameOf = (u) => u?.displayName || u?.username || 'Someone';

const tiles = computed(() =>
  galleryTiles(props.gifts.filter((g) => g.submission.type === 'art')).map((t) => ({
    ...t,
    src: assetUrl(t.image),
    colour: colourOf(t.gift.giver?.cardColor),
    to: userProfileLink(t.gift.giver),
    warned: (t.gift.submission.contentWarnings || []).length > 0,
    forWhom: t.gift.characterName ? `${nameOf(t.gift.recipient)}'s ${t.gift.characterName}` : nameOf(t.gift.recipient),
  })),
);

const grid = ref(null);
useSpotlight(grid);
</script>

<template>
  <section v-if="tiles.length" class="gallery" aria-labelledby="gallery-heading">
    <div class="inner">
      <p class="eyebrow"><span class="dot" aria-hidden="true" /> The gallery</p>
      <h2 id="gallery-heading" class="title">Made for someone, shown with permission.</h2>
      <ul ref="grid" class="grid">
        <li v-for="t in tiles" :key="t.key" data-spot class="spot" :style="{ '--c': t.colour }">
          <component :is="t.to ? RouterLink : 'div'" :to="t.to || undefined" class="link" :tabindex="t.to ? undefined : 0">
            <img :src="t.src" :alt="t.alt" :class="{ blurred: t.warned }" loading="lazy" />
            <span v-if="t.warned" class="cw">Content warning</span>
            <span class="cap">
              <b>{{ t.gift.submission.title }}</b>
              <span>For {{ t.forWhom }} · by {{ nameOf(t.gift.giver) }}</span>
            </span>
          </component>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.gallery {
  position: relative;
  margin: 56px -16px 0;
  padding: 72px 16px 64px;
  background: #0d0c12;
  color: #f3eee8;
}
.inner {
  max-width: 1120px;
  margin: 0 auto;
}
.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font: 700 0.78rem ui-monospace, monospace;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #b3a99e;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f6c945;
  box-shadow: 0 0 10px #f6c945;
}
.title {
  margin: 10px 0 0;
  font-size: clamp(1.8rem, 4vw, 3rem);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.05;
  color: #f3eee8;
}
.grid {
  list-style: none;
  padding: 0;
  margin: 28px 0 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}
.spot {
  position: relative;
  aspect-ratio: 1;
  border-radius: 18px;
  overflow: hidden;
  background: #17151f;
  border: 1px solid rgba(255, 255, 255, 0.07);
}
.link {
  display: block;
  width: 100%;
  height: 100%;
  color: #fff;
  outline: none;
}
.link:focus-visible {
  box-shadow: inset 0 0 0 3px var(--c);
  border-radius: 18px;
}
.spot img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.45;
  filter: saturate(0.55) brightness(0.85);
  transition: opacity 0.3s, filter 0.3s, transform 0.4s;
}
.spot img.blurred,
.spot:hover img.blurred {
  filter: blur(18px) brightness(0.7);
}
.spot::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(280px circle at var(--spot-x, -999px) var(--spot-y, -999px), color-mix(in srgb, var(--c) 35%, transparent), transparent 60%);
  mix-blend-mode: screen;
}
.spot::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 2px;
  background: radial-gradient(220px circle at var(--spot-x, -999px) var(--spot-y, -999px), var(--c), transparent 60%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  z-index: 2;
  pointer-events: none;
}
.spot:hover img:not(.blurred),
.spot:focus-within img:not(.blurred) {
  opacity: 1;
  filter: none;
  transform: scale(1.04);
}
.cw {
  position: absolute;
  top: 12px;
  left: 12px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.6);
  font-size: 0.72rem;
  font-weight: 700;
}
.cap {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 30px 12px 12px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.85));
  display: flex;
  flex-direction: column;
  font-size: 0.82rem;
  opacity: 0;
  transition: opacity 0.25s;
}
.spot:hover .cap,
.spot:focus-within .cap {
  opacity: 1;
}
@media (hover: none) {
  .cap { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .spot img, .cap { transition: none; }
  .spot img:not(.blurred) { opacity: 1; filter: none; }
  .spot::before, .spot::after { display: none; }
}
</style>
