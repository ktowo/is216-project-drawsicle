<script setup>
import { computed, ref } from 'vue';
import { Check } from 'lucide-vue-next';

// Toggle pills. multiple (default): v-model is an array, each pill is a checkbox.
// multiple=false: v-model is a string, the pills form a radio group (arrow keys move between them).
const props = defineProps({
  modelValue: { type: [Array, String], default: undefined },
  options: { type: Array, default: () => [] },
  multiple: { type: Boolean, default: true },
  disabledValues: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
  // Names the group for screen readers when there is no visible label to point at
  // (otherwise pass aria-labelledby, which falls through to the group)
  label: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue']);

const buttons = ref([]);

const selected = computed(() => {
  if (props.multiple) return Array.isArray(props.modelValue) ? props.modelValue : [];
  return props.modelValue ? [props.modelValue] : [];
});

const isSelected = (value) => selected.value.includes(value);
const isDisabled = (value) => props.disabled || props.disabledValues.includes(value);

function toggle(value) {
  if (isDisabled(value)) return;
  if (props.multiple) {
    const next = isSelected(value) ? selected.value.filter((v) => v !== value) : [...selected.value, value];
    // Keep the order of the options so saved values look tidy
    const order = props.options.map((o) => o.value);
    next.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    emit('update:modelValue', next);
  } else if (!isSelected(value)) {
    emit('update:modelValue', value);
  }
}

// Radio group: only the selected (or first enabled) pill is in the tab order
function tabIndexFor(option, index) {
  if (props.multiple) return isDisabled(option.value) ? -1 : 0;
  const current = props.options.findIndex((o) => isSelected(o.value));
  const firstEnabled = props.options.findIndex((o) => !isDisabled(o.value));
  return index === (current === -1 ? firstEnabled : current) ? 0 : -1;
}

function onKeydown(e, index) {
  if (props.multiple) return;
  const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  const step = keys[e.key];
  if (!step) return;
  e.preventDefault();
  const count = props.options.length;
  for (let i = 1; i <= count; i++) {
    const nextIndex = (index + step * i + count) % count;
    const option = props.options[nextIndex];
    if (!isDisabled(option.value)) {
      toggle(option.value);
      buttons.value[nextIndex]?.focus();
      return;
    }
  }
}
</script>

<template>
  <div class="choice-chips" :role="multiple ? 'group' : 'radiogroup'" :aria-label="label || undefined">
    <button
      v-for="(option, index) in options"
      :key="option.value"
      :ref="(el) => (buttons[index] = el)"
      type="button"
      class="chip"
      :class="{ on: isSelected(option.value) }"
      :role="multiple ? 'checkbox' : 'radio'"
      :aria-checked="isSelected(option.value) ? 'true' : 'false'"
      :aria-disabled="isDisabled(option.value) ? 'true' : undefined"
      :disabled="isDisabled(option.value)"
      :tabindex="tabIndexFor(option, index)"
      @click="toggle(option.value)"
      @keydown="onKeydown($event, index)"
    >
      <Check v-if="isSelected(option.value)" :size="15" :stroke-width="3" aria-hidden="true" />
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.choice-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1.5px solid var(--border);
  background: var(--surface);
  color: var(--text);
  border-radius: 999px;
  padding: 8px 16px;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.chip:hover:not(:disabled) {
  border-color: var(--pink);
}
.chip.on {
  background: var(--pink-soft);
  border-color: var(--pink);
  color: var(--pink-dark);
}
.chip:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  text-decoration: line-through;
}
.chip:focus-visible {
  border-radius: 999px;
}
</style>
