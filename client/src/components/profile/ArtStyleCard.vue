<script setup>
import { ref, computed, onMounted, useId } from 'vue';
import { Palette, ImagePlus, Trash2, Loader2, ScanEye, Sparkles, CircleAlert } from 'lucide-vue-next';
import { api, assetUrl } from '@/api';
import { toast } from '@/stores/toast';
import { MAX_STYLE_SAMPLES, featureWords } from '@shared/style.mjs';
import { formatDate } from '@/utils/format';

// "Your art style": a few pictures of your work, and what the site makes of them. Organisers can
// use it to pair you with someone of a similar (or deliberately different) style.
const uid = useId();
const data = ref(null); // { samples, profile, vision, demo? }
const error = ref('');
const busy = ref('');
const fileInput = ref(null);

async function load() {
  try {
    data.value = await api('/profile/style');
  } catch (e) {
    error.value = e.message;
  }
}
onMounted(load);

const words = computed(() => {
  const p = data.value?.profile;
  return p ? [...new Set([...(p.tags || []), ...featureWords(p.features)])].slice(0, 14) : [];
});

async function upload(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  busy.value = 'upload';
  try {
    const form = new FormData();
    form.append('image', file);
    data.value = await api('/profile/style-samples', { method: 'POST', form });
    toast.success('Picture added. Analyse your style to update it.');
  } catch (e) {
    toast.error(e.message);
  } finally {
    busy.value = '';
  }
}

async function remove(url) {
  busy.value = url;
  try {
    data.value = await api('/profile/style-samples', { method: 'DELETE', body: { url } });
  } catch (e) {
    toast.error(e.message);
  } finally {
    busy.value = '';
  }
}

async function analyse() {
  busy.value = 'analyse';
  try {
    data.value = await api('/profile/style/analyse', { method: 'POST' });
    toast.success('Done! This is how your style looks to the matcher.');
  } catch (e) {
    toast.error(e.message);
  } finally {
    busy.value = '';
  }
}
</script>

<template>
  <section class="card p-5 sm:p-6 style" :aria-labelledby="`${uid}-title`">
    <h2 :id="`${uid}-title`" class="title"><Palette :size="19" aria-hidden="true" /> Your art style</h2>
    <p class="hint m-0">
      Add up to {{ MAX_STYLE_SAMPLES }} pictures of your art. Together with gifts you've made, they let organisers pair
      you with someone whose style is like yours, or nicely different. Only the description is shared, never the
      pictures themselves.
    </p>

    <p v-if="error" class="alert alert-error m-0 mt-3" role="alert">{{ error }}</p>
    <p v-else-if="data?.demo" class="alert alert-info m-0 mt-3">
      <CircleAlert :size="16" aria-hidden="true" /> Looking at your art style needs the real server, so it isn't part of
      the demo.
    </p>
    <template v-else-if="data">
      <ul class="samples" aria-label="Your style pictures">
        <li v-for="url in data.samples" :key="url" class="sample">
          <img :src="assetUrl(url)" alt="One of your style pictures" loading="lazy" />
          <button type="button" class="remove" :disabled="Boolean(busy)" :aria-label="'Remove this picture'" @click="remove(url)">
            <Loader2 v-if="busy === url" :size="14" class="spin" aria-hidden="true" />
            <Trash2 v-else :size="14" aria-hidden="true" />
          </button>
        </li>
        <li v-if="data.samples.length < MAX_STYLE_SAMPLES">
          <button type="button" class="add" :disabled="Boolean(busy)" @click="fileInput?.click()">
            <Loader2 v-if="busy === 'upload'" :size="22" class="spin" aria-hidden="true" />
            <ImagePlus v-else :size="22" aria-hidden="true" />
            <span>Add a picture</span>
          </button>
          <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="sr-only" tabindex="-1" @change="upload" />
        </li>
      </ul>

      <div class="actions">
        <button type="button" class="btn btn-primary btn-sm" :disabled="Boolean(busy)" @click="analyse">
          <Loader2 v-if="busy === 'analyse'" :size="16" class="spin" aria-hidden="true" />
          <ScanEye v-else :size="16" aria-hidden="true" />
          {{ data.profile ? 'Analyse again' : 'Analyse my style' }}
        </button>
        <span v-if="busy === 'analyse'" class="hint">This can take a little while with the vision model…</span>
      </div>

      <div v-if="data.profile" class="result" aria-live="polite">
        <div v-if="data.profile.palette.length" class="palette" aria-label="Main colours">
          <span v-for="c in data.profile.palette" :key="c" class="swatch" :style="{ background: c }" :title="c" />
        </div>
        <ul v-if="words.length" class="tags" aria-label="Style words">
          <li v-for="w in words" :key="w">{{ w }}</li>
        </ul>
        <p v-if="data.profile.summary" class="summary m-0">"{{ data.profile.summary }}"</p>
        <p class="hint m-0">
          <Sparkles :size="13" aria-hidden="true" />
          From {{ data.profile.imageCount }} picture{{ data.profile.imageCount === 1 ? '' : 's' }},
          {{ data.profile.usedVision ? 'with the vision model' : 'colours and texture only' }}
          <template v-if="data.profile.analysedAt"> · {{ formatDate(data.profile.analysedAt) }}</template>
        </p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.style {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-family: var(--font-body);
  font-size: 1.1rem;
  font-weight: 700;
}
.samples {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.sample {
  position: relative;
}
.sample img,
.add {
  width: 104px;
  height: 104px;
  border-radius: 14px;
  object-fit: cover;
}
.add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 2px dashed var(--border-strong);
  background: var(--surface-2);
  color: var(--muted);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}
.add:hover:not(:disabled) {
  border-color: var(--pink);
  color: var(--pink-dark);
}
.remove {
  position: absolute;
  top: 6px;
  right: 6px;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  cursor: pointer;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.result {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--surface-2);
}
.palette {
  display: flex;
  gap: 6px;
}
.swatch {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
}
.tags {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tags li {
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--pink-soft);
  color: var(--pink-dark);
  font-size: 0.82rem;
  font-weight: 700;
}
.summary {
  font-style: italic;
  color: var(--text-soft);
}
</style>
