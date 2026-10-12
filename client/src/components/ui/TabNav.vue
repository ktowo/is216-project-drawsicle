<script setup>
import { ref, computed } from 'vue';

// Row of tabs/filters. v-model is the active key. Scrolls sideways on narrow screens.
const props = defineProps({
  modelValue: { type: String, default: '' },
  // tabs: [{ key, label, count?, id?, controls? }]. id / controls (the id of the panel it shows) are optional.
  tabs: { type: Array, default: () => [] },
  // Names the group for screen readers, e.g. "Event sections"
  label: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue']);

const buttons = ref([]);

// Only one tab is in the tab order. If the value matches nothing, that is the first one.
const tabbableIndex = computed(() => {
  const at = props.tabs.findIndex((tab) => tab.key === props.modelValue);
  return at === -1 ? 0 : at;
});

function select(key) {
  if (key !== props.modelValue) emit('update:modelValue', key);
}

function onKeydown(e, index) {
  const count = props.tabs.length;
  let next = null;
  if (e.key === 'ArrowRight') next = (index + 1) % count;
  else if (e.key === 'ArrowLeft') next = (index - 1 + count) % count;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = count - 1;
  if (next === null) return;
  e.preventDefault();
  select(props.tabs[next].key);
  const el = buttons.value[next];
  el?.focus();
  el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
</script>

<template>
  <div class="tab-nav" role="tablist" :aria-label="label || undefined">
    <button
      v-for="(tab, index) in tabs"
      :key="tab.key"
      :ref="(el) => (buttons[index] = el)"
      :id="tab.id || undefined"
      type="button"
      role="tab"
      :aria-controls="tab.controls || undefined"
      class="tab"
      :class="{ active: tab.key === modelValue }"
      :aria-selected="tab.key === modelValue ? 'true' : 'false'"
      :tabindex="index === tabbableIndex ? 0 : -1"
      @click="select(tab.key)"
      @keydown="onKeydown($event, index)"
    >
      <span>{{ tab.label }}</span>
      <span v-if="tab.count !== undefined && tab.count !== null" class="count">{{ tab.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.tab-nav {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 16px;
  background: #f3ebdc;
  overflow-x: auto;
  scrollbar-width: none;
  max-width: 100%;
  width: max-content;
}
.tab-nav::-webkit-scrollbar {
  display: none;
}
.tab {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-weight: 600;
  padding: 9px 16px;
  border-radius: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.tab:hover {
  color: var(--text);
}
.tab.active {
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 1px 3px rgba(90, 65, 30, 0.12);
}
.count {
  min-width: 22px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(138, 110, 78, 0.14);
  font-size: 0.78rem;
  text-align: center;
}
.tab.active .count {
  background: var(--pink-soft);
  color: var(--pink-dark);
}
.tab:focus-visible {
  border-radius: 12px;
}
</style>
