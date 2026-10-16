<script setup>
import { ref, computed, watch } from 'vue';
import { Footprints, LayoutGrid } from 'lucide-vue-next';
import MuseumRoom from './MuseumRoom.vue';
import ArtworkViewer from './ArtworkViewer.vue';
import SubmissionGallery from '@/components/events/SubmissionGallery.vue';
import { auth } from '@/stores/auth';
import { PER_ROOM } from '@/museum/layout';

// A wing of the museum: walk around the room, or see the same artworks as a plain gallery.
// items: gallery items ({ submission, giver, recipient, event? }); only those with a gift hang.
const props = defineProps({
  items: { type: Array, required: true },
});

const artworks = computed(() => props.items.filter((i) => i.submission));
const room = ref(0);
const viewing = ref(-1);

// Walk or list, remembered in this browser only
const MODE_KEY = 'drawsicle:museum:mode';
function savedMode() {
  try {
    return localStorage.getItem(MODE_KEY) === 'list' ? 'list' : 'walk';
  } catch {
    return 'walk';
  }
}
const mode = ref(savedMode());
watch(mode, (value) => {
  try {
    localStorage.setItem(MODE_KEY, value);
  } catch {
    // Not remembered; nothing else changes
  }
});

// The artists wander about the rooms too (not you, you're already there)
const visitors = computed(() => {
  const seen = new Set([auth.user?.id]);
  const list = [];
  for (const a of artworks.value) {
    const g = a.giver;
    if (g?.id && !seen.has(g.id)) {
      seen.add(g.id);
      list.push(g);
    }
  }
  return list;
});

function view(artwork) {
  viewing.value = artworks.value.findIndex((a) => a.submission.id === artwork.submission.id);
}
// Paging in the viewer past this room's walls moves you to the room it hangs in
watch(viewing, (i) => {
  if (i >= 0) room.value = Math.floor(i / PER_ROOM);
});
</script>

<template>
  <div class="experience">
    <div class="modes" role="group" aria-label="How to see the artworks">
      <button
        type="button"
        class="btn btn-ghost btn-sm"
        :class="{ on: mode === 'walk' }"
        :aria-pressed="mode === 'walk' ? 'true' : 'false'"
        @click="mode = 'walk'"
      >
        <Footprints :size="16" aria-hidden="true" /> Walk around
      </button>
      <button
        type="button"
        class="btn btn-ghost btn-sm"
        :class="{ on: mode === 'list' }"
        :aria-pressed="mode === 'list' ? 'true' : 'false'"
        @click="mode = 'list'"
      >
        <LayoutGrid :size="16" aria-hidden="true" /> See them as a list
      </button>
    </div>

    <MuseumRoom
      v-if="mode === 'walk'"
      v-model:room="room"
      :artworks="artworks"
      :me="auth.user"
      :visitors="visitors"
      @view="view"
    />
    <SubmissionGallery v-else :items="artworks" />

    <ArtworkViewer v-model:index="viewing" :items="artworks" @close="viewing = -1" />
  </div>
</template>

<style scoped>
.experience {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.modes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 14px;
  align-self: flex-start;
}
.modes .on {
  background: var(--pink-soft);
  color: var(--pink-dark);
}
</style>
