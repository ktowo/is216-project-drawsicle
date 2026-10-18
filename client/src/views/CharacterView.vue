<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import {
  Pencil,
  Star,
  Ghost,
  Folder,
  Cookie,
  Hand,
  PawPrint,
  Palette,
  ExternalLink,
  StickyNote,
  TriangleAlert,
  CalendarHeart,
  Archive,
  Heart,
  Loader2,
  Copy,
} from 'lucide-vue-next';
import PageHeader from '@/components/ui/PageHeader.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import PetStage from '@/components/pets/PetStage.vue';
import { CONTENT_WARNINGS } from '@shared/constants.mjs';
import { PET_KINDS, MAX_SHOWN_PETS, resolvePet } from '@shared/pets.mjs';
import { api } from '@/api';
import { toast } from '@/stores/toast';
import { refreshPets, fullnessOf, feedPet } from '@/stores/pets';
import { pluralize } from '@/utils/format';
import { isReferenceUrl, linkHref, linkText } from '@/utils/links';

// One character from your library, with their screen pet to play with
const route = useRoute();
const WARNING_LABELS = Object.fromEntries(CONTENT_WARNINGS.map((w) => [w.value, w.label]));
const KIND_LABELS = Object.fromEntries(PET_KINDS.map((k) => [k.value, k.label.toLowerCase()]));

const character = ref(null);
const loading = ref(true);
const error = ref('');
const notFound = ref(false);
const busy = ref('');
const stage = ref(null);
const full = ref(70);

async function load() {
  loading.value = true;
  error.value = '';
  notFound.value = false;
  try {
    const data = await api(`/characters/${encodeURIComponent(route.params.id)}`);
    character.value = data.character;
    full.value = fullnessOf(data.character.id);
  } catch (e) {
    if (e.status === 404 || e.code === 'NOT_FOUND' || e.code === 'INVALID_ID') notFound.value = true;
    else error.value = e.message;
  } finally {
    loading.value = false;
  }
}
watch(
  () => route.params.id,
  (id) => id && route.name === 'character' && load(),
  { immediate: true }
);

const pet = computed(() => (character.value ? resolvePet(character.value) : null));
const subtitle = computed(() => [character.value?.species, character.value?.pronouns].filter(Boolean).join(' · '));
const links = computed(() => (character.value?.referenceLinks || []).filter((l) => isReferenceUrl(l.url)));
const warnings = computed(() => (character.value?.contentWarnings || []).map((w) => WARNING_LABELS[w] || w));
const hearts = computed(() => Math.round(full.value / 20));

async function patch(body) {
  const { character: updated } = await api(`/characters/${encodeURIComponent(character.value.id)}`, { method: 'PATCH', body });
  character.value = { ...character.value, ...updated };
  return updated;
}

async function toggleFavourite() {
  busy.value = 'favourite';
  try {
    const updated = await patch({ favourite: !character.value.favourite });
    toast.success(updated.favourite ? `${updated.name} is a favourite now.` : `${updated.name} is no longer a favourite.`);
  } catch (e) {
    toast.error(e.message);
  } finally {
    busy.value = '';
  }
}

async function togglePet() {
  busy.value = 'pet';
  const out = !character.value.pet?.shown;
  try {
    const updated = await patch({ pet: { shown: out } });
    await refreshPets();
    toast.success(out ? `${updated.name} is out on screen. Say hi!` : `${updated.name} has gone for a nap.`);
    stage.value?.say(out ? 'wheee!' : 'zzz');
  } catch (e) {
    toast.error(e.code === 'TOO_MANY_PETS' ? `You already have ${MAX_SHOWN_PETS} pets out. Put one away first.` : e.message);
  } finally {
    busy.value = '';
  }
}

function feed() {
  const now = feedPet(character.value.id);
  if (now == null) return stage.value?.feed({ full: true });
  full.value = now;
  stage.value?.feed();
}

function pat() {
  stage.value?.pat();
}

async function copyColour(hex) {
  try {
    await navigator.clipboard.writeText(hex);
    toast.success(`Copied ${hex}`);
  } catch {
    toast.info(hex);
  }
}
</script>

<template>
  <div class="character-view">
    <LoadingBlock v-if="loading" label="Loading character…" />

    <EmptyState
      v-else-if="notFound"
      :icon="Ghost"
      title="Character not found"
      message="It may have been deleted, or the link is wrong. Characters are private, so you can only open your own."
    >
      <RouterLink to="/characters" class="btn btn-primary btn-sm">Back to your library</RouterLink>
    </EmptyState>

    <ErrorBlock v-else-if="error" :message="error" @retry="load" />

    <template v-else-if="character">
      <PageHeader :title="character.name" :subtitle="subtitle" back="/characters" back-label="Character library">
        <template #actions>
          <button
            type="button"
            class="btn btn-outline"
            :class="{ 'is-fav': character.favourite }"
            :aria-pressed="character.favourite ? 'true' : 'false'"
            :disabled="busy === 'favourite'"
            @click="toggleFavourite"
          >
            <Star :size="18" aria-hidden="true" :fill="character.favourite ? 'currentColor' : 'none'" />
            {{ character.favourite ? 'Favourite' : 'Add to favourites' }}
          </button>
          <RouterLink :to="{ name: 'character-edit', params: { id: character.id } }" class="btn btn-primary">
            <Pencil :size="18" aria-hidden="true" /> Edit
          </RouterLink>
        </template>
      </PageHeader>

      <p v-if="character.archived" class="alert alert-info notice">
        <Archive :size="18" aria-hidden="true" /> Archived: kept for past events, and out of new sign-ups and the pet parade.
      </p>

      <div class="layout">
        <div class="main">
          <section class="card block" aria-labelledby="about-heading">
            <h2 id="about-heading" class="block-title">About</h2>
            <p v-if="character.folder" class="folder"><Folder :size="14" aria-hidden="true" /> {{ character.folder }}</p>
            <p v-if="character.description" class="prose">{{ character.description }}</p>
            <p v-else class="hint m-0">No description yet.</p>

            <template v-if="character.personality">
              <h3 class="sub-title">Personality</h3>
              <p class="prose">{{ character.personality }}</p>
            </template>

            <ul v-if="character.tags?.length" class="tags" aria-label="Tags">
              <li v-for="tag in character.tags" :key="tag" class="tag">{{ tag }}</li>
            </ul>
          </section>

          <section v-if="character.colours?.length" class="card block" aria-labelledby="colours-heading">
            <h2 id="colours-heading" class="block-title"><Palette :size="18" aria-hidden="true" /> Colour palette</h2>
            <ul class="palette">
              <li v-for="c in character.colours" :key="c">
                <button type="button" class="colour" :title="`Copy ${c}`" @click="copyColour(c)">
                  <span class="colour-dot" :style="{ background: c }" aria-hidden="true" />
                  <span class="colour-hex">{{ c }}</span>
                  <Copy :size="13" aria-hidden="true" class="copy-icon" />
                </button>
              </li>
            </ul>
          </section>

          <section v-if="links.length || character.notesForArtists || warnings.length" class="card block" aria-labelledby="refs-heading">
            <h2 id="refs-heading" class="block-title">For artists</h2>
            <p v-if="warnings.length" class="cw">
              <TriangleAlert :size="16" aria-hidden="true" />
              <span><strong>Heads up, the references show:</strong> {{ warnings.join(', ') }}</span>
            </p>
            <ul v-if="links.length" class="links" aria-label="Reference links">
              <li v-for="(link, i) in links" :key="`${i}-${link.url}`" class="link-row">
                <a v-if="link.url.startsWith('/')" :href="linkHref(link.url)" target="_blank" rel="noopener noreferrer" class="ref-thumb">
                  <img :src="linkHref(link.url)" :alt="`${linkText(link)} for ${character.name}`" loading="lazy" />
                </a>
                <div class="link-body">
                  <a :href="linkHref(link.url)" target="_blank" rel="noopener noreferrer" class="ref-link">
                    <ExternalLink :size="14" aria-hidden="true" /> {{ linkText(link) }}
                    <span class="sr-only">(opens in a new tab)</span>
                  </a>
                  <p v-if="link.note" class="link-note">{{ link.note }}</p>
                </div>
              </li>
            </ul>
            <div v-if="character.notesForArtists" class="notes">
              <StickyNote :size="16" aria-hidden="true" />
              <p class="m-0">{{ character.notesForArtists }}</p>
            </div>
          </section>

          <section v-if="character.usedIn?.length" class="card block" aria-labelledby="used-heading">
            <h2 id="used-heading" class="block-title">
              <CalendarHeart :size="18" aria-hidden="true" /> Offered in {{ pluralize(character.usedIn.length, 'event') }}
            </h2>
            <ul class="used-list">
              <li v-for="use in character.usedIn" :key="use.eventId" class="used-item">
                <RouterLink :to="`/events/${use.eventId}`" class="used-name">{{ use.eventName }}</RouterLink>
                <span class="used-badges">
                  <StatusBadge :status="use.eventStatus" />
                  <StatusBadge :status="use.applicationStatus" kind="application" />
                </span>
              </li>
            </ul>
          </section>
        </div>

        <aside class="card pet-card" aria-labelledby="pet-heading">
          <h2 id="pet-heading" class="block-title"><PawPrint :size="18" aria-hidden="true" /> {{ character.name }} the {{ KIND_LABELS[pet.kind] }}</h2>
          <p class="pet-status" :class="{ out: character.pet?.shown && !character.archived }">
            {{ character.pet?.shown && !character.archived ? 'Out on screen now' : 'Resting in your library' }}
          </p>
          <PetStage ref="stage" :kind="pet.kind" :palette="pet.palette" :name="character.name" :size="84" :height="150" />

          <p class="hearts" :title="`Fullness ${hearts} of 5`">
            <span class="sr-only">Fullness {{ hearts }} of 5</span>
            <Heart
              v-for="i in 5"
              :key="i"
              :size="18"
              aria-hidden="true"
              :class="{ empty: i > hearts }"
              :fill="i > hearts ? 'none' : 'currentColor'"
            />
          </p>
          <div class="pet-actions">
            <button type="button" class="btn btn-primary btn-sm" @click="feed"><Cookie :size="16" aria-hidden="true" /> Feed</button>
            <button type="button" class="btn btn-outline btn-sm" @click="pat"><Hand :size="16" aria-hidden="true" /> Pet</button>
          </div>

          <button
            v-if="!character.archived"
            type="button"
            class="btn btn-sm out-toggle"
            :class="character.pet?.shown ? 'btn-outline' : 'btn-ghost'"
            :aria-pressed="character.pet?.shown ? 'true' : 'false'"
            :disabled="busy === 'pet'"
            @click="togglePet"
          >
            <Loader2 v-if="busy === 'pet'" :size="16" class="spin" aria-hidden="true" />
            <PawPrint v-else :size="16" aria-hidden="true" />
            {{ character.pet?.shown ? `Put ${character.name} away` : `Let ${character.name} out on screen` }}
          </button>
          <RouterLink :to="{ name: 'character-edit', params: { id: character.id }, hash: '#pet' }" class="change-look">
            Change their pet kind or colours
          </RouterLink>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 22px;
  align-items: start;
}
.main {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}
.block {
  padding: 22px 24px;
}
.block-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  font-size: 1.15rem;
}
.sub-title {
  margin: 18px 0 6px;
  font-size: 1rem;
}
.prose {
  margin: 0;
  line-height: 1.6;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.folder {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin: 0 0 12px;
  padding: 2px 10px;
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 600;
}
.tags,
.links,
.palette {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.palette {
  margin: 0;
}
.tag {
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--chip);
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 600;
}
.colour {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px 5px 5px;
  border: 1.5px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.colour:hover {
  background: var(--hover);
}
.colour-dot {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
}
.colour-hex {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85rem;
}
.copy-icon {
  color: var(--muted);
}
.cw {
  display: flex;
  gap: 8px;
  margin: 0 0 12px;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--warning-soft);
  color: var(--warning);
  font-size: 0.9rem;
}
.cw svg {
  flex-shrink: 0;
  margin-top: 2px;
}
.links {
  margin: 0;
  flex-direction: column;
  gap: 12px;
}
.link-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.ref-thumb img {
  display: block;
  width: 96px;
  height: 96px;
  object-fit: cover;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface-2);
}
.link-body {
  min-width: 0;
}
.link-note {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 0.9rem;
  overflow-wrap: anywhere;
}
.ref-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  border-radius: 10px;
  background: var(--pink-soft);
  color: var(--pink-dark);
  font-size: 0.9rem;
  font-weight: 600;
}
.notes {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--surface-2);
  white-space: pre-line;
}
.notes svg {
  flex-shrink: 0;
  margin-top: 3px;
  color: var(--muted);
}
.used-list {
  list-style: none;
  margin: 0;
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
}
.used-badges {
  display: flex;
  gap: 6px;
}
.pet-card {
  position: sticky;
  top: 96px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.pet-card .block-title {
  margin: 0;
  overflow-wrap: anywhere;
}
.pet-status {
  align-self: flex-start;
  margin: -4px 0 0;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 700;
}
.pet-status.out {
  background: var(--pink-soft);
  color: var(--pink-dark);
}
.hearts {
  display: flex;
  justify-content: center;
  gap: 4px;
  margin: 0;
  color: var(--pink);
}
.hearts .empty {
  color: var(--border-strong);
}
.pet-actions {
  display: flex;
  gap: 8px;
}
.pet-actions .btn {
  flex: 1;
}
.out-toggle {
  width: 100%;
}
.change-look {
  text-align: center;
  font-size: 0.88rem;
  font-weight: 600;
}
.is-fav {
  border-color: var(--warning);
  color: var(--warning);
  background: var(--warning-soft);
}
.notice {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 18px;
}
@media (max-width: 960px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .pet-card {
    position: static;
    order: -1;
  }
}
</style>
