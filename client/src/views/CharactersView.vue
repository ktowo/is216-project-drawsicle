<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import {
  Plus,
  Search,
  X,
  Pencil,
  Archive,
  ArchiveRestore,
  Trash2,
  BookHeart,
  SearchX,
  CalendarHeart,
  Loader2,
  Lock,
  Copy,
  LayoutGrid,
  Rows3,
  Star,
  PawPrint,
  Folder,
} from 'lucide-vue-next';
import PageHeader from '@/components/ui/PageHeader.vue';
import TabNav from '@/components/ui/TabNav.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import CharacterCard from '@/components/characters/CharacterCard.vue';
import PetSprite from '@/components/pets/PetSprite.vue';
import { api, qs } from '@/api';
import { toast } from '@/stores/toast';
import { pluralize } from '@/utils/format';
import { LIMITS } from '@shared/constants.mjs';
import { MAX_SHOWN_PETS, resolvePet } from '@shared/pets.mjs';
import { pets, refreshPets } from '@/stores/pets';

const route = useRoute();
const router = useRouter();

// Tab key -> ?archived= value on GET /characters
const FILTERS = { active: 'false', archived: 'true', all: 'all' };
const TABS = [
  { key: 'active', label: 'Active' },
  { key: 'archived', label: 'Archived' },
  { key: 'all', label: 'All' },
];

const readTab = (value) => (Object.hasOwn(FILTERS, value) ? value : 'active');

const SORTS = [
  { key: 'updated', label: 'Recently updated' },
  { key: 'name', label: 'Name A–Z' },
  { key: 'used', label: 'Most used' },
];
const TAG_CHIPS_MAX = 12;

// Sort order and card size are remembered on this device
const PREFS_KEY = 'drawsicle:characters-view';
function readPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    return {
      sort: SORTS.some((s) => s.key === saved.sort) ? saved.sort : 'updated',
      compact: saved.compact === true,
    };
  } catch {
    return { sort: 'updated', compact: false };
  }
}
const prefs = readPrefs();
const sort = ref(prefs.sort);
const compact = ref(prefs.compact);
watch([sort, compact], () => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ sort: sort.value, compact: compact.value }));
  } catch {
    // Private browsing: it just isn't remembered
  }
});

const tab = ref(readTab(route.query.show));
const characters = ref([]);
const loading = ref(true);
const error = ref('');
const search = ref('');
const busyId = ref(null);

let requestId = 0;
async function load() {
  const id = ++requestId;
  loading.value = true;
  error.value = '';
  try {
    const data = await api(`/characters${qs({ archived: FILTERS[tab.value] })}`);
    if (id !== requestId) return;
    characters.value = data.characters || [];
  } catch (e) {
    if (id !== requestId) return;
    error.value = e.message;
  } finally {
    if (id === requestId) loading.value = false;
  }
}

// The tab lives in the URL so Back from the edit page lands on the same list
watch(tab, (value) => {
  router.replace({ query: value === 'active' ? {} : { show: value } });
  load();
});
watch(
  () => route.query.show,
  (value) => {
    if (route.name === 'characters') tab.value = readTab(value);
  }
);
load();

const query = computed(() => search.value.trim().toLowerCase());
const activeTag = ref('');
const activeFolder = ref('');
const onlyFavourites = ref(false);
const onlyPets = ref(false);

// Folders in this tab, biggest first
const folderChips = computed(() => {
  const counts = new Map();
  for (const c of characters.value) if (c.folder) counts.set(c.folder, (counts.get(c.folder) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count }));
});
watch(folderChips, (chips) => {
  if (activeFolder.value && !chips.some((c) => c.name === activeFolder.value)) activeFolder.value = '';
});
const favouriteCount = computed(() => characters.value.filter((c) => c.favourite).length);

// The pets out on screen right now, drawn in the strip at the top
refreshPets();
const petsOut = computed(() => pets.list.map((c) => ({ id: c.id, ...resolvePet(c) })));

// The most common tags in this tab, for one-click filtering
const tagChips = computed(() => {
  const counts = new Map();
  for (const c of characters.value) for (const tag of c.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TAG_CHIPS_MAX)
    .map(([tag, count]) => ({ tag, count }));
});
// A tag that isn't in this tab any more stops filtering
watch(tagChips, (chips) => {
  if (activeTag.value && !chips.some((c) => c.tag === activeTag.value)) activeTag.value = '';
});

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
const SORTERS = {
  updated: (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0) || byName(a, b),
  name: byName,
  used: (a, b) => (b.eventCount || 0) - (a.eventCount || 0) || byName(a, b),
};

const shown = computed(() => {
  let list = characters.value;
  if (activeFolder.value) list = list.filter((c) => c.folder === activeFolder.value);
  if (onlyFavourites.value) list = list.filter((c) => c.favourite);
  if (onlyPets.value) list = list.filter((c) => c.pet?.shown);
  if (activeTag.value) list = list.filter((c) => (c.tags || []).includes(activeTag.value));
  if (query.value) {
    list = list.filter((c) =>
      [c.name, c.species, c.pronouns, c.folder, ...(c.tags || [])].some((text) => String(text || '').toLowerCase().includes(query.value))
    );
  }
  // Favourites always come first
  return [...list].sort((a, b) => Number(Boolean(b.favourite)) - Number(Boolean(a.favourite)) || SORTERS[sort.value](a, b));
});

const filtering = computed(() => Boolean(query.value || activeTag.value || activeFolder.value || onlyFavourites.value || onlyPets.value));

function clearFilters() {
  search.value = '';
  activeTag.value = '';
  activeFolder.value = '';
  onlyFavourites.value = false;
  onlyPets.value = false;
}

const resultNote = computed(() => {
  if (!filtering.value) return '';
  const n = shown.value.length;
  const what = [
    query.value && `“${search.value.trim()}”`,
    activeTag.value && `the tag “${activeTag.value}”`,
    activeFolder.value && `the folder “${activeFolder.value}”`,
    onlyFavourites.value && 'favourites',
    onlyPets.value && 'pets out on screen',
  ]
    .filter(Boolean)
    .join(' and ');
  return `${pluralize(n, 'character')} ${n === 1 ? 'matches' : 'match'} ${what}`;
});

// ---------- Duplicate ----------

// A starting point for a similar character (an alt form, a sibling): same details, new name
async function duplicate(character) {
  busyId.value = character.id;
  try {
    const suffix = ' (copy)';
    const name = character.name.slice(0, LIMITS.characterName - suffix.length) + suffix;
    const { character: copy } = await api('/characters', {
      method: 'POST',
      body: {
        name,
        species: character.species,
        description: character.description,
        tags: character.tags,
        referenceLinks: character.referenceLinks,
        notesForArtists: character.notesForArtists,
        pronouns: character.pronouns,
        personality: character.personality,
        colours: character.colours,
        folder: character.folder,
        contentWarnings: character.contentWarnings,
        pet: { shown: false, kind: character.pet?.kind || '', palette: character.pet?.palette || '' },
      },
    });
    toast.success(`Made a copy of ${character.name}. Give it its own name and details.`);
    router.push(`/characters/${copy.id}/edit`);
  } catch (e) {
    toast.error(e.message);
  } finally {
    busyId.value = null;
  }
}

// After archive/restore: keep the card only if it still belongs in this tab
function replaceInList(updated) {
  const index = characters.value.findIndex((c) => c.id === updated.id);
  if (index === -1) return;
  const belongs = tab.value === 'all' || (tab.value === 'archived') === Boolean(updated.archived);
  if (belongs) characters.value.splice(index, 1, updated);
  else characters.value.splice(index, 1);
}

async function archive(character) {
  busyId.value = character.id;
  try {
    const { character: updated } = await api(`/characters/${character.id}/archive`, { method: 'POST' });
    replaceInList(updated);
    if (character.pet?.shown) refreshPets();
    toast.success(`${updated.name} archived. It won't show up in new sign-ups.`);
    return true;
  } catch (e) {
    toast.error(e.message);
    return false;
  } finally {
    busyId.value = null;
  }
}

async function restore(character) {
  busyId.value = character.id;
  try {
    const { character: updated } = await api(`/characters/${character.id}/restore`, { method: 'POST' });
    replaceInList(updated);
    toast.success(`${updated.name} is back in your library.`);
  } catch (e) {
    toast.error(e.message);
  } finally {
    busyId.value = null;
  }
}

// ---------- Screen pets ----------

async function togglePet(character) {
  busyId.value = character.id;
  const out = !character.pet?.shown;
  try {
    const { character: updated } = await api(`/characters/${character.id}`, { method: 'PATCH', body: { pet: { shown: out } } });
    replaceInList(updated);
    await refreshPets();
    toast.success(out ? `${updated.name} is out on screen. Say hi!` : `${updated.name} has gone for a nap.`);
  } catch (e) {
    toast.error(e.code === 'TOO_MANY_PETS' ? `You already have ${MAX_SHOWN_PETS} pets out. Put one away first.` : e.message);
  } finally {
    busyId.value = null;
  }
}

// ---------- Delete (or archive instead when the character was offered in an event) ----------

const target = ref(null);
const blocked = ref(false); // true: it's in use, so the dialog offers archiving instead
const dialogBusy = ref(false);

const dialog = computed(() => {
  const name = target.value?.name || 'this character';
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

function askDelete(character) {
  target.value = character;
  blocked.value = Boolean(character.inUse) && !character.archived;
}

function closeDialog() {
  if (dialogBusy.value) return;
  target.value = null;
  blocked.value = false;
}

async function confirmDialog() {
  const character = target.value;
  if (!character) return;
  dialogBusy.value = true;
  try {
    if (blocked.value) {
      if (await archive(character)) {
        dialogBusy.value = false;
        closeDialog();
      }
      return;
    }
    await api(`/characters/${character.id}`, { method: 'DELETE' });
    characters.value = characters.value.filter((c) => c.id !== character.id);
    if (character.pet?.shown) refreshPets();
    toast.success(`${character.name} deleted.`);
    dialogBusy.value = false;
    closeDialog();
  } catch (e) {
    if (e.code === 'CHARACTER_IN_USE') {
      // Offered in an event since the list loaded
      if (character.archived) {
        toast.error(e.message);
        dialogBusy.value = false;
        closeDialog();
      } else {
        character.inUse = true;
        blocked.value = true;
      }
    } else {
      toast.error(e.message);
    }
  } finally {
    dialogBusy.value = false;
  }
}

const emptyCopy = computed(() => {
  if (tab.value === 'archived') {
    return {
      title: 'Nothing archived',
      message: "Characters you archive stay out of new sign-ups but are kept for past events. They'll show up here.",
    };
  }
  return {
    title: 'Your library is empty',
    message:
      'Add your characters once (references, species, notes for artists) and offer them in any event without filling it all in again.',
  };
});
</script>

<template>
  <div class="characters-view">
    <PageHeader
      title="Character library"
      subtitle="Private to you. Characters you offer in an event are shown to its organisers and to the artist matched with you."
    >
      <template #actions>
        <RouterLink to="/characters/new" class="btn btn-primary">
          <Plus :size="18" aria-hidden="true" /> New character
        </RouterLink>
      </template>
    </PageHeader>

    <section class="card pets-strip" aria-labelledby="pets-strip-title">
      <div class="strip-head">
        <h2 id="pets-strip-title" class="strip-title"><PawPrint :size="18" aria-hidden="true" /> Out on screen</h2>
        <span class="strip-count">{{ petsOut.length }}/{{ MAX_SHOWN_PETS }}</span>
        <RouterLink to="/pets" class="strip-link">Meet all the pets</RouterLink>
      </div>
      <ul v-if="petsOut.length" class="strip-pets">
        <li v-for="p in petsOut" :key="p.id">
          <RouterLink :to="{ name: 'character', params: { id: p.id } }" class="strip-pet">
            <PetSprite :kind="p.kind" :palette="p.palette" state="sit" :size="48" />
            <span>{{ p.name }}</span>
          </RouterLink>
        </li>
      </ul>
      <p v-else class="hint m-0">
        None of your characters are out yet. Press <strong>Let out</strong> on any of them to have them wander round the edges of the site.
      </p>
    </section>

    <div class="toolbar">
      <TabNav v-model="tab" :tabs="TABS" aria-label="Show characters" />
      <div class="input-wrap search">
        <Search :size="18" class="input-icon" aria-hidden="true" />
        <label for="character-search" class="sr-only">Search characters</label>
        <input
          id="character-search"
          v-model="search"
          class="input"
          type="search"
          placeholder="Search by name, species or tag"
          autocomplete="off"
          maxlength="80"
        />
        <button v-if="search" type="button" class="clear-btn" aria-label="Clear search" @click="search = ''">
          <X :size="16" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div v-if="characters.length && !loading" class="toolbar secondary">
      <div class="quick-chips" role="group" aria-label="Show only">
        <button
          type="button"
          class="tag-chip"
          :class="{ on: onlyFavourites }"
          :aria-pressed="onlyFavourites ? 'true' : 'false'"
          :disabled="!favouriteCount && !onlyFavourites"
          @click="onlyFavourites = !onlyFavourites"
        >
          <Star :size="14" aria-hidden="true" :fill="onlyFavourites ? 'currentColor' : 'none'" /> Favourites
          <span class="tag-count">{{ favouriteCount }}</span>
        </button>
        <button type="button" class="tag-chip" :class="{ on: onlyPets }" :aria-pressed="onlyPets ? 'true' : 'false'" @click="onlyPets = !onlyPets">
          <PawPrint :size="14" aria-hidden="true" /> Out on screen
        </button>
        <button
          v-for="folder in folderChips"
          :key="folder.name"
          type="button"
          class="tag-chip folder-chip"
          :class="{ on: activeFolder === folder.name }"
          :aria-pressed="activeFolder === folder.name ? 'true' : 'false'"
          @click="activeFolder = activeFolder === folder.name ? '' : folder.name"
        >
          <Folder :size="14" aria-hidden="true" /> {{ folder.name }} <span class="tag-count">{{ folder.count }}</span>
        </button>
      </div>
    </div>

    <div v-if="characters.length && !loading" class="toolbar secondary">
      <div v-if="tagChips.length" class="tag-chips" role="group" aria-label="Filter by tag">
        <button
          v-for="chip in tagChips"
          :key="chip.tag"
          type="button"
          class="tag-chip"
          :class="{ on: activeTag === chip.tag }"
          :aria-pressed="activeTag === chip.tag ? 'true' : 'false'"
          @click="activeTag = activeTag === chip.tag ? '' : chip.tag"
        >
          {{ chip.tag }} <span class="tag-count">{{ chip.count }}</span>
        </button>
      </div>
      <div class="view-controls">
        <label for="character-sort" class="sr-only">Sort characters</label>
        <div class="input-wrap sort-wrap">
          <select id="character-sort" v-model="sort" class="select">
            <option v-for="option in SORTS" :key="option.key" :value="option.key">{{ option.label }}</option>
          </select>
        </div>
        <div class="layout-toggle" role="group" aria-label="Card size">
          <button
            type="button"
            class="btn btn-ghost btn-icon"
            :class="{ on: !compact }"
            :aria-pressed="!compact ? 'true' : 'false'"
            title="Full cards"
            @click="compact = false"
          >
            <LayoutGrid :size="18" aria-hidden="true" />
            <span class="sr-only">Full cards</span>
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-icon"
            :class="{ on: compact }"
            :aria-pressed="compact ? 'true' : 'false'"
            title="Compact cards"
            @click="compact = true"
          >
            <Rows3 :size="18" aria-hidden="true" />
            <span class="sr-only">Compact cards</span>
          </button>
        </div>
      </div>
    </div>

    <LoadingBlock v-if="loading" label="Loading your characters…" />

    <ErrorBlock v-else-if="error" :message="error" @retry="load" />

    <EmptyState
      v-else-if="!characters.length"
      :icon="tab === 'archived' ? Archive : BookHeart"
      :title="emptyCopy.title"
      :message="emptyCopy.message"
    >
      <RouterLink v-if="tab !== 'archived'" to="/characters/new" class="btn btn-primary btn-sm">
        <Plus :size="16" aria-hidden="true" /> Add your first character
      </RouterLink>
      <button v-else type="button" class="btn btn-outline btn-sm" @click="tab = 'active'">Back to active</button>
    </EmptyState>

    <EmptyState
      v-else-if="!shown.length"
      :icon="SearchX"
      title="No matches"
      message="No characters match. Try a name, a species or a different tag."
    >
      <button type="button" class="btn btn-outline btn-sm" @click="clearFilters">Clear filters</button>
    </EmptyState>

    <template v-else>
      <p class="result-note" aria-live="polite">{{ resultNote }}</p>
      <ul class="grid" :class="{ compact }" aria-label="Characters">
        <li v-for="character in shown" :key="character.id">
          <CharacterCard
            :character="character"
            :compact="compact"
            library
            :to="{ name: 'character', params: { id: character.id } }"
            class="h-full"
          >
            <p v-if="character.eventCount" class="in-use">
              <CalendarHeart :size="15" aria-hidden="true" />
              In use in {{ pluralize(character.eventCount, 'event') }}
            </p>

            <template #actions>
              <RouterLink
                :to="`/characters/${character.id}/edit`"
                class="btn btn-ghost btn-xs"
                :aria-label="`Edit ${character.name}`"
              >
                <Pencil :size="15" aria-hidden="true" /> Edit
              </RouterLink>

              <button
                v-if="!character.archived"
                type="button"
                class="btn btn-ghost btn-xs"
                :class="{ 'pet-on': character.pet?.shown }"
                :disabled="busyId === character.id"
                :aria-pressed="character.pet?.shown ? 'true' : 'false'"
                :aria-label="character.pet?.shown ? `Put ${character.name} away` : `Let ${character.name} out on screen`"
                :title="character.pet?.shown ? 'Put this pet away' : 'Let them wander round the screen'"
                @click="togglePet(character)"
              >
                <PawPrint :size="15" aria-hidden="true" /> {{ character.pet?.shown ? 'Put away' : 'Let out' }}
              </button>

              <button
                type="button"
                class="btn btn-ghost btn-xs"
                :disabled="busyId === character.id"
                :aria-label="`Duplicate ${character.name}`"
                title="Make a copy to start a similar character"
                @click="duplicate(character)"
              >
                <Copy :size="15" aria-hidden="true" />
              </button>

              <button
                v-if="character.archived"
                type="button"
                class="btn btn-ghost btn-xs"
                :disabled="busyId === character.id"
                :aria-label="`Restore ${character.name}`"
                @click="restore(character)"
              >
                <Loader2 v-if="busyId === character.id" :size="15" class="spin" aria-hidden="true" />
                <ArchiveRestore v-else :size="15" aria-hidden="true" />
                Restore
              </button>
              <button
                v-else
                type="button"
                class="btn btn-ghost btn-xs"
                :disabled="busyId === character.id"
                :aria-label="`Archive ${character.name}`"
                title="Archive: keep it, but out of new sign-ups"
                @click="archive(character)"
              >
                <Loader2 v-if="busyId === character.id" :size="15" class="spin" aria-hidden="true" />
                <Archive v-else :size="15" aria-hidden="true" />
              </button>

              <button
                v-if="!(character.archived && character.inUse)"
                type="button"
                class="btn btn-ghost btn-xs btn-danger-text push-right"
                :disabled="busyId === character.id"
                :aria-label="`Delete ${character.name}`"
                title="Delete"
                @click="askDelete(character)"
              >
                <Trash2 :size="15" aria-hidden="true" />
              </button>
              <span
                v-else
                class="kept push-right"
                title="Offered in an event, so it's kept for that event's records instead of being deleted"
              >
                <Lock :size="13" aria-hidden="true" /> Kept
                <span class="sr-only">for past events, so it can't be deleted</span>
              </span>
            </template>
          </CharacterCard>
        </li>
      </ul>
    </template>

    <ConfirmDialog
      :open="Boolean(target)"
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
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 22px;
}
.search {
  flex: 0 1 340px;
  min-width: 0;
}
.search .input {
  padding: 11px 0;
}
/* The browser's own clear button doubles up with ours */
.search .input::-webkit-search-cancel-button {
  display: none;
}
.clear-btn {
  border: 0;
  background: none;
  color: var(--muted);
  padding: 4px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.clear-btn:hover {
  background: var(--hover);
  color: var(--text);
}
.result-note {
  margin: -8px 0 14px;
  color: var(--muted);
  font-size: 0.92rem;
}
.result-note:empty {
  display: none;
}
.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
  gap: 18px;
}
.grid.compact {
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
  gap: 12px;
}
.toolbar.secondary {
  margin-top: -8px;
  align-items: flex-start;
}
.pets-strip {
  margin-bottom: 22px;
  padding: 16px 20px;
}
.strip-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-bottom: 10px;
}
.strip-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 1.05rem;
}
.strip-count {
  padding: 1px 9px;
  border-radius: 999px;
  background: var(--pink-soft);
  color: var(--pink-dark);
  font-size: 0.8rem;
  font-weight: 700;
}
.strip-link {
  margin-left: auto;
  font-size: 0.88rem;
  font-weight: 600;
}
.strip-pets {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.strip-pet {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 82px;
  padding: 6px 10px 8px;
  border-radius: 14px;
  background: var(--surface-2);
  color: var(--text);
  font-size: 0.85rem;
  font-weight: 700;
  transition: transform 0.15s;
}
.strip-pet:hover {
  transform: translateY(-3px);
  color: var(--pink-dark);
}
.quick-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tag-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.pet-on {
  color: var(--pink-dark);
}
.tag-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1 1 320px;
  min-width: 0;
}
.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.tag-chip:hover {
  border-color: var(--pink-line);
}
.tag-chip.on {
  background: var(--pink-soft);
  border-color: var(--pink);
  color: var(--pink-dark);
}
.tag-count {
  font-size: 0.75rem;
  color: var(--muted);
}
.tag-chip.on .tag-count {
  color: inherit;
}
.view-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}
.sort-wrap {
  padding: 0 12px;
}
.sort-wrap .select {
  padding: 9px 0;
}
.layout-toggle {
  display: flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 12px;
}
.layout-toggle .btn-icon {
  color: var(--muted);
}
.layout-toggle .btn-icon.on {
  background: var(--pink-soft);
  color: var(--pink-dark);
}
.in-use {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-weight: 600;
  color: var(--muted);
}
.push-right {
  margin-left: auto;
}
.kept {
  align-self: center;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding-right: 6px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--muted);
}

@media (max-width: 640px) {
  .search {
    flex: 1 1 100%;
  }
}
</style>
