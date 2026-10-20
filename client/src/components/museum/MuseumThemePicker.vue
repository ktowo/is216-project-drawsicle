<script setup>
import { useId } from 'vue';
import { MUSEUM_THEMES } from '@shared/museum-themes.mjs';

// Picks the room design for an exchange's museum (shared/museum-themes.mjs): one design for
// every room, or 'auto' for a different one in each room. v-model is the choice's key.
defineProps({
  modelValue: { type: String, default: 'auto' },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);
const uid = useId();

const LIGHT_WORDS = {
  day: 'Daylight',
  warm: 'Lamplight',
  spotlight: 'Spotlights in the dark',
  track: 'Track lights',
  golden: 'Low evening sun',
};
const choices = [
  { key: 'auto', label: 'Mix them up', blurb: 'Every room gets a different design.', light: 'A bit of everything', themes: MUSEUM_THEMES.slice(0, 4) },
  ...MUSEUM_THEMES.map((t) => ({ key: t.key, label: t.label, blurb: t.blurb, light: LIGHT_WORDS[t.lighting], themes: [t] })),
];
</script>

<template>
  <fieldset class="picker" :disabled="disabled">
    <legend class="sr-only">Room design</legend>
    <label v-for="c in choices" :key="c.key" class="choice" :class="{ on: modelValue === c.key }">
      <input
        type="radio"
        class="sr-only"
        :name="`${uid}-design`"
        :value="c.key"
        :checked="modelValue === c.key"
        @change="emit('update:modelValue', c.key)"
      />
      <!-- A tiny corner of the room in its colours -->
      <svg viewBox="0 0 80 48" class="swatch" aria-hidden="true">
        <g v-for="(t, i) in c.themes" :key="t.key" :transform="`translate(${(i * 80) / c.themes.length} 0)`">
          <clipPath :id="`${uid}-${c.key}-${i}`">
            <rect x="0" y="0" :width="80 / c.themes.length" height="48" />
          </clipPath>
          <g :clip-path="`url(#${uid}-${c.key}-${i})`">
            <rect x="0" y="0" width="80" height="48" :fill="t.void" />
            <polygon points="0,6 40,0 40,30 0,36" :fill="t.wallLeft[0]" />
            <polygon points="40,0 80,6 80,36 40,30" :fill="t.wallRight[0]" />
            <polygon points="0,36 40,30 80,36 40,48" :fill="t.floor[0]" />
            <polygon points="22,39 40,36 58,39 40,44" :fill="t.rug[0]" />
            <rect x="12" y="12" width="12" height="13" :fill="t.frame[0]" />
            <rect x="14" y="14" width="8" height="9" :fill="t.frame[2]" />
            <rect x="54" y="12" width="12" height="13" :fill="t.frame[0]" />
            <rect x="56" y="14" width="8" height="9" :fill="t.frame[2]" />
            <rect v-if="t.lighting === 'spotlight' || t.lighting === 'track'" x="0" y="0" width="80" height="48" fill="#05050f" :opacity="t.lighting === 'spotlight' ? 0.35 : 0.1" />
          </g>
        </g>
      </svg>
      <span class="name">{{ c.label }}</span>
      <span class="blurb">{{ c.light }}</span>
    </label>
  </fieldset>
</template>

<style scoped>
.picker {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  border: 0;
}
.choice {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 2px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  cursor: pointer;
}
.choice:hover {
  border-color: var(--pink);
}
.choice.on {
  border-color: var(--pink);
  background: var(--pink-soft);
}
.choice:focus-within {
  outline: 3px solid var(--pink);
  outline-offset: 2px;
}
fieldset:disabled .choice {
  cursor: default;
  opacity: 0.6;
}
.swatch {
  width: 100%;
  height: auto;
  border-radius: 8px;
}
.name {
  font-size: 0.86rem;
  font-weight: 800;
}
.blurb {
  color: var(--muted);
  font-size: 0.76rem;
}
</style>
