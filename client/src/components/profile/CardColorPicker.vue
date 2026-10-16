<script setup>
import { Check } from 'lucide-vue-next';
import { CARD_COLORS } from '@shared/taste.mjs';

// Card colour swatches as a radio group: arrows move, only the chosen one is tabbable.
// v-model is a colour value from shared/taste.mjs ('' for none yet).
const props = defineProps({
  modelValue: { type: String, default: '' },
  large: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);

function onKeydown(e, index) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (!step) return;
  e.preventDefault();
  const next = (index + step + CARD_COLORS.length) % CARD_COLORS.length;
  emit('update:modelValue', CARD_COLORS[next].value);
  e.currentTarget.parentElement.children[next]?.focus();
}
const tabIndexFor = (index) => {
  const current = CARD_COLORS.findIndex((c) => c.value === props.modelValue);
  return index === (current === -1 ? 0 : current) ? 0 : -1;
};
</script>

<template>
  <div class="swatches" :class="{ large }" role="radiogroup">
    <button
      v-for="(color, i) in CARD_COLORS"
      :key="color.value"
      type="button"
      role="radio"
      class="swatch"
      :style="{ '--swatch': color.swatch, '--ink': color.ink }"
      :aria-checked="modelValue === color.value ? 'true' : 'false'"
      :aria-label="color.label"
      :title="color.label"
      :tabindex="tabIndexFor(i)"
      @click="emit('update:modelValue', color.value)"
      @keydown="onKeydown($event, i)"
    >
      <Check v-if="modelValue === color.value" :size="large ? 22 : 18" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
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
.large .swatch {
  width: 56px;
  height: 56px;
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
