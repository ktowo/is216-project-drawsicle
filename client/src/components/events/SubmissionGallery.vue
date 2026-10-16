<script setup>
import { ref, computed, nextTick } from 'vue';
import { RouterLink } from 'vue-router';
import { ArrowRight, ExternalLink, FileText, Palette, Gift, Images } from 'lucide-vue-next';
import ImageLightbox from './ImageLightbox.vue';
import ContentWarningGate from './ContentWarningGate.vue';
import WrappedPresent from './WrappedPresent.vue';
import PersonLink from './PersonLink.vue';
import ReportButton from '@/components/ReportButton.vue';
import { auth } from '@/stores/auth';
import { assetUrl } from '@/api';
import { safeUrl, linkHost, typeLabel } from '@/utils/events';
import { REACTIONS } from '@shared/constants.mjs';

// Every pair's gift after the reveal. items: [{ giver, recipient, submission | null, event? }]
// With event ({ id, name }) each tile also says which exchange it was for (artist profiles).
// wrapped: submission ids still shown as a wrapped present (the reveal page); unwrapping emits `unwrap`.
const props = defineProps({
  items: { type: Array, default: () => [] },
  wrapped: { type: Set, default: null },
});
const emit = defineEmits(['unwrap']);
const root = ref(null);

const isWrapped = (item) => Boolean(props.wrapped && item.submission && props.wrapped.has(item.submission.id));

const TYPE_ICONS = { writing: FileText, art: Palette, adoptable: Gift };

const lightboxOpen = ref(false);
const lightboxIndex = ref(0);

const nameOf = (user) => user?.displayName || 'Someone';
const reactionOf = (submission) => REACTIONS.find((r) => r.value === submission?.thanks?.reaction) || null;

// Submitted gifts first, then the ones that never arrived
const sorted = computed(() => [...props.items].sort((a, b) => Number(!a.submission) - Number(!b.submission)));

// One flat list so the arrow keys can move through every picture in the gallery
const allImages = computed(() => {
  const list = [];
  for (const item of sorted.value) {
    // Pictures of gifts still wrapped stay out, so the arrow keys can't spoil them
    if (isWrapped(item)) continue;
    (item.submission?.images || []).forEach((url, i) => {
      list.push({
        url,
        title: item.submission.title || 'Untitled gift',
        caption: `From ${nameOf(item.giver)} to ${nameOf(item.recipient)}`,
        alt: item.submission.imageDescriptions?.[i] || '',
      });
    });
  }
  return list;
});

const tiles = computed(() => {
  let offset = 0;
  return sorted.value.map((item, i) => {
    const wrapped = isWrapped(item);
    const images = wrapped ? [] : item.submission?.images || [];
    const tile = {
      wrapped,
      tone: i,
      key: item.submission?.id || `${item.giver?.id || 'g'}-${item.recipient?.id || 'r'}-${i}`,
      item,
      // The small copy for the tile; the lightbox opens the full image
      cover: item.submission?.thumbnails?.[0] || images[0] || null,
      imageCount: images.length,
      firstIndex: offset,
      links: (item.submission?.links || []).map((l) => ({ ...l, href: safeUrl(l.url) })).filter((l) => l.href),
      icon: TYPE_ICONS[item.submission?.type] || Palette,
    };
    offset += images.length;
    return tile;
  });
});

async function unwrap(tile) {
  emit('unwrap', tile.item.submission.id);
  // The present's button is gone now: put focus on what was inside
  await nextTick();
  const el = root.value?.querySelector(`[data-tile="${tile.key}"]`);
  (el?.querySelector('button.cover, a, button') || el)?.focus();
}

function open(tile) {
  if (!tile.imageCount) return;
  lightboxIndex.value = tile.firstIndex;
  lightboxOpen.value = true;
}
</script>

<template>
  <div ref="root">
    <ul class="gallery">
      <li
        v-for="tile in tiles"
        :key="tile.key"
        class="tile card"
        :class="{ missing: !tile.item.submission, wrapped: tile.wrapped }"
        :data-tile="tile.key"
        tabindex="-1"
      >
        <WrappedPresent
          v-if="tile.wrapped"
          :tone="tile.tone"
          :label="`Unwrap the gift for ${nameOf(tile.item.recipient)}`"
          :caption="`For ${nameOf(tile.item.recipient)}`"
          @opened="unwrap(tile)"
        />
        <template v-else>
          <ContentWarningGate v-if="tile.cover" :warnings="tile.item.submission.contentWarnings || []" compact>
            <button
              type="button"
              class="cover"
              :aria-label="`View ${tile.item.submission.title || 'gift'} from ${nameOf(tile.item.giver)} full size`"
              @click="open(tile)"
            >
              <img :src="assetUrl(tile.cover)" alt="" loading="lazy" />
              <span v-if="tile.imageCount > 1" class="more">
                <Images :size="14" aria-hidden="true" /> {{ tile.imageCount }}
              </span>
            </button>
          </ContentWarningGate>
          <div v-else class="cover placeholder" aria-hidden="true">
            <component :is="tile.item.submission ? tile.icon : Gift" :size="34" :stroke-width="1.6" />
          </div>
          <span
            v-if="reactionOf(tile.item.submission)"
            class="reaction"
            :title="`${nameOf(tile.item.recipient)}: ${reactionOf(tile.item.submission).label}`"
          >
            <span aria-hidden="true">{{ reactionOf(tile.item.submission).emoji }}</span>
            <span class="sr-only">{{ nameOf(tile.item.recipient) }} reacted: {{ reactionOf(tile.item.submission).label }}</span>
          </span>

          <div class="tile-body">
            <template v-if="tile.item.submission">
              <p class="tile-title">{{ tile.item.submission.title || 'Untitled gift' }}</p>
              <span class="type">{{ typeLabel(tile.item.submission.type) }}</span>
            </template>
            <p v-else class="tile-title muted">No gift submitted</p>

            <p class="pair">
              <PersonLink :user="tile.item.giver" :size="22" class="person" />
              <ArrowRight :size="14" class="arrow" aria-hidden="true" />
              <span class="sr-only">made a gift for</span>
              <PersonLink :user="tile.item.recipient" :size="22" class="person" />
            </p>

            <p v-if="tile.item.event" class="for-event">
              For <RouterLink :to="`/events/${tile.item.event.id}`">{{ tile.item.event.name }}</RouterLink>
            </p>

            <ul v-if="tile.links.length" class="links">
              <li v-for="link in tile.links" :key="link.href">
                <a :href="link.href" target="_blank" rel="noopener noreferrer">
                  <ExternalLink :size="13" aria-hidden="true" />
                  {{ link.label || linkHost(link.href) }}
                </a>
              </li>
            </ul>

            <ReportButton
              v-if="tile.item.submission"
              target-type="submission"
              :target-id="tile.item.submission.id"
              :what="`the gift from ${tile.item.giver?.displayName || 'this artist'}`"
              :own="Boolean(auth.user && tile.item.giver?.id === auth.user.id)"
              look="link"
              class="tile-report"
            />
          </div>
        </template>
      </li>
    </ul>

    <ImageLightbox v-model:index="lightboxIndex" :open="lightboxOpen" :images="allImages" @close="lightboxOpen = false" />
  </div>
</template>

<style scoped>
.tile.wrapped {
  border-style: dashed;
  overflow: hidden;
}
.tile:focus {
  outline: none;
}
.tile:focus-visible {
  outline: 3px solid var(--pink);
}
.gallery {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 18px;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}
@media (max-width: 480px) {
  .gallery {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
}
.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}
.tile.missing {
  opacity: 0.75;
}
.reaction {
  position: absolute;
  top: 8px;
  left: 8px;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: var(--shadow);
  font-size: 1.1rem;
}
.cover {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  padding: 0;
  border: 0;
  background: var(--chip);
  overflow: hidden;
}
button.cover {
  cursor: zoom-in;
}
button.cover:focus-visible {
  outline: 3px solid var(--pink);
  outline-offset: -3px;
}
.cover img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.2s;
}
button.cover:hover img {
  transform: scale(1.03);
}
.placeholder {
  display: grid;
  place-items: center;
  color: var(--muted);
  background: linear-gradient(135deg, var(--surface-2), var(--pink-soft));
}
.more {
  position: absolute;
  right: 8px;
  bottom: 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(47, 45, 43, 0.72);
  color: #fff;
  font-size: 0.8rem;
  font-weight: 600;
}
.tile-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px 14px;
  min-width: 0;
}
.tile-title {
  margin: 0;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.muted {
  color: var(--muted);
}
.type {
  align-self: flex-start;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 1px 9px;
  border-radius: 999px;
  background: var(--chip);
  color: var(--muted);
}
.pair {
  margin: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 0.85rem;
}
.person {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
}
.person :deep(.person-name) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.arrow {
  color: var(--pink);
  flex-shrink: 0;
}
.links {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.85rem;
}
.links a {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) {
  .cover img {
    transition: none;
  }
}
.for-event {
  margin: 6px 0 0;
  font-size: 0.85rem;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
