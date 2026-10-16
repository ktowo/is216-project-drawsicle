<script setup>
import { computed, watch, nextTick, useId } from 'vue';
import { Plus, Trash2, Link as LinkIcon } from 'lucide-vue-next';
import { LIMITS, CONTENT_WARNINGS } from '@shared/constants.mjs';
import FormField from '@/components/ui/FormField.vue';
import TagInput from '@/components/ui/TagInput.vue';
import ChoiceChips from '@/components/ui/ChoiceChips.vue';

// Every character input. v-model is { name, species, tags, description, referenceLinks, notesForArtists }
// (see emptyCharacter() in ./character-form.js). Each change emits a new object.
// errors: { name, species, tags, description, notesForArtists, referenceLinks, 'referenceLinks.<i>' }
const props = defineProps({
  modelValue: { type: Object, required: true },
  errors: { type: Object, default: () => ({}) },
  idPrefix: { type: String, default: '' },
  // Tags to suggest first, e.g. ones the person already uses on their other characters
  tagSuggestions: { type: Array, default: () => [] },
});
const emit = defineEmits(['update:modelValue']);

const prefix = props.idPrefix || `character-${useId()}`;
const fid = (name) => `${prefix}-${name}`;

const TAG_SUGGESTIONS = [
  'humanoid',
  'anthro',
  'feral',
  'furry',
  'scalie',
  'mecha',
  'robot',
  'monster',
  'fantasy',
  'sci-fi',
  'wings',
  'armour',
  'complex markings',
  'gore',
];

const suggestions = computed(() => [...new Set([...props.tagSuggestions, ...TAG_SUGGESTIONS])]);

const form = computed(() => props.modelValue || {});
const links = computed(() => form.value.referenceLinks || []);

// Latest value we emitted. Two changes in the same tick (autofill, a paste that fires twice)
// would otherwise both start from the old prop and the second would undo the first.
let latest = props.modelValue || {};
watch(
  () => props.modelValue,
  (value) => {
    latest = value || {};
  }
);

function update(field, value) {
  latest = { ...latest, [field]: value };
  emit('update:modelValue', latest);
}

function updateLink(index, field, value) {
  const next = (latest.referenceLinks || []).map((l, i) => (i === index ? { ...l, [field]: value } : l));
  update('referenceLinks', next);
}

async function addLink() {
  const current = latest.referenceLinks || [];
  if (current.length >= LIMITS.referenceLinks) return;
  update('referenceLinks', [...current, { label: '', url: '' }]);
  await nextTick();
  document.getElementById(fid(`link-url-${links.value.length - 1}`))?.focus();
}

function removeLink(index) {
  update(
    'referenceLinks',
    (latest.referenceLinks || []).filter((_, i) => i !== index)
  );
}

const count = (value) => String(value || '').length;
</script>

<template>
  <div class="character-fields">
    <div class="two-col">
      <FormField label="Name" :for-id="fid('name')" :error="errors.name" required>
        <template #default="{ describedby, invalid }">
          <div class="input-wrap">
            <input
              :id="fid('name')"
              class="input"
              :value="form.name"
              :maxlength="LIMITS.characterName"
              autocomplete="off"
              placeholder="e.g. Pip the moth"
              :aria-invalid="invalid ? 'true' : undefined"
              :aria-describedby="describedby"
              @input="update('name', $event.target.value)"
            />
          </div>
        </template>
      </FormField>

      <FormField
        label="Species"
        :for-id="fid('species')"
        :error="errors.species"
        hint="Helps artists know what they're drawing."
      >
        <template #default="{ describedby, invalid }">
          <div class="input-wrap">
            <input
              :id="fid('species')"
              class="input"
              :value="form.species"
              :maxlength="LIMITS.species"
              autocomplete="off"
              placeholder="e.g. moth, dragon, human"
              :aria-invalid="invalid ? 'true' : undefined"
              :aria-describedby="describedby"
              @input="update('species', $event.target.value)"
            />
          </div>
        </template>
      </FormField>
    </div>

    <FormField
      label="Tags"
      :for-id="fid('tags')"
      :error="errors.tags"
      :hint="`Used for matching: artists who can't draw a tag won't be given this character. Up to ${LIMITS.tags}.`"
    >
      <template #default="{ describedby }">
        <TagInput
          :id="fid('tags')"
          :model-value="form.tags || []"
          :max="LIMITS.tags"
          :suggestions="suggestions"
          placeholder="e.g. feral, wings (Enter to add)"
          :aria-describedby="describedby"
          @update:model-value="update('tags', $event)"
        />
      </template>
    </FormField>

    <FormField label="Description" :for-id="fid('description')" :error="errors.description">
      <template #aside>
        <span class="hint">{{ count(form.description) }}/{{ LIMITS.characterDescription }}</span>
      </template>
      <template #default="{ describedby, invalid }">
        <div class="input-wrap">
          <textarea
            :id="fid('description')"
            class="textarea"
            rows="4"
            :value="form.description"
            :maxlength="LIMITS.characterDescription"
            placeholder="Personality, outfit, anything that matters when drawing them…"
            :aria-invalid="invalid ? 'true' : undefined"
            :aria-describedby="describedby"
            @input="update('description', $event.target.value)"
          />
        </div>
      </template>
    </FormField>

    <div class="field">
      <div class="field-head">
        <span :id="fid('links-label')" class="label">Reference links</span>
        <span class="hint">{{ links.length }}/{{ LIMITS.referenceLinks }}</span>
      </div>
      <p class="hint links-hint">Toyhou.se profiles, Google Docs, image hosts. Links must start with https://</p>

      <ul v-if="links.length" class="links" :aria-labelledby="fid('links-label')">
        <li v-for="(link, i) in links" :key="i" class="link-row">
          <div class="link-inputs">
            <div class="input-wrap label-input" :class="{ 'is-invalid': errors[`referenceLinks.${i}`] }">
              <input
                :id="fid(`link-label-${i}`)"
                class="input"
                :value="link.label"
                maxlength="60"
                placeholder="Label (optional)"
                :aria-label="`Link ${i + 1} label`"
                @input="updateLink(i, 'label', $event.target.value)"
              />
            </div>
            <div class="input-wrap url-input" :class="{ 'is-invalid': errors[`referenceLinks.${i}`] }">
              <LinkIcon :size="16" class="input-icon" aria-hidden="true" />
              <input
                :id="fid(`link-url-${i}`)"
                class="input"
                type="url"
                inputmode="url"
                :value="link.url"
                maxlength="500"
                placeholder="https://toyhou.se/…"
                :aria-label="`Link ${i + 1} address`"
                :aria-invalid="errors[`referenceLinks.${i}`] ? 'true' : undefined"
                :aria-describedby="errors[`referenceLinks.${i}`] ? fid(`link-error-${i}`) : undefined"
                @input="updateLink(i, 'url', $event.target.value)"
              />
            </div>
            <button
              type="button"
              class="btn btn-ghost btn-icon remove-link"
              :aria-label="`Remove link ${i + 1}`"
              @click="removeLink(i)"
            >
              <Trash2 :size="18" aria-hidden="true" />
            </button>
          </div>
          <p v-if="errors[`referenceLinks.${i}`]" :id="fid(`link-error-${i}`)" class="field-error">
            {{ errors[`referenceLinks.${i}`] }}
          </p>
        </li>
      </ul>

      <p v-if="errors.referenceLinks" class="field-error">{{ errors.referenceLinks }}</p>

      <div>
        <button
          type="button"
          class="btn btn-outline btn-sm"
          :disabled="links.length >= LIMITS.referenceLinks"
          @click="addLink"
        >
          <Plus :size="16" aria-hidden="true" /> Add a link
        </button>
      </div>
    </div>

    <FormField
      label="Notes for artists"
      :for-id="fid('notes')"
      :error="errors.notesForArtists"
      hint="Shown to whoever draws this character, e.g. 'Scar is on the left eye'."
    >
      <template #aside>
        <span class="hint">{{ count(form.notesForArtists) }}/{{ LIMITS.notesForArtists }}</span>
      </template>
      <template #default="{ describedby, invalid }">
        <div class="input-wrap">
          <textarea
            :id="fid('notes')"
            class="textarea notes"
            rows="3"
            :value="form.notesForArtists"
            :maxlength="LIMITS.notesForArtists"
            placeholder="Things to keep in mind, things to avoid…"
            :aria-invalid="invalid ? 'true' : undefined"
            :aria-describedby="describedby"
            @input="update('notesForArtists', $event.target.value)"
          />
        </div>
      </template>
    </FormField>

    <fieldset class="warnings">
      <legend :id="fid('cw')" class="label">Content warnings <span class="hint">(optional)</span></legend>
      <p class="hint warnings-hint">If the reference art shows any of these, say so. Artists see it before they open the links.</p>
      <ChoiceChips
        :model-value="form.contentWarnings || []"
        :options="CONTENT_WARNINGS"
        :aria-labelledby="fid('cw')"
        @update:model-value="update('contentWarnings', $event)"
      />
    </fieldset>
  </div>
</template>

<style scoped>
.character-fields {
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.character-fields > .field + .field {
  margin-top: 0;
}
.warnings {
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}
.warnings-hint {
  margin: 2px 0 10px;
}
.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 22px;
}
.two-col > .field + .field {
  margin-top: 0;
}
.two-col > .field {
  min-width: 0;
}
.textarea {
  min-height: 110px;
}
.textarea.notes {
  min-height: 90px;
}
.links-hint {
  margin: -4px 0 0;
}
.links {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.link-inputs {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) auto;
  gap: 8px;
  align-items: center;
}
.link-inputs .input {
  padding: 11px 0;
}
.link-row .field-error {
  margin: 6px 0 0;
}
.remove-link {
  color: var(--muted);
}
.remove-link:hover {
  color: var(--danger);
  background: var(--danger-soft);
}
@media (max-width: 640px) {
  .two-col {
    grid-template-columns: 1fr;
  }
  .link-inputs {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .url-input {
    grid-column: 1 / -1;
    grid-row: 2;
  }
  .link-row {
    padding-bottom: 10px;
    border-bottom: 1px dashed var(--border);
  }
}
</style>
