<script setup>
import { computed } from 'vue';
import { Plus } from 'lucide-vue-next';

// A row of ideas under a free-text box. Picking one adds it to the text, so people
// don't have to start from a blank box. v-model is the box's text.
const props = defineProps({
  modelValue: { type: String, default: '' },
  options: { type: Array, default: () => [] },
  label: { type: String, default: 'Ideas:' },
  max: { type: Number, default: 0 }, // the box's character limit, if any
});
const emit = defineEmits(['update:modelValue']);

// Hide ideas already in the text
const visible = computed(() => {
  const text = props.modelValue.toLowerCase();
  return props.options.filter((o) => !text.includes(o.toLowerCase()));
});

function add(option) {
  const text = props.modelValue.trim();
  const next = text ? `${text.replace(/[,.;]$/, '')}, ${option}` : option.charAt(0).toUpperCase() + option.slice(1);
  if (props.max && next.length > props.max) return;
  emit('update:modelValue', next);
}
</script>

<template>
  <div v-if="visible.length" class="text-suggestions">
    <span class="label">{{ label }}</span>
    <button v-for="o in visible" :key="o" type="button" class="idea" @click="add(o)">
      <Plus :size="12" aria-hidden="true" /> {{ o }}
    </button>
  </div>
</template>

<style scoped>
.text-suggestions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}
.label {
  font-size: 0.82rem;
  color: var(--muted);
  font-weight: 600;
}
.idea {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px dashed var(--border);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 0.82rem;
  cursor: pointer;
}
.idea:hover {
  border-color: var(--pink);
  color: var(--pink-dark);
}
.idea:focus-visible {
  outline: 3px solid var(--pink);
  outline-offset: 1px;
}
</style>
