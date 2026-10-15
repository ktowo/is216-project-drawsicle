<script setup>
import { ref, computed } from 'vue';
import { ExternalLink, ImageOff } from 'lucide-vue-next';
import ImageLightbox from './ImageLightbox.vue';
import ContentWarningGate from './ContentWarningGate.vue';
import { assetUrl } from '@/api';
import { safeUrl, linkHost, typeLabel } from '@/utils/events';
import { formatDateTime } from '@/utils/format';

// Read-only view of one submitted gift: pictures (click for full size), message and links.
const props = defineProps({
  submission: { type: Object, required: true },
  caption: { type: String, default: '' }, // shown under the full-size image, e.g. "From Mika to Jun"
  showTitle: { type: Boolean, default: true },
  showMeta: { type: Boolean, default: false }, // submitted date, late flag
});

const lightboxOpen = ref(false);
const lightboxIndex = ref(0);
const brokenImages = ref(new Set());

const images = computed(() =>
  (props.submission.images || []).map((url, i) => ({
    url,
    title: props.submission.title || 'Untitled gift',
    caption: props.caption,
    alt: props.submission.imageDescriptions?.[i] || '',
  }))
);

const links = computed(() =>
  (props.submission.links || [])
    .map((l) => ({ ...l, href: safeUrl(l.url) }))
    .filter((l) => l.href)
);

function openImage(i) {
  lightboxIndex.value = i;
  lightboxOpen.value = true;
}

function markBroken(i) {
  brokenImages.value = new Set([...brokenImages.value, i]);
}
</script>

<template>
  <div class="submission">
    <ContentWarningGate v-if="images.length" :warnings="submission.contentWarnings || []">
    <div class="images" :class="`count-${Math.min(images.length, 4)}`">
      <button
        v-for="(img, i) in images"
        :key="img.url"
        type="button"
        class="thumb"
        :aria-label="`View image ${i + 1} of ${images.length} full size`"
        @click="openImage(i)"
      >
        <span v-if="brokenImages.has(i)" class="broken">
          <ImageOff :size="22" aria-hidden="true" />
          <span>Image unavailable</span>
        </span>
        <img v-else :src="assetUrl(img.url)" :alt="img.alt" loading="lazy" @error="markBroken(i)" />
      </button>
    </div>
    </ContentWarningGate>

    <div class="text">
      <div v-if="showTitle || submission.type" class="title-row">
        <h4 v-if="showTitle" class="title">{{ submission.title || 'Untitled gift' }}</h4>
        <span v-if="submission.type" class="type-pill">{{ typeLabel(submission.type) }}</span>
      </div>
      <p v-if="submission.message" class="message">{{ submission.message }}</p>

      <ul v-if="links.length" class="links">
        <li v-for="link in links" :key="link.href">
          <a :href="link.href" target="_blank" rel="noopener noreferrer" class="link">
            <ExternalLink :size="15" aria-hidden="true" />
            <span>{{ link.label || linkHost(link.href) }}</span>
          </a>
        </li>
      </ul>

      <p v-if="showMeta && submission.submittedAt" class="meta">
        Submitted {{ formatDateTime(submission.submittedAt) }}
        <span v-if="submission.late" class="late">· late</span>
      </p>
    </div>

    <ImageLightbox v-model:index="lightboxIndex" :open="lightboxOpen" :images="images" @close="lightboxOpen = false" />
  </div>
</template>

<style scoped>
.submission {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.images {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.images.count-1 {
  grid-template-columns: minmax(0, 1fr);
}
.images.count-3 .thumb:first-child {
  grid-column: span 2;
}
.thumb {
  display: block;
  padding: 0;
  border: 0;
  border-radius: 14px;
  overflow: hidden;
  background: var(--chip);
  cursor: zoom-in;
  aspect-ratio: 4 / 3;
}
.count-1 .thumb {
  aspect-ratio: auto;
  max-height: 420px;
}
.thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.2s;
}
.count-1 .thumb img {
  object-fit: contain;
  max-height: 420px;
}
.thumb:hover img {
  transform: scale(1.02);
}
.thumb:focus-visible {
  outline: 3px solid var(--pink);
  outline-offset: 2px;
}
.broken {
  height: 100%;
  min-height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--muted);
  font-size: 0.85rem;
}
.text {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}
.title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.25rem;
  overflow-wrap: anywhere;
}
.type-pill {
  font-size: 0.8rem;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--chip);
  color: var(--muted);
}
.message {
  margin: 0;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.links {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  font-weight: 600;
  font-size: 0.9rem;
  max-width: 100%;
}
.link span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  margin: 0;
  font-size: 0.85rem;
  color: var(--muted);
}
.late {
  color: var(--warning, var(--warning));
  font-weight: 600;
}
@media (prefers-reduced-motion: reduce) {
  .thumb img {
    transition: none;
  }
}
</style>
