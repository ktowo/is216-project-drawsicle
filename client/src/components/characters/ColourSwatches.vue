<script setup>
import { nextTick, ref } from 'vue';
import { Plus, X } from 'lucide-vue-next';
import { LIMITS } from '@shared/constants.mjs';
import { PET_PALETTES } from '@shared/pets.mjs';

// A character's colour palette: up to LIMITS.colours hex colours, each with the browser's colour
// picker and a text box for pasting a hex code. v-model is an array like ['#f6a5c0', '#3b2a22'].
const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  idPrefix: { type: String, required: true },
  labelledby: { type: String, default: undefined },
  describedby: { type: String, default: undefined },
});
const emit = defineEmits(['update:modelValue']);

const list = ref(null);
const HEX_RE = /^#[0-9a-f]{6}$/i;
// New swatches start on a soft colour that isn't in the palette yet
const STARTERS = Object.values(PET_PALETTES).map((p) => p.body);

function set(index, value) {
  emit(
    'update:modelValue',
    props.modelValue.map((c, i) => (i === index ? value : c))
  );
}

// Text box: accept "f6a5c0" and "#F6A5C0" alike
function fromText(index, raw) {
  const text = String(raw || '').trim();
  set(index, text && !text.startsWith('#') ? `#${text}` : text.toLowerCase());
}

async function add() {
  if (props.modelValue.length >= LIMITS.colours) return;
  const used = new Set(props.modelValue.map((c) => c.toLowerCase()));
  const colour = STARTERS.find((c) => !used.has(c)) || '#f6a5c0';
  emit('update:modelValue', [...props.modelValue, colour]);
  await nextTick();
  const pickers = list.value?.querySelectorAll('input[type="color"]');
  pickers?.[pickers.length - 1]?.focus();
}

function remove(index) {
  emit(
    'update:modelValue',
    props.modelValue.filter((_, i) => i !== index)
  );
}

const pickerValue = (c) => (HEX_RE.test(c) ? c.toLowerCase() : '#000000');
</script>

<template>
  <div class="swatches">
    <ul v-if="modelValue.length" ref="list" class="swatch-list" :aria-labelledby="labelledby">
      <li v-for="(colour, i) in modelValue" :key="i" class="swatch-item">
        <input
          :id="`${idPrefix}-colour-${i}`"
          type="color"
          class="picker"
          :value="pickerValue(colour)"
          :aria-label="`Colour ${i + 1}`"
          :aria-describedby="describedby"
          @input="set(i, $event.target.value)"
        />
        <input
          class="hex"
          :value="colour"
          maxlength="7"
          spellcheck="false"
          autocomplete="off"
          :aria-label="`Colour ${i + 1} hex code`"
          @change="fromText(i, $event.target.value)"
        />
        <button type="button" class="remove" :aria-label="`Remove colour ${i + 1}`" @click="remove(i)">
          <X :size="14" aria-hidden="true" />
        </button>
      </li>
    </ul>
    <button
      type="button"
      class="btn btn-outline btn-sm add"
      :disabled="modelValue.length >= LIMITS.colours"
      :aria-describedby="describedby"
      @click="add"
    >
      <Plus :size="16" aria-hidden="true" /> Add a colour
    </button>
  </div>
</template>

<style scoped>
.swatches {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.swatch-list {
  display: contents;
  list-style: none;
}
.swatch-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px 4px 4px;
  border: 1.5px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
}
.picker {
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  cursor: pointer;
}
.picker::-webkit-color-swatch-wrapper {
  padding: 0;
}
.picker::-webkit-color-swatch {
  border: 0;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
}
.picker::-moz-color-swatch {
  border: 0;
  border-radius: 50%;
}
.picker:focus-visible {
  outline: 2px solid var(--pink);
  outline-offset: 2px;
}
.hex {
  width: 7ch;
  padding: 4px 0;
  border: 0;
  background: none;
  color: var(--text);
  font: inherit;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85rem;
}
.hex:focus {
  outline: none;
  text-decoration: underline;
  text-decoration-color: var(--pink);
}
.remove {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--muted);
  cursor: pointer;
}
.remove:hover {
  background: var(--danger-soft);
  color: var(--danger);
}
</style>
