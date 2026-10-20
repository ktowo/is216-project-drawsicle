<script setup>
import { computed, useId } from 'vue';
import { RouterLink } from 'vue-router';
import { Sparkles } from 'lucide-vue-next';
import PetSprite from '@/components/pets/PetSprite.vue';
import PetStage from '@/components/pets/PetStage.vue';
import { PET_KINDS, PET_PALETTES, MAX_SHOWN_PETS, resolvePet } from '@shared/pets.mjs';

// The "Screen pet" part of the character form: whether this character is out as a pet, what
// kind of animal and which colours. Blank kind/palette means "work it out from the character".
//   v-model: { shown, kind, palette }    character: the form values (name, species, tags, colours)
//   othersShown: how many of the person's other characters are out as pets right now
const props = defineProps({
  modelValue: { type: Object, required: true },
  character: { type: Object, required: true },
  othersShown: { type: Number, default: 0 },
  error: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue']);

const id = `pet-${useId()}`;
const pet = computed(() => props.modelValue || {});
const name = computed(() => props.character.name?.trim() || 'Your character');
const full = computed(() => props.othersShown >= MAX_SHOWN_PETS && !pet.value.shown);

function set(field, value) {
  emit('update:modelValue', { ...pet.value, [field]: value });
}

const KIND_LABELS = Object.fromEntries(PET_KINDS.map((k) => [k.value, k.label]));
const looks = computed(() => resolvePet({ ...props.character, name: name.value, pet: pet.value }));
const autoKind = computed(() => resolvePet({ ...props.character, name: name.value, pet: { ...pet.value, kind: '' } }).kind);

// Each kind as it would look with the colours picked below
const kinds = computed(() =>
  PET_KINDS.map((k) => ({
    ...k,
    palette: resolvePet({ ...props.character, name: name.value, pet: { kind: k.value, palette: pet.value.palette } }).palette,
  }))
);

// The "their own colours" swatch: the character's palette, or the kind's usual colours
const ownColours = computed(() => {
  const p = resolvePet({ ...props.character, name: name.value, pet: { kind: looks.value.kind, palette: '' } }).palette;
  return `conic-gradient(${p.body} 0 50%, ${p.accent} 50% 75%, ${p.belly} 75%)`;
});
const swatch = (p) => `conic-gradient(${p.body} 0 50%, ${p.accent} 50% 75%, ${p.belly} 75%)`;
</script>

<template>
  <section class="pet-settings" :aria-labelledby="`${id}-title`">
    <div class="intro">
      <h2 :id="`${id}-title`" class="title"><Sparkles :size="18" aria-hidden="true" /> Screen pet</h2>
      <p class="hint m-0">
        Any character can come out as a little pet that wanders round the edges of Drawsicle. You can feed them, pet them and pick them up.
        <RouterLink to="/pets">Meet all the pets</RouterLink>
      </p>
    </div>

    <div class="layout">
      <div class="preview">
        <PetStage :kind="looks.kind" :palette="looks.palette" :name="name" :size="76" :height="132" />
        <p class="preview-caption">{{ name }} as a {{ KIND_LABELS[looks.kind].toLowerCase() }}</p>
      </div>

      <div class="controls">
        <label class="switch-row" :class="{ disabled: full }">
          <input
            type="checkbox"
            role="switch"
            class="switch-input"
            :checked="pet.shown"
            :disabled="full"
            :aria-describedby="`${id}-switch-hint`"
            @change="set('shown', $event.target.checked)"
          />
          <span class="switch" aria-hidden="true" />
          <span class="switch-label">Let {{ name }} out on screen</span>
        </label>
        <p :id="`${id}-switch-hint`" class="hint switch-hint" :class="{ warn: full }">
          <template v-if="full">
            You already have {{ MAX_SHOWN_PETS }} pets out. Put one away in your
            <RouterLink to="/characters">library</RouterLink> first.
          </template>
          <template v-else>Up to {{ MAX_SHOWN_PETS }} at once. They keep to the sides, out of your way.</template>
        </p>
        <p v-if="error" class="field-error" role="alert">{{ error }}</p>
      </div>
    </div>

    <fieldset class="group">
      <legend class="label">What kind of pet</legend>
      <div class="kind-grid">
        <label class="kind-option" :class="{ on: !pet.kind }">
          <input type="radio" class="sr-only" :name="`${id}-kind`" value="" :checked="!pet.kind" @change="set('kind', '')" />
          <PetSprite :kind="autoKind" :palette="kinds.find((k) => k.value === autoKind).palette" state="sit" :size="44" />
          <span class="kind-name">Match species</span>
          <span class="kind-sub">{{ KIND_LABELS[autoKind] }}</span>
        </label>
        <label v-for="k in kinds" :key="k.value" class="kind-option" :class="{ on: pet.kind === k.value }">
          <input
            type="radio"
            class="sr-only"
            :name="`${id}-kind`"
            :value="k.value"
            :checked="pet.kind === k.value"
            @change="set('kind', k.value)"
          />
          <PetSprite :kind="k.value" :palette="k.palette" state="stand" :size="44" />
          <span class="kind-name">{{ k.label }}</span>
        </label>
      </div>
    </fieldset>

    <fieldset class="group">
      <legend class="label">Colours</legend>
      <div class="palette-row">
        <label class="palette-option" :class="{ on: !pet.palette }">
          <input type="radio" class="sr-only" :name="`${id}-palette`" value="" :checked="!pet.palette" @change="set('palette', '')" />
          <span class="swatch" :style="{ background: ownColours }" aria-hidden="true" />
          {{ (character.colours || []).length ? 'Their colours' : 'Usual colours' }}
        </label>
        <label v-for="(p, key) in PET_PALETTES" :key="key" class="palette-option" :class="{ on: pet.palette === key }">
          <input
            type="radio"
            class="sr-only"
            :name="`${id}-palette`"
            :value="key"
            :checked="pet.palette === key"
            @change="set('palette', key)"
          />
          <span class="swatch" :style="{ background: swatch(p) }" aria-hidden="true" />
          {{ p.label }}
        </label>
      </div>
    </fieldset>
  </section>
</template>

<style scoped>
.pet-settings {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 4px;
  font-size: 1.15rem;
}
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: 18px;
  align-items: center;
}
.preview-caption {
  margin: 6px 0 0;
  text-align: center;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--muted);
}
.switch-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 700;
  cursor: pointer;
}
.switch-row.disabled {
  cursor: not-allowed;
  opacity: 0.7;
}
.switch-input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}
.switch {
  position: relative;
  flex-shrink: 0;
  width: 46px;
  height: 26px;
  border-radius: 999px;
  background: var(--border-strong);
  transition: background 0.2s;
}
.switch::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.switch-input:checked + .switch {
  background: var(--pink);
}
.switch-input:checked + .switch::after {
  transform: translateX(20px);
}
.switch-input:focus-visible + .switch {
  outline: 2px solid var(--pink);
  outline-offset: 2px;
}
.switch-hint {
  margin: 8px 0 0;
}
.switch-hint.warn {
  color: var(--warning);
}
.group {
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}
.group .label {
  margin-bottom: 8px;
}
.kind-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 8px;
}
.kind-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 4px 8px;
  border: 1.5px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  cursor: pointer;
  text-align: center;
  transition:
    border-color 0.15s,
    background 0.15s,
    transform 0.15s;
}
.kind-option:hover {
  background: var(--hover);
  transform: translateY(-2px);
}
.kind-option.on {
  border-color: var(--pink);
  background: var(--pink-soft);
}
.kind-option:focus-within {
  outline: 2px solid var(--pink);
  outline-offset: 2px;
}
.kind-name {
  font-size: 0.85rem;
  font-weight: 700;
}
.kind-sub {
  font-size: 0.75rem;
  color: var(--muted);
}
.palette-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.palette-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px 5px 6px;
  border: 1.5px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.palette-option:hover {
  background: var(--hover);
}
.palette-option.on {
  border-color: var(--pink);
  background: var(--pink-soft);
  color: var(--pink-dark);
}
.palette-option:focus-within {
  outline: 2px solid var(--pink);
  outline-offset: 2px;
}
.swatch {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
@media (max-width: 640px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
@media (prefers-reduced-motion: reduce) {
  .kind-option,
  .switch,
  .switch::after {
    transition: none;
  }
}
</style>
