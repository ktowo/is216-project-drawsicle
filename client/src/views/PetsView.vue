<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { RouterLink } from 'vue-router';
import { PawPrint, BookHeart } from 'lucide-vue-next';
import PageHeader from '@/components/ui/PageHeader.vue';
import PetSprite from '@/components/pets/PetSprite.vue';
import { PET_KINDS, PET_PALETTES, DEFAULT_PALETTE, MAX_SHOWN_PETS } from '@shared/pets.mjs';
import { auth } from '@/stores/auth';

// "Meet the pets": every kind and colour, so people know what their characters can become
const STATES = [
  { value: 'stand', label: 'Standing' },
  { value: 'walk', label: 'Walking' },
  { value: 'sit', label: 'Sitting' },
  { value: 'sleep', label: 'Asleep' },
  { value: 'jump', label: 'Jumping' },
  { value: 'held', label: 'Picked up' },
  { value: 'eat', label: 'Snacking' },
  { value: 'happy', label: 'Happy' },
];
const state = ref('walk');
const palette = ref('');
const step = ref(0);
let timer = null;

const kinds = computed(() =>
  PET_KINDS.map((k) => ({ ...k, palette: { cheek: '#f59bb5', ...PET_PALETTES[palette.value || DEFAULT_PALETTE[k.value]] } }))
);

onMounted(() => {
  timer = setInterval(() => (step.value += 1), 220);
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <main id="main" class="page" tabindex="-1">
    <PageHeader
      title="Screen pets"
      :subtitle="`Any character in your library can come out as a little pet that wanders round the edges of Drawsicle. Feed them, pet them, or pick them up and put them somewhere new. Up to ${MAX_SHOWN_PETS} at once.`"
    >
      <template #actions>
        <RouterLink v-if="auth.user" to="/characters" class="btn btn-primary"><BookHeart :size="18" aria-hidden="true" /> Choose your pets</RouterLink>
        <RouterLink v-else to="/register" class="btn btn-primary">Sign up to get pets</RouterLink>
      </template>
    </PageHeader>

    <div class="controls card">
      <fieldset class="group">
        <legend class="label">Doing</legend>
        <div class="chips">
          <button
            v-for="s in STATES"
            :key="s.value"
            type="button"
            class="chip"
            :class="{ on: state === s.value }"
            :aria-pressed="state === s.value"
            @click="state = s.value"
          >
            {{ s.label }}
          </button>
        </div>
      </fieldset>
      <fieldset class="group">
        <legend class="label">Colours</legend>
        <div class="chips">
          <button type="button" class="chip" :class="{ on: !palette }" :aria-pressed="!palette" @click="palette = ''">Their own</button>
          <button
            v-for="(p, key) in PET_PALETTES"
            :key="key"
            type="button"
            class="chip swatch-chip"
            :class="{ on: palette === key }"
            :aria-pressed="palette === key"
            @click="palette = key"
          >
            <span class="swatch" :style="{ background: p.body }" aria-hidden="true" /> {{ p.label }}
          </button>
        </div>
      </fieldset>
    </div>

    <ul class="pet-grid">
      <li v-for="k in kinds" :key="k.value" class="card pet-card">
        <div class="stage">
          <PetSprite :kind="k.value" :palette="k.palette" :state="state" :step="step" :size="96" />
        </div>
        <p class="name"><PawPrint :size="15" aria-hidden="true" /> {{ k.label }}</p>
        <p class="hint m-0">From species like {{ k.words.slice(0, 3).join(', ') }}</p>
      </li>
    </ul>
  </main>
</template>

<style scoped>
.controls {
  margin-top: 24px;
  padding: 16px 18px;
  display: grid;
  gap: 14px;
}
.group {
  border: 0;
  margin: 0;
  padding: 0;
}
.group .label {
  margin-bottom: 8px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1.5px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
}
.chip:hover {
  background: var(--hover);
}
.chip.on {
  border-color: var(--pink);
  background: var(--pink-soft);
  color: var(--pink-dark);
}
.swatch {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
}
.pet-grid {
  list-style: none;
  margin: 24px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 16px;
}
.pet-card {
  padding: 14px 14px 16px;
  text-align: center;
}
.stage {
  display: grid;
  place-items: center;
  height: 110px;
  border-radius: 14px;
  background: var(--surface-2);
}
.name {
  margin: 10px 0 2px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
}
</style>
