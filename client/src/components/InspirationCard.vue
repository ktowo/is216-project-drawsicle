<script setup>
import { ref, computed, useId } from 'vue';
import { Dices, Copy, RefreshCw, Lightbulb } from 'lucide-vue-next';
import { makePrompt, rerollPart } from '@shared/prompts.mjs';
import { copyText } from '@/utils/events';
import { toast } from '@/stores/toast';

// "Need inspiration?": a drawing prompt (shared/prompts.mjs) with a palette to try. Roll the
// whole thing, or just one line of it. For a giftee, pass their characters and likes so the
// prompts are about them.
const props = defineProps({
  characters: { type: Array, default: () => [] }, // names
  likes: { type: String, default: '' },
  title: { type: String, default: 'Need inspiration?' },
});

const uid = useId();
const options = computed(() => ({ characters: props.characters, likes: props.likes }));
const prompt = ref(makePrompt(Math.random, options.value));

const ROWS = [
  { key: 'who', label: 'Who' },
  { key: 'action', label: 'Doing' },
  { key: 'place', label: 'Where' },
  { key: 'mood', label: 'Mood' },
  { key: 'twist', label: 'Challenge' },
];

function rollAll() {
  prompt.value = makePrompt(Math.random, options.value);
}
function roll(key) {
  prompt.value = rerollPart(prompt.value, key, Math.random, options.value);
}
async function copy() {
  const palette = prompt.value.palette.colours.join(' ');
  const ok = await copyText(`${prompt.value.text}\nPalette: ${palette}`);
  if (ok) toast.success('Prompt copied.');
  else toast.error("Couldn't copy it.");
}
</script>

<template>
  <section class="card panel inspiration" :aria-labelledby="`${uid}-title`">
    <div class="head">
      <h2 :id="`${uid}-title`" class="panel-title small-title"><Lightbulb :size="18" aria-hidden="true" /> {{ title }}</h2>
      <div class="actions">
        <button type="button" class="btn btn-ghost btn-xs" @click="copy"><Copy :size="14" aria-hidden="true" /> Copy</button>
        <button type="button" class="btn btn-primary btn-xs" @click="rollAll"><Dices :size="14" aria-hidden="true" /> New prompt</button>
      </div>
    </div>

    <dl class="rows" aria-live="polite">
      <div v-for="r in ROWS" :key="r.key" class="row">
        <dt>{{ r.label }}</dt>
        <dd>{{ prompt[r.key] }}</dd>
        <button type="button" class="reroll" :aria-label="`Another ${r.label.toLowerCase()}`" :title="`Another ${r.label.toLowerCase()}`" @click="roll(r.key)">
          <RefreshCw :size="14" aria-hidden="true" />
        </button>
      </div>
      <div class="row">
        <dt>Palette</dt>
        <dd class="palette">
          <span v-for="c in prompt.palette.colours" :key="c" class="swatch" :style="{ background: c }" :title="c">
            <span class="sr-only">{{ c }}</span>
          </span>
          <span class="scheme">{{ prompt.palette.scheme }}</span>
        </dd>
        <button type="button" class="reroll" aria-label="Another palette" title="Another palette" @click="roll('palette')">
          <RefreshCw :size="14" aria-hidden="true" />
        </button>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}
.actions {
  display: flex;
  gap: 6px;
}
.rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
}
.row {
  display: grid;
  grid-template-columns: 78px 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 10px;
  background: var(--surface-2);
}
dt {
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
dd {
  margin: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}
dd::first-letter {
  text-transform: uppercase;
}
.palette {
  display: flex;
  align-items: center;
  gap: 6px;
}
.swatch {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
}
.scheme {
  margin-left: 4px;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 600;
}
.reroll {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.reroll:hover,
.reroll:focus-visible {
  background: var(--surface);
  color: var(--pink-dark);
}
@media (prefers-reduced-motion: no-preference) {
  .reroll:active :deep(svg) {
    transform: rotate(180deg);
    transition: transform 0.2s;
  }
}
</style>
