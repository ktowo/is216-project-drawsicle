<script setup>
import { play } from '@/effects/sfx';
import { computed, onMounted, ref } from 'vue';
import { Heart } from 'lucide-vue-next';
import { auth } from '@/stores/auth';
import { favourites, loadFavourites, toggleFavourite } from '@/stores/favourites';
import { toast } from '@/stores/toast';

// A heart that saves a gift to your "Saved art" (/saved). Only shown when you're logged in.
//   withLabel: "Save" / "Saved" next to the heart; otherwise just the heart
const props = defineProps({
  submissionId: { type: String, required: true },
  title: { type: String, default: 'this gift' },
  withLabel: { type: Boolean, default: false },
});

const saved = computed(() => favourites.ids.has(props.submissionId));
const busy = ref(false);
onMounted(loadFavourites);

async function toggle() {
  if (busy.value) return;
  busy.value = true;
  try {
    const now = await toggleFavourite(props.submissionId);
    play(now ? 'star' : 'unpop');
    if (now) toast.success('Saved to your saved art.', { quiet: true });
  } catch (e) {
    toast.error(e.message);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <button
    v-if="auth.user"
    type="button"
    class="fav"
    :class="{ on: saved, labelled: withLabel }"
    :aria-pressed="saved ? 'true' : 'false'"
    :aria-label="withLabel ? undefined : saved ? `Unsave ${title}` : `Save ${title}`"
    :title="saved ? 'Saved. Click to unsave' : 'Save to your saved art'"
    @click.stop="toggle"
  >
    <Heart :size="withLabel ? 16 : 18" :fill="saved ? 'currentColor' : 'none'" aria-hidden="true" />
    <span v-if="withLabel">{{ saved ? 'Saved' : 'Save' }}</span>
  </button>
</template>

<style scoped>
.fav {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 34px;
  height: 34px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    color 0.15s,
    border-color 0.15s,
    transform 0.15s;
}
.fav:hover {
  color: var(--pink-dark);
  border-color: var(--pink);
}
.fav.on {
  color: var(--pink-dark);
  border-color: var(--pink);
  background: var(--pink-soft);
}
.fav:focus-visible {
  outline: 3px solid var(--pink);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: no-preference) {
  .fav.on :deep(svg) {
    animation: beat 0.3s ease-out;
  }
}
@keyframes beat {
  50% {
    transform: scale(1.3);
  }
}
</style>
