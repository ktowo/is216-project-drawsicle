<script setup>
import { computed, watch, onBeforeUnmount } from 'vue';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-vue-next';
import BaseModal from '@/components/ui/BaseModal.vue';
import { assetUrl } from '@/api';

// Full-size image viewer. images: [{ url, title, caption }]. Left/right arrow keys move between them.
const props = defineProps({
  open: { type: Boolean, default: false },
  images: { type: Array, default: () => [] },
  index: { type: Number, default: 0 },
});
const emit = defineEmits(['close', 'update:index']);

const count = computed(() => props.images.length);
const current = computed(() => props.images[Math.min(Math.max(props.index, 0), count.value - 1)] || null);
const src = computed(() => (current.value ? assetUrl(current.value.url) : ''));
// Browsers refuse to open data: images (used by the demo artwork) in a new tab, so only real URLs get the link
const openHref = computed(() => (/^https?:\/\//i.test(src.value) || /^\/(?!\/)/.test(src.value) ? src.value : ''));

function go(step) {
  if (count.value < 2) return;
  emit('update:index', (props.index + step + count.value) % count.value);
}

function onKey(e) {
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    go(1);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    go(-1);
  }
}

watch(
  () => props.open,
  (open, wasOpen) => {
    if (open) window.addEventListener('keydown', onKey);
    else if (wasOpen) window.removeEventListener('keydown', onKey);
  },
  { immediate: true }
);
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <BaseModal :open="open && Boolean(current)" :title="current?.title || 'Artwork'" size="lg" @close="emit('close')">
    <figure v-if="current" class="viewer">
      <div class="stage">
        <img :src="src" :alt="current.title ? `${current.title}, image ${index + 1}` : `Image ${index + 1}`" class="full" />
        <template v-if="count > 1">
          <button type="button" class="nav prev" aria-label="Previous image" @click="go(-1)">
            <ChevronLeft :size="22" />
          </button>
          <button type="button" class="nav next" aria-label="Next image" @click="go(1)">
            <ChevronRight :size="22" />
          </button>
        </template>
      </div>
      <figcaption class="caption">
        <span>{{ current.caption }}</span>
        <span class="caption-side">
          <span v-if="count > 1" aria-live="polite">{{ index + 1 }} of {{ count }}</span>
          <a v-if="openHref" :href="openHref" target="_blank" rel="noopener noreferrer" class="open-link">
            Open full size <ExternalLink :size="14" aria-hidden="true" />
          </a>
        </span>
      </figcaption>
      <p v-if="count > 1" class="hint keys">Tip: use the left and right arrow keys to move between images.</p>
    </figure>
  </BaseModal>
</template>

<style scoped>
.viewer {
  margin: 0;
}
.stage {
  position: relative;
  display: grid;
  place-items: center;
  background: var(--chip);
  border-radius: 16px;
  min-height: 240px;
  overflow: hidden;
}
.full {
  display: block;
  max-width: 100%;
  max-height: 68vh;
  object-fit: contain;
}
.nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: rgba(255, 253, 250, 0.92);
  color: var(--text);
  display: grid;
  place-items: center;
  cursor: pointer;
  box-shadow: var(--shadow);
}
.nav:hover {
  background: var(--surface);
  color: var(--pink-dark);
}
.nav:focus-visible {
  outline: 3px solid var(--pink);
  outline-offset: 2px;
}
.prev {
  left: 10px;
}
.next {
  right: 10px;
}
.caption {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 8px 16px;
  margin-top: 12px;
  color: var(--muted);
  font-size: 0.92rem;
}
.caption-side {
  display: inline-flex;
  align-items: center;
  gap: 14px;
}
.open-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
}
.keys {
  margin: 8px 0 0;
}
@media (hover: none) {
  .keys {
    display: none;
  }
}
</style>
