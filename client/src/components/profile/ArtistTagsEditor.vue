<script setup>
import { computed, useId } from 'vue';
import { Check } from 'lucide-vue-next';
import ChoiceChips from '@/components/ui/ChoiceChips.vue';
import { CREATION_TYPES } from '@shared/constants.mjs';
import { THEMES, THEMES_MAX, ACTIVITY_LEVELS, CARD_COLORS } from '@shared/taste.mjs';

// Pickers for artist tags: what you make, up to five themes, how often you join and a card colour.
// v-model is { makes, themes, activity, cardColor }. Used in profile settings (and the quiz).
const props = defineProps({
  modelValue: { type: Object, required: true },
});
const emit = defineEmits(['update:modelValue']);

const id = useId();
const set = (key, value) => emit('update:modelValue', { ...props.modelValue, [key]: value });

const themeOptions = THEMES.map(({ value, label }) => ({ value, label }));
const activityOptions = ACTIVITY_LEVELS.map(({ value, label }) => ({ value, label }));

// Once five themes are picked, the rest wait until one is removed
const fullThemes = computed(() =>
  props.modelValue.themes.length >= THEMES_MAX
    ? THEMES.map((t) => t.value).filter((v) => !props.modelValue.themes.includes(v))
    : []
);

// Colour swatches behave as a radio group: arrows move, only the chosen one is tabbable
function onColorKeydown(e, index) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (!step) return;
  e.preventDefault();
  const next = CARD_COLORS[(index + step + CARD_COLORS.length) % CARD_COLORS.length];
  set('cardColor', next.value);
  e.currentTarget.parentElement.children[(index + step + CARD_COLORS.length) % CARD_COLORS.length]?.focus();
}
const colorTabIndex = (color, index) => {
  const current = CARD_COLORS.findIndex((c) => c.value === props.modelValue.cardColor);
  return index === (current === -1 ? 0 : current) ? 0 : -1;
};
</script>

<template>
  <div class="tags-editor">
    <div class="group">
      <p :id="`${id}-makes`" class="label">What you make</p>
      <ChoiceChips
        :model-value="modelValue.makes"
        :options="CREATION_TYPES"
        :aria-labelledby="`${id}-makes`"
        @update:model-value="set('makes', $event)"
      />
    </div>

    <div class="group">
      <p :id="`${id}-themes`" class="label">
        Themes you love <span class="hint">({{ modelValue.themes.length }}/{{ THEMES_MAX }})</span>
      </p>
      <ChoiceChips
        :model-value="modelValue.themes"
        :options="themeOptions"
        :disabled-values="fullThemes"
        :aria-labelledby="`${id}-themes`"
        @update:model-value="set('themes', $event)"
      />
    </div>

    <div class="group">
      <p :id="`${id}-activity`" class="label">How often you join</p>
      <ChoiceChips
        :model-value="modelValue.activity"
        :options="activityOptions"
        :multiple="false"
        :aria-labelledby="`${id}-activity`"
        @update:model-value="set('activity', $event)"
      />
    </div>

    <div class="group">
      <p :id="`${id}-color`" class="label">Card colour</p>
      <div class="swatches" role="radiogroup" :aria-labelledby="`${id}-color`">
        <button
          v-for="(color, i) in CARD_COLORS"
          :key="color.value"
          type="button"
          role="radio"
          class="swatch"
          :style="{ '--swatch': color.swatch, '--ink': color.ink }"
          :aria-checked="modelValue.cardColor === color.value ? 'true' : 'false'"
          :aria-label="color.label"
          :title="color.label"
          :tabindex="colorTabIndex(color, i)"
          @click="set('cardColor', color.value)"
          @keydown="onColorKeydown($event, i)"
        >
          <Check v-if="modelValue.cardColor === color.value" :size="18" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tags-editor {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.group .label {
  margin: 0 0 8px;
}
.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.swatch {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid transparent;
  background: var(--swatch);
  color: var(--ink);
  display: grid;
  place-items: center;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
  transition: transform 0.12s;
}
.swatch:hover {
  transform: scale(1.08);
}
.swatch[aria-checked='true'] {
  border-color: var(--text);
}
.swatch:focus-visible {
  box-shadow: var(--focus-ring);
}
@media (prefers-reduced-motion: reduce) {
  .swatch {
    transition: none;
  }
  .swatch:hover {
    transform: none;
  }
}
</style>
