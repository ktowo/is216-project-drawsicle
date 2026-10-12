<script setup>
import { ref, computed, onBeforeUnmount, useId } from 'vue';
import { ImagePlus, Trash2, Loader2 } from 'lucide-vue-next';
import EventBanner from '@/components/events/EventBanner.vue';
import { api } from '@/api';
import { toast } from '@/stores/toast';
import { prepareImage, totalBytes, MAX_UPLOAD_REQUEST_BYTES } from '@/utils/images';
import { BANNER_TYPES } from './helpers';

// Upload / replace / remove an event's banner. Emits the updated event from the server.
// Big photos are shrunk in the browser first, so uploads stay under the hosting request limit.
const props = defineProps({
  event: { type: Object, required: true },
  disabled: { type: Boolean, default: false },
  height: { type: Number, default: 170 },
});
const emit = defineEmits(['updated']);

const inputId = `banner-${useId()}`;
const errorId = `${inputId}-error`;
const fileInput = ref(null);
const previewUrl = ref('');
const preparing = ref(false);
const uploading = ref(false);
const removing = ref(false);
const error = ref('');

const maxMb = Math.floor(MAX_UPLOAD_REQUEST_BYTES / (1024 * 1024));
const busy = computed(() => preparing.value || uploading.value || removing.value);
const busyText = computed(() => {
  if (preparing.value) return 'Preparing image…';
  if (uploading.value) return 'Uploading…';
  return 'Removing…';
});

function clearPreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = '';
}
onBeforeUnmount(clearPreview);

function choose() {
  fileInput.value?.click();
}

function uploadMessage(err) {
  if (err.status === 413) return `That image is too big to upload. Try one under ${maxMb} MB.`;
  return err.message;
}

async function onFileChosen(e) {
  const picked = e.target.files?.[0];
  e.target.value = ''; // so picking the same file again still fires change
  if (!picked) return;

  error.value = '';
  let file;
  preparing.value = true;
  try {
    file = await prepareImage(picked);
  } catch (err) {
    error.value = err?.message || "That image couldn't be read. Try a different one.";
    return;
  } finally {
    preparing.value = false;
  }
  // GIFs are sent as they are, so a large one can still be over the limit
  if (totalBytes([file]) > MAX_UPLOAD_REQUEST_BYTES) {
    error.value = `That image is too big to upload (max ${maxMb} MB). Try a smaller file or a PNG/JPG instead of a GIF.`;
    return;
  }

  clearPreview();
  previewUrl.value = URL.createObjectURL(file);
  const form = new FormData();
  form.append('banner', file);
  uploading.value = true;
  try {
    const { event } = await api(`/events/${props.event.id}/banner`, { method: 'POST', form });
    emit('updated', event);
    toast.success('Banner updated.');
  } catch (err) {
    error.value = uploadMessage(err);
  } finally {
    uploading.value = false;
    clearPreview();
  }
}

async function remove() {
  error.value = '';
  removing.value = true;
  try {
    const { event } = await api(`/events/${props.event.id}/banner`, { method: 'DELETE' });
    emit('updated', event);
    toast.success('Banner removed.');
  } catch (err) {
    error.value = err.message;
  } finally {
    removing.value = false;
  }
}
</script>

<template>
  <div class="banner-uploader">
    <div class="preview" :style="{ height: `${height}px` }">
      <img v-if="previewUrl" :src="previewUrl" alt="New banner preview" class="preview-img" />
      <EventBanner v-else :event="event" :height="height" />
      <div v-if="busy" class="overlay" role="status" aria-live="polite">
        <Loader2 :size="22" class="spin" aria-hidden="true" />
        <span>{{ busyText }}</span>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2.5 mt-3.5">
      <input
        :id="inputId"
        ref="fileInput"
        type="file"
        :accept="BANNER_TYPES.join(',')"
        class="sr-only"
        tabindex="-1"
        aria-hidden="true"
        @change="onFileChosen"
      />
      <button
        type="button"
        class="btn btn-outline btn-sm"
        :disabled="disabled || busy"
        :aria-describedby="error ? errorId : undefined"
        @click="choose"
      >
        <ImagePlus :size="16" aria-hidden="true" />
        {{ event.bannerUrl ? 'Replace banner' : 'Upload banner' }}
      </button>
      <button
        v-if="event.bannerUrl"
        type="button"
        class="btn btn-ghost btn-sm btn-danger-text"
        :disabled="disabled || busy"
        @click="remove"
      >
        <Trash2 :size="16" aria-hidden="true" /> Remove
      </button>
    </div>
    <p class="hint m-0 mt-2">
      PNG, JPG, WebP or GIF. Large photos are resized for you. Wide images (about 3:1) look best.
    </p>
    <p v-if="error" :id="errorId" class="field-error m-0 mt-2" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.preview {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  background: var(--chip);
}
.preview-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: color-mix(in srgb, var(--surface) 72%, transparent);
  color: var(--text);
  font-weight: 600;
}
.overlay :deep(svg) {
  color: var(--pink);
}
</style>
