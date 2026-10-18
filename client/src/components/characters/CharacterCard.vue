<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { ExternalLink, Check, Archive, StickyNote, TriangleAlert, Star, PawPrint, Folder } from 'lucide-vue-next';
import { CONTENT_WARNINGS } from '@shared/constants.mjs';
import { resolvePet } from '@shared/pets.mjs';
import PetSprite from '@/components/pets/PetSprite.vue';

const WARNING_LABELS = Object.fromEntries(CONTENT_WARNINGS.map((w) => [w.value, w.label]));

// One character from someone's library. With `selectable` the whole card toggles
// (click, Space or Enter) for picking characters in the event sign-up form.
// The `actions` slot is for buttons along the bottom (edit, archive...).
// The tile shows the character as their little screen pet. `library` adds the owner-only bits
// (favourite star, folder, whether their pet is out); `to` makes the name a link.
const props = defineProps({
  character: { type: Object, required: true },
  selectable: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  showLinks: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
  library: { type: Boolean, default: false },
  to: { type: [String, Object], default: null },
});
const emit = defineEmits(['toggle']);

// Theme variables, so the tiles follow dark mode
const TILE_COLOURS = ['var(--pink-soft)', 'var(--info-soft)', 'var(--success-soft)', 'var(--warning-soft)', 'var(--purple-soft)', 'var(--orange-soft)'];
const TILE_TEXT = ['var(--pink-dark)', 'var(--info)', 'var(--success)', 'var(--warning)', 'var(--purple-ink)', 'var(--orange-ink)'];

// Same name always gets the same colour
const tileIndex = computed(() => {
  const name = props.character.name || '?';
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % TILE_COLOURS.length;
});
const pet = computed(() => resolvePet(props.character));
const colours = computed(() => (props.character.colours || []).filter((c) => /^#[0-9a-f]{6}$/i.test(c)));
const subtitle = computed(() => [props.character.species, props.character.pronouns].filter(Boolean).join(' · '));

// Only show real web links (never javascript: or similar)
const links = computed(() =>
  (props.character.referenceLinks || []).filter((l) => /^https?:\/\//i.test(String(l.url || '')))
);

function linkText(link) {
  if (link.label) return link.label;
  try {
    return new URL(link.url).hostname.replace(/^www\./, '');
  } catch {
    return link.url;
  }
}

const warnings = computed(() => (props.character.contentWarnings || []).map((w) => WARNING_LABELS[w] || w));

const interactive = computed(() => props.selectable && !props.disabled);

function onClick(e) {
  if (!interactive.value) return;
  // Clicking a reference link or an action button shouldn't also select the card
  if (e.target.closest('a, button, input, textarea, select')) return;
  emit('toggle');
}

function onKeydown(e) {
  if (!interactive.value || e.target !== e.currentTarget) return;
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    emit('toggle');
  }
}
</script>

<template>
  <article
    class="character-card card"
    :class="{ compact, selectable, selected: selectable && selected, disabled, archived: character.archived }"
    :role="selectable ? 'checkbox' : undefined"
    :aria-checked="selectable ? (selected ? 'true' : 'false') : undefined"
    :aria-disabled="selectable && disabled ? 'true' : undefined"
    :aria-label="selectable ? `${character.name}${character.species ? `, ${character.species}` : ''}` : undefined"
    :tabindex="interactive ? 0 : undefined"
    @click="onClick"
    @keydown="onKeydown"
  >
    <div class="head">
      <span class="tile" :style="{ background: TILE_COLOURS[tileIndex], color: TILE_TEXT[tileIndex] }" aria-hidden="true">
        <PetSprite :kind="pet.kind" :palette="pet.palette" state="sit" :size="compact ? 36 : 44" />
      </span>
      <div class="title-block">
        <h3 class="name">
          <RouterLink v-if="to" :to="to" class="name-link">{{ character.name }}</RouterLink>
          <template v-else>{{ character.name }}</template>
          <Star v-if="library && character.favourite" :size="16" class="fav" fill="currentColor" aria-label="Favourite" />
        </h3>
        <p v-if="subtitle" class="species">{{ subtitle }}</p>
      </div>

      <span v-if="character.archived" class="badge badge-muted archived-badge">
        <Archive :size="13" aria-hidden="true" /> Archived
      </span>
      <span v-if="selectable" class="check" :class="{ on: selected }" aria-hidden="true">
        <Check v-if="selected" :size="16" :stroke-width="3" />
      </span>
    </div>

    <p v-if="library && (character.folder || (character.pet?.shown && !character.archived))" class="meta">
      <span v-if="character.folder" class="folder"><Folder :size="13" aria-hidden="true" /> {{ character.folder }}</span>
      <span v-if="character.pet?.shown && !character.archived" class="pet-badge"><PawPrint :size="13" aria-hidden="true" /> Out on screen</span>
    </p>

    <p v-if="character.description && !compact" class="description">{{ character.description }}</p>

    <ul v-if="colours.length" class="colours" aria-label="Colour palette">
      <li v-for="c in colours" :key="c" class="colour" :style="{ background: c }" :title="c">
        <span class="sr-only">{{ c }}</span>
      </li>
    </ul>

    <ul v-if="character.tags?.length" class="tags" aria-label="Tags">
      <li v-for="tag in compact ? character.tags.slice(0, 5) : character.tags" :key="tag" class="tag">{{ tag }}</li>
      <li v-if="compact && character.tags.length > 5" class="tag more">+{{ character.tags.length - 5 }}</li>
    </ul>

    <p v-if="warnings.length" class="cw">
      <TriangleAlert :size="15" aria-hidden="true" />
      <span><span class="cw-label">{{ compact ? 'Warnings:' : 'Heads up, the references show:' }}</span> {{ warnings.join(', ') }}</span>
    </p>

    <ul v-if="showLinks && links.length" class="links" aria-label="Reference links">
      <li v-for="(link, i) in links" :key="`${i}-${link.url}`">
        <a :href="link.url" target="_blank" rel="noopener noreferrer" class="ref-link" @click.stop>
          <ExternalLink :size="14" aria-hidden="true" />
          <span>{{ linkText(link) }}</span>
          <span class="sr-only">(opens in a new tab)</span>
        </a>
      </li>
    </ul>

    <div v-if="character.notesForArtists && !compact" class="notes">
      <StickyNote :size="15" aria-hidden="true" />
      <p><span class="notes-label">Notes for artists:</span> {{ character.notesForArtists }}</p>
    </div>

    <div v-if="$slots.default" class="extra">
      <slot />
    </div>

    <div v-if="$slots.actions" class="actions">
      <slot name="actions" />
    </div>
  </article>
</template>

<style scoped>
.cw {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  padding: 6px 10px;
  border-radius: 10px;
  background: var(--warning-soft);
  color: var(--warning);
  font-size: 0.85rem;
}
.cw svg {
  flex-shrink: 0;
  margin-top: 2px;
}
.cw-label {
  font-weight: 700;
}
.character-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  min-width: 0;
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
}
.character-card.compact {
  padding: 14px 16px;
  gap: 10px;
}
.character-card.archived {
  background: var(--surface-2);
}
.selectable {
  cursor: pointer;
  user-select: none;
}
.selectable:hover:not(.disabled) {
  border-color: var(--pink-line);
}
.selected {
  border-color: var(--pink);
  box-shadow: 0 0 0 2px var(--pink-soft), var(--shadow);
}
.selectable:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring, 0 0 0 3px rgba(236, 106, 147, 0.35));
  border-radius: var(--radius-lg);
}
.disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.head {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.tile {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  display: grid;
  place-items: end center;
  flex-shrink: 0;
  overflow: hidden;
  padding-bottom: 2px;
}
.compact .tile {
  width: 42px;
  height: 42px;
  border-radius: 13px;
}
.name {
  display: flex;
  align-items: center;
  gap: 6px;
}
.name-link {
  color: inherit;
}
.name-link:hover {
  color: var(--pink-dark);
}
.fav {
  flex-shrink: 0;
  color: var(--warning);
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: -4px 0 0;
}
.folder,
.pet-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 10px;
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 600;
}
.pet-badge {
  background: var(--pink-soft);
  color: var(--pink-dark);
}
.colours {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  gap: 4px;
}
.colour {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
}
.compact .colour {
  width: 16px;
  height: 16px;
}
.title-block {
  min-width: 0;
  flex: 1;
}
.name {
  font-size: 1.2rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.compact .name {
  font-size: 1.05rem;
}
.species {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 0.92rem;
  overflow-wrap: anywhere;
}
.archived-badge {
  gap: 5px;
  padding: 3px 10px;
  font-size: 0.78rem;
  flex-shrink: 0;
}
.check {
  width: 24px;
  height: 24px;
  border-radius: 8px;
  border: 2px solid var(--border);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: #fff;
  background: var(--surface);
}
.check.on {
  background: var(--pink);
  border-color: var(--pink);
}
.description {
  margin: 0;
  color: var(--text);
  font-size: 0.95rem;
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-line;
}
.tags,
.links {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tag {
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--chip);
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 600;
}
.tag.more {
  background: transparent;
  border: 1px dashed var(--border);
}
.ref-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 3px 10px;
  border-radius: 10px;
  background: var(--pink-soft);
  color: var(--pink-dark);
  font-size: 0.85rem;
  font-weight: 600;
}
.ref-link span:not(.sr-only) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
}
.ref-link:hover {
  background: var(--pink-line);
}
.notes {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--surface-2);
  color: var(--text);
  font-size: 0.9rem;
}
.notes :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
  color: var(--muted);
}
.notes p {
  margin: 0;
  line-height: 1.5;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.notes-label {
  font-weight: 700;
}
.extra {
  font-size: 0.9rem;
  color: var(--muted);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
</style>
