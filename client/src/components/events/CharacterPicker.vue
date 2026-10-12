<script setup>
import { ref, computed, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { Plus, Trash2, Search, Users } from 'lucide-vue-next';
import CharacterCard from '@/components/characters/CharacterCard.vue';
import CharacterFields from '@/components/characters/CharacterFields.vue';
import { LIMITS } from '@shared/constants.mjs';
import { emptyCharacterDraft } from '@/utils/events';

// Pick characters from the library and/or type in new ones (saved to the library on submit).
//   <CharacterPicker v-model:selected-ids="ids" v-model:new-characters="drafts" :characters="library" />
const props = defineProps({
  characters: { type: Array, default: () => [] }, // the user's active library
  offered: { type: Array, default: () => [] }, // characters on an existing sign-up (may include archived ones)
  max: { type: Number, default: LIMITS.offeredCharactersMax },
  min: { type: Number, default: LIMITS.offeredCharactersMin },
  newErrors: { type: Array, default: () => [] }, // per new character: { field: message }
  idPrefix: { type: String, default: 'picker' },
});

const selectedIds = defineModel('selectedIds', { type: Array, default: () => [] });
const newCharacters = defineModel('newCharacters', { type: Array, default: () => [] });

const query = ref('');
const limitNote = ref('');

// Stable keys for the new-character blocks so typing never loses focus
let keySeed = 0;
const draftKeys = ref([]);
watch(
  () => newCharacters.value.length,
  (length) => {
    while (draftKeys.value.length < length) draftKeys.value.push(`draft-${keySeed++}`);
    if (draftKeys.value.length > length) draftKeys.value.splice(length);
  },
  { immediate: true }
);

// Library plus anything already offered that is no longer in it (archived since)
const allCharacters = computed(() => {
  const ids = new Set(props.characters.map((c) => c.id));
  const extra = props.offered.filter((c) => c && !ids.has(c.id)).map((c) => ({ ...c, archived: true }));
  return [...props.characters, ...extra];
});

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return allCharacters.value;
  return allCharacters.value.filter((c) =>
    [c.name, c.species, ...(c.tags || [])].some((v) => String(v || '').toLowerCase().includes(q))
  );
});

const total = computed(() => selectedIds.value.length + newCharacters.value.length);
const atMax = computed(() => total.value >= props.max);

watch(total, (n) => {
  if (n < props.max) limitNote.value = '';
});

function isSelected(id) {
  return selectedIds.value.includes(id);
}

function toggle(character) {
  if (isSelected(character.id)) {
    selectedIds.value = selectedIds.value.filter((id) => id !== character.id);
    return;
  }
  if (character.archived) {
    limitNote.value = `${character.name} is archived. Restore it in your character library to offer it again.`;
    return;
  }
  if (atMax.value) {
    limitNote.value = `You can offer up to ${props.max} characters. Unselect one first.`;
    return;
  }
  selectedIds.value = [...selectedIds.value, character.id];
}

function addNew() {
  if (atMax.value) {
    limitNote.value = `You can offer up to ${props.max} characters.`;
    return;
  }
  newCharacters.value = [...newCharacters.value, emptyCharacterDraft()];
  draftKeys.value.push(`draft-${keySeed++}`);
}

function removeNew(index) {
  draftKeys.value.splice(index, 1);
  newCharacters.value = newCharacters.value.filter((_, i) => i !== index);
}

function updateNew(index, value) {
  newCharacters.value = newCharacters.value.map((c, i) => (i === index ? value : c));
}
</script>

<template>
  <div class="picker">
    <div class="picker-head">
      <p class="count" aria-live="polite">
        <strong>{{ total }}</strong> of {{ max }} selected
        <span v-if="total < min" class="need">· pick at least {{ min }}</span>
      </p>
      <div v-if="allCharacters.length > 6" class="input-wrap search">
        <Search :size="16" class="input-icon" aria-hidden="true" />
        <input
          v-model="query"
          :id="`${idPrefix}-search`"
          class="input"
          type="search"
          placeholder="Filter your characters"
          aria-label="Filter your characters"
        />
      </div>
    </div>

    <div v-if="allCharacters.length" class="grid">
      <CharacterCard
        v-for="c in filtered"
        :key="c.id"
        :character="c"
        selectable
        compact
        :selected="isSelected(c.id)"
        :show-links="false"
        @toggle="toggle(c)"
      />
      <p v-if="!filtered.length" class="hint no-match">No characters match "{{ query }}".</p>
    </div>
    <div v-else class="empty">
      <Users :size="22" aria-hidden="true" />
      <p>
        Your character library is empty. Add a character below and it will be saved to your
        <RouterLink to="/characters" target="_blank">library</RouterLink> for next time too.
      </p>
    </div>

    <p v-if="limitNote" class="alert alert-warning" role="status">{{ limitNote }}</p>

    <div v-for="(draft, i) in newCharacters" :key="draftKeys[i]" class="new-character">
      <div class="new-head">
        <h4 class="new-title">New character {{ newCharacters.length > 1 ? i + 1 : '' }}</h4>
        <button type="button" class="btn btn-ghost remove" @click="removeNew(i)">
          <Trash2 :size="16" aria-hidden="true" /> Remove
        </button>
      </div>
      <CharacterFields
        :model-value="draft"
        :errors="newErrors[i] || {}"
        :id-prefix="`${idPrefix}-new-${draftKeys[i]}`"
        @update:model-value="(value) => updateNew(i, value)"
      />
      <p class="hint saved-note">This character will be saved to your library when you send your sign-up.</p>
    </div>

    <button type="button" class="btn btn-outline add" :disabled="atMax" @click="addNew">
      <Plus :size="18" aria-hidden="true" />
      Add a new character
    </button>
  </div>
</template>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.picker-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 16px;
}
.count {
  margin: 0;
  color: var(--muted);
}
.count strong {
  color: var(--text);
}
.need {
  color: var(--pink-dark);
  font-weight: 600;
}
.search {
  flex: 1 1 220px;
  max-width: 320px;
}
.search .input {
  padding: 10px 0;
}
.grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
}
@media (max-width: 520px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
.no-match {
  margin: 0;
}
.empty {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 18px;
  border-radius: 14px;
  border: 1.5px dashed var(--border);
  color: var(--muted);
}
.empty p {
  margin: 0;
}
.alert-warning {
  margin: 0;
  background: var(--color-warning-soft, var(--warning-soft));
  color: var(--color-warning, var(--warning));
}
.new-character {
  border: 1.5px solid var(--border);
  border-radius: 18px;
  padding: 18px 20px 20px;
  background: var(--surface-2);
}
.new-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.new-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.15rem;
}
.remove {
  color: var(--danger);
}
.saved-note {
  margin: 14px 0 0;
}
.add {
  align-self: flex-start;
}
@media (max-width: 520px) {
  .new-character {
    padding: 14px 14px 16px;
  }
  .add {
    align-self: stretch;
  }
}
</style>
