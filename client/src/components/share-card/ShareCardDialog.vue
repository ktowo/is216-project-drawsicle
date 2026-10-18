<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { Download, Share2, Link2, Lock } from 'lucide-vue-next';
import BaseModal from '@/components/ui/BaseModal.vue';
import { assetUrl } from '@/api';
import { copyText } from '@/utils/events';
import { CARD_SIZES } from '@/utils/shareCard';
import { toast } from '@/stores/toast';
import { drawShareCard, loadBanner, canvasToPng } from './drawShareCard';

// A ready-made image of the event to post anywhere (docs/specs/share-card.md): Story or Wide,
// downloaded, shared as a picture where the device can, or just the link copied.
//   <ShareCardDialog :open="cardOpen" :event="event" :url="shareUrl" :private-event="isPrivate" @close="cardOpen = false" />
const props = defineProps({
  open: { type: Boolean, default: false },
  event: { type: Object, required: true },
  url: { type: String, required: true },
  privateEvent: { type: Boolean, default: false },
});
const emit = defineEmits(['close']);

const size = ref('story');
const canvas = ref(null);
const summary = ref('');
const busy = ref(false);
let banner = null; // loaded image, or null for the seasonal colours
let bannerFor = '';

function draw() {
  if (!canvas.value) return;
  const card = drawShareCard(canvas.value, { event: props.event, size: size.value, url: props.url, banner });
  summary.value = card ? card.summary : '';
}

async function render() {
  const src = props.event.bannerUrl ? assetUrl(props.event.bannerUrl) : '';
  if (src !== bannerFor) {
    bannerFor = src;
    banner = await loadBanner(src);
  }
  await document.fonts?.ready;
  await nextTick();
  draw();
}

watch(
  () => [props.open, size.value, props.event, props.url],
  () => {
    if (props.open) render();
  },
  { immediate: true }
);

// The PNG, falling back to the seasonal colours if the banner made the canvas unreadable
async function png() {
  try {
    return await canvasToPng(canvas.value);
  } catch {
    banner = null;
    draw();
    return canvasToPng(canvas.value);
  }
}

const fileName = computed(() => {
  const slug = (props.event.name || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'event';
  return `${slug}-${size.value}.png`;
});

async function download() {
  if (busy.value) return;
  busy.value = true;
  try {
    const blob = await png();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName.value;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    toast.success('Card downloaded.');
  } catch {
    toast.error("Couldn't make the image. Try again, or copy the link instead.");
  } finally {
    busy.value = false;
  }
}

// Only offered where the browser says it can share image files (mostly phones and Safari)
const canShareFiles = computed(() => {
  try {
    const probe = new File([new Blob()], 'card.png', { type: 'image/png' });
    return typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
});

async function shareImage() {
  if (busy.value) return;
  busy.value = true;
  try {
    const file = new File([await png()], fileName.value, { type: 'image/png' });
    await navigator.share({ files: [file], title: props.event.name, text: props.url });
  } catch (err) {
    if (err?.name !== 'AbortError') toast.error("Couldn't share the image. You can download it instead.");
  } finally {
    busy.value = false;
  }
}

async function copyLink() {
  if (await copyText(props.url)) toast.success(props.privateEvent ? 'Invite link copied.' : 'Link copied.');
  else toast.error("Couldn't copy the link. You can copy it from the address bar instead.");
}
</script>

<template>
  <BaseModal :open="open" title="Share card" size="lg" @close="emit('close')">
    <div class="share-card">
      <div class="size-switch" role="radiogroup" aria-label="Card size">
        <button
          v-for="(s, key) in CARD_SIZES"
          :key="key"
          type="button"
          role="radio"
          :aria-checked="size === key ? 'true' : 'false'"
          :class="{ on: size === key }"
          @click="size = key"
        >
          {{ s.label }} <small>{{ s.width }}×{{ s.height }}</small>
        </button>
      </div>

      <div class="preview" :class="size">
        <canvas ref="canvas" role="img" :aria-label="summary" />
      </div>

      <p v-if="privateEvent" class="private-note">
        <Lock :size="14" aria-hidden="true" /> This card holds the invite link: anyone who sees it can open the event.
      </p>
    </div>

    <template #footer>
      <button type="button" class="btn btn-ghost" @click="copyLink"><Link2 :size="16" aria-hidden="true" /> Copy link</button>
      <button v-if="canShareFiles" type="button" class="btn btn-outline" :disabled="busy" @click="shareImage">
        <Share2 :size="16" aria-hidden="true" /> Share image
      </button>
      <button type="button" class="btn btn-primary" :disabled="busy" @click="download">
        <Download :size="16" aria-hidden="true" /> Download PNG
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.share-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.size-switch {
  display: inline-flex;
  align-self: flex-start;
  padding: 4px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
}
.size-switch button {
  border: 0;
  background: none;
  padding: 7px 14px;
  border-radius: 999px;
  font-weight: 700;
  color: var(--muted);
  cursor: pointer;
}
.size-switch button small {
  font-weight: 500;
  opacity: 0.8;
}
.size-switch button.on {
  background: var(--pink);
  color: #fff;
}
.preview {
  display: flex;
  justify-content: center;
}
.preview canvas {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: 10px;
  box-shadow: 0 14px 40px rgba(60, 40, 20, 0.18);
}
.preview.story canvas {
  max-height: min(62vh, 560px);
  width: auto;
}
.private-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
}
</style>
