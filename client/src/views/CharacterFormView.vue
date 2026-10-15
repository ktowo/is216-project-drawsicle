<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { useRoute, useRouter, RouterLink, onBeforeRouteLeave } from 'vue-router';
import { Save, Loader2, Trash2, Archive, Ghost, CalendarHeart } from 'lucide-vue-next';
import PageHeader from '@/components/ui/PageHeader.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import CharacterFields from '@/components/characters/CharacterFields.vue';
import CharacterCard from '@/components/characters/CharacterCard.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import {
  emptyCharacter,
  characterToForm,
  characterPayload,
  validateCharacter,
} from '@/components/characters/character-form.js';
import { api } from '@/api';
import { toast } from '@/stores/toast';
import { pluralize } from '@/utils/format';

const ID_PREFIX = 'character';

const route = useRoute();
const router = useRouter();

const isEdit = computed(() => route.name === 'character-edit');
const characterId = computed(() => (isEdit.value ? String(route.params.id) : null));

const character = ref(null); // the saved version (edit page)
const form = ref(emptyCharacter());
const savedSnapshot = ref(JSON.stringify(characterPayload(form.value)));
const errors = ref({});
const formError = ref('');
const saving = ref(false);
const loading = ref(false);
const loadError = ref('');
const notFound = ref(false);
let leaving = false; // set once saved or deleted, so the unsaved-changes check stays quiet

const dirty = computed(() => JSON.stringify(characterPayload(form.value)) !== savedSnapshot.value);

// How the card will look in the library and in sign-ups, as you type
const preview = computed(() => ({
  id: 'preview',
  name: form.value.name.trim() || 'Your character',
  species: form.value.species.trim(),
  tags: form.value.tags || [],
  description: form.value.description.trim(),
  referenceLinks: (form.value.referenceLinks || []).filter((l) => String(l.url || '').trim()),
  notesForArtists: form.value.notesForArtists.trim(),
  archived: Boolean(character.value?.archived),
}));

// Tags from the rest of the library come first in the suggestions, so they stay consistent
const ownTags = ref([]);
async function loadOwnTags() {
  try {
    const { characters = [] } = await api('/characters?archived=all');
    const counts = new Map();
    for (const c of characters) for (const tag of c.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
    ownTags.value = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
  } catch {
    // Suggestions are a nicety; the built-in ones still show
  }
}
loadOwnTags();

const usedIn = computed(() => character.value?.usedIn || []);

async function load() {
  if (!isEdit.value) return;
  loading.value = true;
  loadError.value = '';
  notFound.value = false;
  try {
    const data = await api(`/characters/${encodeURIComponent(characterId.value)}`);
    character.value = data.character;
    form.value = characterToForm(data.character);
    savedSnapshot.value = JSON.stringify(characterPayload(form.value));
  } catch (e) {
    if (e.status === 404 || e.code === 'NOT_FOUND' || e.code === 'INVALID_ID') notFound.value = true;
    else loadError.value = e.message;
  } finally {
    loading.value = false;
  }
}

// /characters/a/edit -> /characters/b/edit reuses this component
watch(characterId, () => {
  character.value = null;
  errors.value = {};
  formError.value = '';
  loadError.value = '';
  notFound.value = false;
  if (!isEdit.value) {
    form.value = emptyCharacter();
    savedSnapshot.value = JSON.stringify(characterPayload(form.value));
  }
  load();
});
load();

const title = computed(() => {
  if (!isEdit.value) return 'New character';
  return character.value ? `Edit ${character.value.name}` : 'Edit character';
});

// First field with a problem, in the order they appear on the page
const FIELD_ORDER = ['name', 'species', 'tags', 'description', 'referenceLinks', 'notesForArtists'];
function focusFirstError() {
  const keys = Object.keys(errors.value);
  const linkKey = keys.find((k) => k.startsWith('referenceLinks.'));
  const first = FIELD_ORDER.find((f) => keys.includes(f) || (f === 'referenceLinks' && linkKey));
  if (!first) return;
  let id = `${ID_PREFIX}-${first}`;
  if (first === 'notesForArtists') id = `${ID_PREFIX}-notes`;
  if (first === 'referenceLinks' && linkKey) id = `${ID_PREFIX}-link-url-${linkKey.split('.')[1]}`;
  nextTick(() => document.getElementById(id)?.focus());
}

async function save() {
  formError.value = '';
  errors.value = validateCharacter(form.value);
  if (Object.keys(errors.value).length) {
    focusFirstError();
    return;
  }

  saving.value = true;
  try {
    const body = characterPayload(form.value);
    const data = isEdit.value
      ? await api(`/characters/${encodeURIComponent(characterId.value)}`, { method: 'PATCH', body })
      : await api('/characters', { method: 'POST', body });
    leaving = true;
    toast.success(isEdit.value ? `${data.character.name} saved.` : `${data.character.name} added to your library.`);
    router.push('/characters');
  } catch (e) {
    if (e.status === 404) {
      notFound.value = true;
    } else {
      formError.value = e.message;
    }
  } finally {
    saving.value = false;
  }
}

// ---------- Delete (archive instead when it was offered in an event) ----------

const confirmOpen = ref(false);
const blocked = ref(false);
const dialogBusy = ref(false);

const dialog = computed(() => {
  const name = character.value?.name || 'this character';
  if (blocked.value) {
    return {
      title: `Archive ${name} instead?`,
      message: `${name} was offered in an event, so organisers and the artist matched with you may still need it. Archived characters stay out of new sign-ups but keep their place in past events.`,
      confirmLabel: 'Archive instead',
      danger: false,
    };
  }
  return {
    title: `Delete ${name}?`,
    message: `${name} and their reference links will be removed from your library. This can't be undone.`,
    confirmLabel: 'Delete character',
    danger: true,
  };
});

const canDelete = computed(() => character.value && !(character.value.archived && character.value.inUse));

function askDelete() {
  blocked.value = Boolean(character.value?.inUse) && !character.value?.archived;
  confirmOpen.value = true;
}

function closeDialog() {
  if (dialogBusy.value) return;
  confirmOpen.value = false;
}

async function confirmDialog() {
  const c = character.value;
  if (!c) return;
  dialogBusy.value = true;
  try {
    if (blocked.value) {
      const { character: updated } = await api(`/characters/${encodeURIComponent(c.id)}/archive`, { method: 'POST' });
      character.value = updated;
      toast.success(`${updated.name} archived. It won't show up in new sign-ups.`);
    } else {
      await api(`/characters/${encodeURIComponent(c.id)}`, { method: 'DELETE' });
      leaving = true;
      toast.success(`${c.name} deleted.`);
      router.push('/characters');
    }
    dialogBusy.value = false;
    confirmOpen.value = false;
  } catch (e) {
    if (e.code === 'CHARACTER_IN_USE' && !c.archived) {
      character.value = { ...c, inUse: true };
      blocked.value = true;
    } else {
      toast.error(e.message);
      dialogBusy.value = false;
      confirmOpen.value = false;
    }
  } finally {
    dialogBusy.value = false;
  }
}

async function restore() {
  const c = character.value;
  if (!c) return;
  try {
    const { character: updated } = await api(`/characters/${encodeURIComponent(c.id)}/restore`, { method: 'POST' });
    character.value = updated;
    toast.success(`${updated.name} is back in your library.`);
  } catch (e) {
    toast.error(e.message);
  }
}

// Ask before throwing away typed-in changes (in-app navigation and closing the tab)
onBeforeRouteLeave(() => {
  if (leaving || !dirty.value) return true;
  return window.confirm('You have unsaved changes to this character. Leave without saving?');
});

function onBeforeUnload(e) {
  if (!leaving && dirty.value) e.preventDefault();
}
watch(
  dirty,
  (isDirty) => {
    if (isDirty) window.addEventListener('beforeunload', onBeforeUnload);
    else window.removeEventListener('beforeunload', onBeforeUnload);
  },
  { immediate: true }
);
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload));
</script>

<template>
  <div class="character-form-view">
    <PageHeader
      :title="title"
      :subtitle="
        isEdit
          ? 'Changes show up wherever this character is offered, including events you have already joined.'
          : 'Save a character once and offer it in any event.'
      "
      back="/characters"
      back-label="Character library"
    />

    <LoadingBlock v-if="loading" label="Loading character…" />

    <EmptyState
      v-else-if="notFound"
      :icon="Ghost"
      title="Character not found"
      message="It may have been deleted, or the link is wrong. Characters are private, so you can only open your own."
    >
      <RouterLink to="/characters" class="btn btn-primary btn-sm">Back to your library</RouterLink>
    </EmptyState>

    <ErrorBlock v-else-if="loadError" :message="loadError" @retry="load" />

    <div v-else class="layout">
      <form class="card panel" novalidate @submit.prevent="save">
        <div v-if="character?.archived" class="alert alert-info notice">
          <Archive :size="18" aria-hidden="true" />
          <span>This character is archived, so it can't be offered in new sign-ups.</span>
          <button type="button" class="btn btn-outline btn-xs" @click="restore">Restore</button>
        </div>
        <p v-else-if="character?.eventCount && !usedIn.length" class="alert alert-info notice">
          <CalendarHeart :size="18" aria-hidden="true" />
          <span>Offered in {{ pluralize(character.eventCount, 'event') }}.</span>
        </p>

        <CharacterFields v-model="form" :errors="errors" :id-prefix="ID_PREFIX" :tag-suggestions="ownTags" />

        <p v-if="formError" class="alert alert-error form-alert" role="alert">{{ formError }}</p>

        <div class="actions">
          <button
            v-if="isEdit && canDelete"
            type="button"
            class="btn btn-ghost btn-sm btn-danger-text delete-btn"
            :disabled="saving"
            @click="askDelete"
          >
            <Trash2 :size="16" aria-hidden="true" /> Delete
          </button>
          <span class="spacer" />
          <RouterLink to="/characters" class="btn btn-outline">Cancel</RouterLink>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            <Loader2 v-if="saving" :size="18" class="spin" aria-hidden="true" />
            <Save v-else :size="18" aria-hidden="true" />
            {{ isEdit ? 'Save changes' : 'Save character' }}
          </button>
        </div>
      </form>

      <aside class="side" aria-label="Preview and events">
        <section aria-labelledby="preview-heading">
          <h2 id="preview-heading" class="side-title">Preview</h2>
          <p class="side-sub">How artists will see this character when you offer it in an event.</p>
          <CharacterCard :character="preview" />
        </section>

        <section v-if="usedIn.length" class="card used-in" aria-labelledby="used-in-heading">
          <h2 id="used-in-heading" class="side-title">
            <CalendarHeart :size="18" aria-hidden="true" /> Offered in {{ pluralize(usedIn.length, 'event') }}
          </h2>
          <ul class="used-list">
            <li v-for="use in usedIn" :key="use.eventId" class="used-item">
              <RouterLink :to="`/events/${use.eventId}`" class="used-name">{{ use.eventName }}</RouterLink>
              <span class="used-badges">
                <StatusBadge :status="use.eventStatus" />
                <StatusBadge :status="use.applicationStatus" kind="application" />
              </span>
            </li>
          </ul>
          <p class="side-sub">Edits show up in these events too, so the artist always has the latest details.</p>
        </section>
      </aside>
    </div>

    <ConfirmDialog
      :open="confirmOpen"
      :title="dialog.title"
      :message="dialog.message"
      :confirm-label="dialog.confirmLabel"
      :danger="dialog.danger"
      :loading="dialogBusy"
      @confirm="confirmDialog"
      @cancel="closeDialog"
    />
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}
.panel {
  padding: 32px;
  max-width: 860px;
}
.side {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 560px;
}
.side-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 4px;
  font-size: 1.1rem;
}
.side-sub {
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 0.9rem;
}
.used-in {
  padding: 18px 20px;
}
.used-list {
  list-style: none;
  margin: 8px 0 12px;
  padding: 0;
}
.used-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 10px;
  padding: 10px 0;
  border-top: 1px solid var(--border);
}
.used-item:first-child {
  border-top: 0;
}
.used-name {
  font-weight: 700;
  overflow-wrap: anywhere;
}
.used-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
/* Side by side once there's room for both, with the preview following you down the form */
@media (min-width: 1200px) {
  .layout {
    grid-template-columns: minmax(0, 1fr) 320px;
  }
  .side {
    position: sticky;
    top: 96px;
  }
}
.notice {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0 0 24px;
}
.notice span {
  flex: 1 1 220px;
}
.form-alert {
  margin: 22px 0 0;
}
.actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 30px;
  padding-top: 22px;
  border-top: 1px solid var(--border);
}
.spacer {
  flex: 1;
}
@media (max-width: 640px) {
  .panel {
    padding: 24px 18px;
  }
  /* Stacked full-width buttons, Save first, so labels never wrap inside a button */
  .actions .btn-primary,
  .actions .btn-outline {
    flex: 1 1 100%;
  }
  .actions .btn-primary {
    order: -1;
  }
  .spacer {
    display: none;
  }
  .delete-btn {
    order: 3;
    width: 100%;
  }
}
</style>
