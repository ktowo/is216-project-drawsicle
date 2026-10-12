<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { ImagePlus, X, Upload, LoaderCircle } from 'lucide-vue-next';
import { LIMITS } from '@shared/constants.mjs';
import { assetUrl } from '@/api';
import {
  MAX_UPLOAD_REQUEST_BYTES,
  IMAGE_ACCEPT,
  isAcceptedImage,
  prepareImage,
  totalBytes,
  formatBytes,
} from '@/utils/images';

// Pictures for a submission: images already uploaded (URLs) plus new files picked here.
// New files are shrunk with prepareImage() as they are added, and the new files together
// must fit in one upload request (MAX_UPLOAD_REQUEST_BYTES).
//   <ImageUploader v-model:existing="keepImages" v-model:files="newFiles" v-model:busy="preparing" />
const props = defineProps({
  max: { type: Number, default: LIMITS.submissionImages },
  maxRequestBytes: { type: Number, default: MAX_UPLOAD_REQUEST_BYTES },
  disabled: { type: Boolean, default: false },
  id: { type: String, default: 'image-uploader' },
  describedBy: { type: String, default: undefined },
});

const existing = defineModel('existing', { type: Array, default: () => [] });
const files = defineModel('files', { type: Array, default: () => [] });
// True while picked files are being shrunk, so the form can wait before sending
const busy = defineModel('busy', { type: Boolean, default: false });

const input = ref(null);
const dragging = ref(false);
const problems = ref([]);
const previews = ref([]); // [{ file, url }]
const preparingCount = ref(0);

// Original file -> what it became, so picking the same photo twice is caught
const sourceOf = new WeakMap();
const signature = (file) => `${file.name}:${file.size}:${file.lastModified}`;

const total = computed(() => existing.value.length + files.value.length + preparingCount.value);
const remaining = computed(() => Math.max(0, props.max - total.value));
const newBytes = computed(() => totalBytes(files.value));
const requestLabel = computed(() => formatBytes(props.maxRequestBytes));
let unmounted = false;

// Keep one object URL per picked file, and free the ones no longer shown
watch(
  files,
  (list) => {
    const kept = [];
    for (const preview of previews.value) {
      if (list.includes(preview.file)) kept.push(preview);
      else URL.revokeObjectURL(preview.url);
    }
    for (const file of list) {
      if (!kept.some((p) => p.file === file)) kept.push({ file, url: URL.createObjectURL(file) });
    }
    previews.value = list.map((file) => kept.find((p) => p.file === file));
  },
  { immediate: true }
);

// The form was saved or reset: old warnings no longer apply
watch(
  () => files.value.length,
  (length, before) => {
    if (length === 0 && before > 0 && !busy.value) problems.value = [];
  }
);

onBeforeUnmount(() => {
  unmounted = true;
  for (const preview of previews.value) URL.revokeObjectURL(preview.url);
});

async function addFiles(list) {
  if (props.disabled || busy.value) return;
  const incoming = Array.from(list || []);
  if (!incoming.length) return;
  const issues = [];
  const picked = [];
  const seen = new Set(files.value.map((f) => sourceOf.get(f) || signature(f)));
  let skipped = 0;

  for (const file of incoming) {
    if (!isAcceptedImage(file)) {
      issues.push(`${file.name} isn't a PNG, JPG, WebP or GIF image.`);
    } else if (seen.has(signature(file))) {
      issues.push(`${file.name} is already added.`);
    } else if (picked.length >= remaining.value) {
      skipped++;
    } else {
      seen.add(signature(file));
      picked.push(file);
    }
  }
  if (skipped) {
    issues.push(`You can add up to ${props.max} images in total, so ${skipped === 1 ? '1 image was' : `${skipped} images were`} left out.`);
  }

  problems.value = issues;
  if (!picked.length) return;

  busy.value = true;
  preparingCount.value = picked.length;
  const ready = [];
  try {
    for (const file of picked) {
      try {
        const prepared = await prepareImage(file);
        sourceOf.set(prepared, signature(file));
        ready.push({ file: prepared, name: file.name });
      } catch (e) {
        issues.push(e.message);
      }
      preparingCount.value -= 1;
    }
  } finally {
    preparingCount.value = 0;
    busy.value = false;
  }
  if (unmounted) return;

  // Everything new goes up in one request, which has a size cap when hosted
  const accepted = [];
  let running = totalBytes(files.value);
  for (const { file, name } of ready) {
    if (running + file.size > props.maxRequestBytes) {
      issues.push(
        `${name} (${formatBytes(file.size)} after shrinking) would take this upload over ${requestLabel.value} in total. Save what you have first, then add it.`
      );
    } else {
      running += file.size;
      accepted.push(file);
    }
  }

  problems.value = [...issues];
  if (accepted.length) files.value = [...files.value, ...accepted];
}

function onPick(e) {
  addFiles(e.target.files);
  e.target.value = ''; // lets the same file be picked again after removing it
}

function onDrop(e) {
  dragging.value = false;
  addFiles(e.dataTransfer?.files);
}

function onDragOver(e) {
  if (props.disabled || busy.value) return;
  e.dataTransfer.dropEffect = 'copy';
  dragging.value = true;
}

function onDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) dragging.value = false;
}

function removeExisting(url) {
  existing.value = existing.value.filter((u) => u !== url);
  problems.value = [];
}

function removeFile(file) {
  files.value = files.value.filter((f) => f !== file);
  problems.value = [];
}

defineExpose({ open: () => input.value?.click() });
</script>

<template>
  <div class="uploader">
    <ul v-if="total" class="previews" aria-label="Images in this submission">
      <li v-for="(url, i) in existing" :key="url" class="preview">
        <img :src="assetUrl(url)" :alt="`Uploaded image ${i + 1}`" />
        <span class="tag">Uploaded</span>
        <button
          v-if="!disabled"
          type="button"
          class="remove"
          :aria-label="`Remove uploaded image ${i + 1}`"
          @click="removeExisting(url)"
        >
          <X :size="16" />
        </button>
      </li>
      <li v-for="p in previews" :key="p.url" class="preview">
        <img :src="p.url" :alt="p.file.name" />
        <span class="tag new" :title="p.file.name">{{ formatBytes(p.file.size) }}</span>
        <button
          v-if="!disabled"
          type="button"
          class="remove"
          :aria-label="`Remove ${p.file.name}`"
          @click="removeFile(p.file)"
        >
          <X :size="16" />
        </button>
      </li>
    </ul>

    <div
      v-if="!disabled && (remaining > 0 || busy)"
      class="dropzone"
      :class="{ dragging, busy }"
      :aria-busy="busy ? 'true' : undefined"
      @dragenter.prevent="onDragOver"
      @dragover.prevent="onDragOver"
      @dragleave="onDragLeave"
      @drop.prevent="onDrop"
    >
      <span class="drop-icon" aria-hidden="true">
        <LoaderCircle v-if="busy" :size="26" class="spin" />
        <component :is="dragging ? Upload : ImagePlus" v-else :size="26" />
      </span>
      <p v-if="busy" class="drop-text" role="status">
        <strong>Getting {{ preparingCount === 1 ? 'your image' : 'your images' }} ready…</strong>
      </p>
      <p v-else class="drop-text">
        <strong>Drag images here</strong> or
        <button type="button" class="pick" :aria-describedby="describedBy" @click="input?.click()">choose files</button>
      </p>
      <p class="hint">
        PNG, JPG, WebP or GIF. Big pictures are shrunk to fit before upload.
        <template v-if="!busy">{{ remaining }} of {{ max }} slots free.</template>
      </p>
      <input
        :id="id"
        ref="input"
        class="file-input"
        type="file"
        multiple
        :accept="IMAGE_ACCEPT"
        tabindex="-1"
        aria-hidden="true"
        :disabled="busy"
        @change="onPick"
      />
    </div>
    <p v-else-if="!disabled" class="hint">You've added the most images allowed ({{ max }}). Remove one to add another.</p>

    <p v-if="files.length && !disabled" class="hint size-note">
      New images: {{ formatBytes(newBytes) }} of {{ requestLabel }} per save.
    </p>

    <ul v-if="problems.length" class="problems" role="alert">
      <li v-for="p in problems" :key="p">{{ p }}</li>
    </ul>
  </div>
</template>

<style scoped>
.uploader {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.previews {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
}
.preview {
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: 14px;
  overflow: hidden;
  background: #f6efe3;
  border: 1px solid var(--border);
}
.preview img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.tag {
  position: absolute;
  left: 6px;
  bottom: 6px;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  background: rgba(47, 45, 43, 0.7);
  color: #fff;
}
.tag.new {
  background: rgba(217, 82, 125, 0.88);
}
.remove {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 0;
  background: rgba(255, 253, 250, 0.94);
  color: var(--danger);
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}
.remove:hover {
  background: #fff;
}
.remove:focus-visible,
.pick:focus-visible {
  outline: 3px solid var(--pink);
  outline-offset: 2px;
}
.dropzone {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
  padding: 26px 18px;
  border: 2px dashed var(--border);
  border-radius: 18px;
  background: #fffaf3;
  transition: border-color 0.15s, background 0.15s;
}
.dropzone.dragging {
  border-color: var(--pink);
  background: var(--pink-soft);
}
.dropzone.busy {
  border-style: solid;
}
.size-note {
  margin-top: -6px;
}
.drop-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: var(--pink-soft);
  color: var(--pink-dark);
}
.drop-text {
  margin: 4px 0 0;
}
.pick {
  border: 0;
  background: none;
  padding: 0;
  color: var(--pink);
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.pick:hover {
  color: var(--pink-dark);
}
.hint {
  margin: 0;
}
.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.problems {
  margin: 0;
  padding: 10px 14px 10px 32px;
  border-radius: 12px;
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 0.92rem;
  font-weight: 500;
}
</style>
