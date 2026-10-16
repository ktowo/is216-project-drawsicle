<script setup>
import { computed, useId } from 'vue';
import ChoiceChips from '@/components/ui/ChoiceChips.vue';
import CardColorPicker from './CardColorPicker.vue';
import { CREATION_TYPES } from '@shared/constants.mjs';
import { THEMES, THEMES_MAX, ACTIVITY_LEVELS } from '@shared/taste.mjs';

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
      <CardColorPicker
        :model-value="modelValue.cardColor"
        :aria-labelledby="`${id}-color`"
        @update:model-value="set('cardColor', $event)"
      />
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
</style>
