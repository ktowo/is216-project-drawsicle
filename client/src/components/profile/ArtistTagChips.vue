<script setup>
import { computed } from 'vue';
import { CREATION_TYPES } from '@shared/constants.mjs';
import { ACTIVITY_LEVELS, artistTagsOf, themeLabel } from '@shared/taste.mjs';

// Someone's artist tags as small chips: what they make, themes they love, how often they join.
// Shows nothing when they haven't filled any in.
const props = defineProps({
  tags: { type: Object, default: null },
  // Fewer chips for cards (themes cut to 3, no activity)
  compact: { type: Boolean, default: false },
});

const clean = computed(() => artistTagsOf(props.tags));
const makes = computed(() => clean.value.makes.map((v) => CREATION_TYPES.find((t) => t.value === v)?.label || v));
const themes = computed(() => {
  const all = clean.value.themes.map(themeLabel);
  return props.compact ? all.slice(0, 3) : all;
});
const activity = computed(() =>
  props.compact ? '' : ACTIVITY_LEVELS.find((a) => a.value === clean.value.activity)?.chip || ''
);
const empty = computed(() => !makes.value.length && !themes.value.length && !activity.value);
</script>

<template>
  <ul v-if="!empty" class="tag-chips" aria-label="Artist tags">
    <li v-for="m in makes" :key="`m-${m}`" class="chip makes">{{ m }}</li>
    <li v-for="t in themes" :key="`t-${t}`" class="chip theme">{{ t }}</li>
    <li v-if="activity" class="chip activity">{{ activity }}</li>
  </ul>
</template>

<style scoped>
.tag-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.chip {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 600;
  line-height: 1.5;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
}
.chip.makes {
  background: var(--pink-soft);
  border-color: transparent;
  color: var(--pink-dark);
}
.chip.activity {
  color: var(--muted);
  border-style: dashed;
}
</style>
