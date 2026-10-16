<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, useId } from 'vue';
import { RouterLink, onBeforeRouteLeave } from 'vue-router';
import { RotateCcw, RotateCw, Shuffle, Undo2, Save, Loader2, Landmark } from 'lucide-vue-next';
import PageHeader from '@/components/ui/PageHeader.vue';
import PixelAvatar from '@/components/museum/PixelAvatar.vue';
import { api } from '@/api';
import { auth, setUser } from '@/stores/auth';
import { toast } from '@/stores/toast';
import { LOOK_OPTIONS, STYLE_LABELS, ACCESSORY_LABELS, lookOf, randomLook } from '@shared/looks.mjs';
import { EMOTES } from '@shared/chat.mjs';

// The avatar creator: how you look walking round the museum. Everyone sees it there, in chat
// bubbles and on friend lists.
const uid = useId();
const saved = computed(() => lookOf(auth.user));
const look = ref({ ...saved.value });
const saving = ref(false);
const changed = computed(() => JSON.stringify(look.value) !== JSON.stringify(saved.value));

watch(saved, (value) => {
  if (!changed.value) look.value = { ...value };
});

// Turn the preview round, and try an emote on
const FACINGS = ['se', 'sw', 'nw', 'ne'];
const facing = ref('se');
function turn(step) {
  facing.value = FACINGS[(FACINGS.indexOf(facing.value) + step + FACINGS.length) % FACINGS.length];
}
const emote = ref('');
let emoteTimer = null;
function tryEmote(key) {
  emote.value = key;
  clearTimeout(emoteTimer);
  emoteTimer = setTimeout(() => (emote.value = ''), 2800);
}
onBeforeUnmount(() => clearTimeout(emoteTimer));

const COLOUR_GROUPS = [
  { field: 'skin', label: 'Skin' },
  { field: 'hair', label: 'Hair colour' },
  { field: 'shirt', label: 'Top' },
  { field: 'pants', label: 'Trousers' },
];

async function save() {
  saving.value = true;
  try {
    const { user } = await api('/profile/look', { method: 'PUT', body: look.value });
    setUser(user);
    toast.success('Looking good! Your avatar is saved.');
  } catch (e) {
    toast.error(e.message);
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  document.title = 'Your museum avatar · Drawsicle';
});
onBeforeRouteLeave(() => {
  if (changed.value && !saving.value) {
    return window.confirm('Leave without saving your avatar?');
  }
  return true;
});
</script>

<template>
  <main id="main" class="page" tabindex="-1">
    <PageHeader
      title="Your museum avatar"
      subtitle="This is you in the museum. Other visitors see it walking round, in chat and on their friend lists."
    >
      <RouterLink to="/museum" class="btn btn-outline btn-sm"><Landmark :size="16" aria-hidden="true" /> Go to the museum</RouterLink>
    </PageHeader>

    <div class="creator mt-6">
      <section class="stage card" aria-label="Preview">
        <svg viewBox="-30 -68 60 76" class="preview" role="img" :aria-label="`Your avatar, facing ${facing}`">
          <ellipse cx="0" cy="2" rx="26" ry="9" class="floor" />
          <PixelAvatar :x="0" :y="0" :facing="facing" :look="look" :emote="emote" />
        </svg>
        <div class="stage-tools">
          <button type="button" class="btn btn-ghost btn-sm" aria-label="Turn left" @click="turn(-1)">
            <RotateCcw :size="16" aria-hidden="true" />
          </button>
          <button type="button" class="btn btn-ghost btn-sm" aria-label="Turn right" @click="turn(1)">
            <RotateCw :size="16" aria-hidden="true" />
          </button>
        </div>
        <div class="emote-row" role="group" aria-label="Try an emote">
          <button v-for="e in EMOTES" :key="e.key" type="button" class="emote" :title="e.label" @click="tryEmote(e.key)">
            <span aria-hidden="true">{{ e.icon }}</span><span class="sr-only">{{ e.label }}</span>
          </button>
        </div>
      </section>

      <section class="options card" aria-label="Customise">
        <fieldset v-for="g in COLOUR_GROUPS" :key="g.field" class="group">
          <legend class="label">{{ g.label }}</legend>
          <div class="swatches" role="radiogroup" :aria-label="g.label">
            <button
              v-for="(c, i) in LOOK_OPTIONS[g.field]"
              :key="c"
              type="button"
              role="radio"
              class="swatch"
              :class="{ on: look[g.field] === c }"
              :style="{ background: c }"
              :aria-checked="look[g.field] === c ? 'true' : 'false'"
              :aria-label="`${g.label} ${i + 1} of ${LOOK_OPTIONS[g.field].length}`"
              @click="look[g.field] = c"
            />
          </div>
        </fieldset>

        <fieldset class="group">
          <legend :id="`${uid}-style`" class="label">Hairstyle</legend>
          <div class="choices" role="radiogroup" :aria-labelledby="`${uid}-style`">
            <button
              v-for="st in LOOK_OPTIONS.style"
              :key="st"
              type="button"
              role="radio"
              class="choice"
              :class="{ on: look.style === st }"
              :aria-checked="look.style === st ? 'true' : 'false'"
              @click="look.style = st"
            >
              <svg viewBox="-14 -58 28 33" width="34" height="34" aria-hidden="true">
                <PixelAvatar :x="0" :y="0" facing="se" :look="{ ...look, style: st, accessory: 'none' }" />
              </svg>
              {{ STYLE_LABELS[st] }}
            </button>
          </div>
        </fieldset>

        <fieldset class="group">
          <legend :id="`${uid}-acc`" class="label">Accessory</legend>
          <div class="choices" role="radiogroup" :aria-labelledby="`${uid}-acc`">
            <button
              v-for="a in LOOK_OPTIONS.accessory"
              :key="a"
              type="button"
              role="radio"
              class="choice"
              :class="{ on: look.accessory === a }"
              :aria-checked="look.accessory === a ? 'true' : 'false'"
              @click="look.accessory = a"
            >
              <svg viewBox="-14 -58 28 33" width="34" height="34" aria-hidden="true">
                <PixelAvatar :x="0" :y="0" facing="se" :look="{ ...look, accessory: a }" />
              </svg>
              {{ ACCESSORY_LABELS[a] }}
            </button>
          </div>
        </fieldset>

        <div class="actions">
          <button type="button" class="btn btn-primary" :disabled="saving || !changed" @click="save">
            <Loader2 v-if="saving" :size="16" class="spin" aria-hidden="true" />
            <Save v-else :size="16" aria-hidden="true" /> Save avatar
          </button>
          <button type="button" class="btn btn-outline" @click="look = randomLook()">
            <Shuffle :size="16" aria-hidden="true" /> Surprise me
          </button>
          <button v-if="changed" type="button" class="btn btn-ghost" @click="look = { ...saved }">
            <Undo2 :size="16" aria-hidden="true" /> Undo changes
          </button>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.creator {
  display: grid;
  gap: 20px;
}
@media (min-width: 860px) {
  .creator {
    grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
    align-items: start;
  }
  .stage {
    position: sticky;
    top: 96px;
  }
}
.stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 18px;
  background: radial-gradient(circle at 50% 30%, #2d3244, #1d2130);
  border-color: transparent;
}
.preview {
  width: 100%;
  max-width: 260px;
  height: auto;
}
.floor {
  fill: rgba(255, 255, 255, 0.08);
}
.stage-tools {
  display: flex;
  gap: 6px;
}
.stage-tools .btn {
  color: #f3eaf0;
}
.emote-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}
.emote {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 1.15rem;
  cursor: pointer;
}
.emote:hover,
.emote:focus-visible {
  background: rgba(236, 106, 147, 0.35);
}
.options {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 20px 22px;
}
.group {
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}
.group .label {
  margin-bottom: 8px;
}
.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.swatch {
  width: 34px;
  height: 34px;
  border: 2px solid var(--border);
  border-radius: 50%;
  cursor: pointer;
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.25);
}
.swatch.on {
  border-color: var(--pink);
  box-shadow: 0 0 0 3px var(--pink-soft), inset 0 0 0 2px rgba(255, 255, 255, 0.4);
}
.swatch:focus-visible,
.choice:focus-visible {
  outline: 3px solid var(--pink);
  outline-offset: 2px;
}
.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.choice {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px 4px 4px;
  border: 1.5px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  --museum-head-bg: transparent;
}
.choice svg {
  border-radius: 8px;
  background: #e9e0f2;
}
.choice.on {
  border-color: var(--pink);
  background: var(--pink-soft);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
