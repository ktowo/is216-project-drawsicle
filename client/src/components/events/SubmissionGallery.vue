<script setup>
import { ref, computed } from 'vue';
import { ArrowRight, ExternalLink, FileText, Palette, Gift, Images } from 'lucide-vue-next';
import ImageLightbox from './ImageLightbox.vue';
import UserAvatar from '@/components/UserAvatar.vue';
import { assetUrl } from '@/api';
import { safeUrl, linkHost, typeLabel } from '@/utils/events';

// Every pair's gift after the reveal. items: [{ giver, recipient, submission | null }]
const props = defineProps({
  items: { type: Array, default: () => [] },
});

const TYPE_ICONS = { writing: FileText, art: Palette, adoptable: Gift };

const lightboxOpen = ref(false);
const lightboxIndex = ref(0);

const avatarUser = (user) => ({ ...(user || {}), avatarUrl: user?.avatarUrl ? assetUrl(user.avatarUrl) : null });
const nameOf = (user) => user?.displayName || 'Someone';

// Submitted gifts first, then the ones that never arrived
const sorted = computed(() => [...props.items].sort((a, b) => Number(!a.submission) - Number(!b.submission)));

// One flat list so the arrow keys can move through every picture in the gallery
const allImages = computed(() => {
  const list = [];
  for (const item of sorted.value) {
    for (const url of item.submission?.images || []) {
      list.push({
        url,
        title: item.submission.title || 'Untitled gift',
        caption: `From ${nameOf(item.giver)} to ${nameOf(item.recipient)}`,
      });
    }
  }
  return list;
});

const tiles = computed(() => {
  let offset = 0;
  return sorted.value.map((item, i) => {
    const images = item.submission?.images || [];
    const tile = {
      key: item.submission?.id || `${item.giver?.id || 'g'}-${item.recipient?.id || 'r'}-${i}`,
      item,
      cover: images[0] || null,
      imageCount: images.length,
      firstIndex: offset,
      links: (item.submission?.links || []).map((l) => ({ ...l, href: safeUrl(l.url) })).filter((l) => l.href),
      icon: TYPE_ICONS[item.submission?.type] || Palette,
    };
    offset += images.length;
    return tile;
  });
});

function open(tile) {
  if (!tile.imageCount) return;
  lightboxIndex.value = tile.firstIndex;
  lightboxOpen.value = true;
}
</script>

<template>
  <div>
    <ul class="gallery">
      <li v-for="tile in tiles" :key="tile.key" class="tile card" :class="{ missing: !tile.item.submission }">
        <button
          v-if="tile.cover"
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
        <div v-else class="cover placeholder" aria-hidden="true">
          <component :is="tile.item.submission ? tile.icon : Gift" :size="34" :stroke-width="1.6" />
        </div>

        <div class="tile-body">
          <template v-if="tile.item.submission">
            <p class="tile-title">{{ tile.item.submission.title || 'Untitled gift' }}</p>
            <span class="type">{{ typeLabel(tile.item.submission.type) }}</span>
          </template>
          <p v-else class="tile-title muted">No gift submitted</p>

          <p class="pair">
            <span class="person">
              <UserAvatar :user="avatarUser(tile.item.giver)" :size="22" />
              <span class="person-name">{{ nameOf(tile.item.giver) }}</span>
            </span>
            <ArrowRight :size="14" class="arrow" aria-hidden="true" />
            <span class="sr-only">made a gift for</span>
            <span class="person">
              <UserAvatar :user="avatarUser(tile.item.recipient)" :size="22" />
              <span class="person-name">{{ nameOf(tile.item.recipient) }}</span>
            </span>
          </p>

          <ul v-if="tile.links.length" class="links">
            <li v-for="link in tile.links" :key="link.href">
              <a :href="link.href" target="_blank" rel="noopener noreferrer">
                <ExternalLink :size="13" aria-hidden="true" />
                {{ link.label || linkHost(link.href) }}
              </a>
            </li>
          </ul>
        </div>
      </li>
    </ul>

    <ImageLightbox v-model:index="lightboxIndex" :open="lightboxOpen" :images="allImages" @close="lightboxOpen = false" />
  </div>
</template>

<style scoped>
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
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}
.tile.missing {
  opacity: 0.75;
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
.person-name {
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
</style>
