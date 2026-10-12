<script setup>
import { ref, computed, useId } from 'vue';
import { X, Plus } from 'lucide-vue-next';
import { normalizeTag } from '@shared/constants.mjs';

// Chips input for short tags. Enter or comma adds, Backspace on an empty input removes the last one.
// Tags are normalised (lowercase, trimmed) and de-duplicated.
const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  placeholder: { type: String, default: 'Type and press Enter' },
  max: { type: Number, default: 20 },
  suggestions: { type: Array, default: () => [] },
  id: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue']);
// Attributes are placed by hand: class/style on the wrapper, the rest (aria-*) on the text input
defineOptions({ inheritAttrs: false });

const inputId = props.id || `tags-${useId()}`;
const text = ref('');
const input = ref(null);

const tags = computed(() => (Array.isArray(props.modelValue) ? props.modelValue : []));
const full = computed(() => tags.value.length >= props.max);

const visibleSuggestions = computed(() => {
  const typed = normalizeTag(text.value);
  return props.suggestions
    .map((s) => normalizeTag(s))
    .filter((s, i, all) => s && all.indexOf(s) === i && !tags.value.includes(s))
    .filter((s) => !typed || s.includes(typed))
    .slice(0, 8);
});

function add(raw) {
  const additions = String(raw ?? '')
    .split(',')
    .map(normalizeTag)
    .filter(Boolean);
  if (!additions.length) return;
  const next = [...tags.value];
  for (const tag of additions) {
    if (next.length >= props.max) break;
    if (!next.includes(tag)) next.push(tag);
  }
  if (next.length !== tags.value.length) emit('update:modelValue', next);
}

function commitText() {
  if (!text.value.trim()) return;
  add(text.value);
  text.value = '';
}

function remove(index) {
  const next = tags.value.filter((_, i) => i !== index);
  emit('update:modelValue', next);
  input.value?.focus();
}

function onKeydown(e) {
  if (e.key === 'Enter' || e.key === ',') {
    // Don't submit the surrounding form while typing tags
    e.preventDefault();
    commitText();
  } else if (e.key === 'Backspace' && !text.value && tags.value.length) {
    e.preventDefault();
    emit('update:modelValue', tags.value.slice(0, -1));
  }
}

// Pasting "a, b, c" adds all three at once
function onInput(e) {
  const value = e.target.value;
  if (value.includes(',')) {
    const parts = value.split(',');
    const rest = parts.pop();
    add(parts.join(','));
    text.value = rest;
  } else {
    text.value = value;
  }
}

// Everything except class/style (e.g. aria-describedby) belongs on the text input
function inputAttrs(attrs) {
  const { class: _class, style: _style, ...rest } = attrs;
  return rest;
}

function pickSuggestion(tag) {
  add(tag);
  text.value = '';
  input.value?.focus();
}
</script>

<template>
  <div class="tag-input" :class="$attrs.class" :style="$attrs.style">
    <div class="input-wrap tag-box" :class="{ 'is-disabled': disabled }" @click="input?.focus()">
      <ul v-if="tags.length" class="chips" aria-label="Added tags">
        <li v-for="(tag, i) in tags" :key="tag" class="chip">
          <span>{{ tag }}</span>
          <button
            type="button"
            class="chip-remove"
            :aria-label="`Remove ${tag}`"
            :disabled="disabled"
            @click.stop="remove(i)"
          >
            <X :size="14" aria-hidden="true" />
          </button>
        </li>
      </ul>
      <input
        :id="inputId"
        ref="input"
        class="input tag-text"
        type="text"
        :value="text"
        :placeholder="full ? `Up to ${max} tags` : placeholder"
        :disabled="disabled || full"
        :maxlength="60"
        autocomplete="off"
        enterkeyhint="done"
        v-bind="inputAttrs($attrs)"
        @input="onInput"
        @keydown="onKeydown"
        @blur="commitText"
      />
    </div>

    <div v-if="visibleSuggestions.length && !full && !disabled" class="suggestions">
      <span class="suggest-label">Suggestions:</span>
      <button
        v-for="s in visibleSuggestions"
        :key="s"
        type="button"
        class="suggestion"
        @mousedown.prevent
        @click="pickSuggestion(s)"
      >
        <Plus :size="12" aria-hidden="true" /> {{ s }}
      </button>
    </div>
  </div>
</template>


<style scoped>
.tag-box {
  flex-wrap: wrap;
  gap: 6px 8px;
  padding: 8px 12px;
  min-height: 52px;
  cursor: text;
}
.chips {
  display: contents;
  list-style: none;
  margin: 0;
  padding: 0;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px 4px 12px;
  border-radius: 999px;
  background: var(--pink-soft);
  color: var(--pink-dark);
  font-weight: 600;
  font-size: 0.9rem;
  max-width: 100%;
}
.chip span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chip-remove {
  border: 0;
  background: none;
  color: inherit;
  padding: 3px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.chip-remove:hover {
  background: rgba(217, 82, 125, 0.15);
}
.tag-text {
  flex: 1 1 120px;
  padding: 6px 2px;
  min-width: 120px;
}
.suggestions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}
.suggest-label {
  font-size: 0.82rem;
  color: var(--muted);
  margin-right: 2px;
}
.suggestion {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px dashed var(--border);
  background: var(--surface);
  color: var(--muted);
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.suggestion:hover {
  border-color: var(--pink);
  color: var(--pink-dark);
}
</style>
