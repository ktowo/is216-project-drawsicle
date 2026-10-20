<script setup>
import { computed } from 'vue';
import { ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { ArrowLeft, ArrowRight } from 'lucide-vue-next';
import { Sparkles } from 'lucide-vue-next';
import BaseModal from '@/components/ui/BaseModal.vue';
import PersonLink from '@/components/events/PersonLink.vue';
import SubmissionDetails from '@/components/events/SubmissionDetails.vue';
import ReportButton from '@/components/ReportButton.vue';
import FavouriteButton from '@/components/FavouriteButton.vue';
import { auth } from '@/stores/auth';
import HoloView from '@/components/holo/HoloView.vue';

// A closer look at one artwork in the museum, with the ones either side a click away
const props = defineProps({
  items: { type: Array, required: true },
  index: { type: Number, default: -1 }, // -1: closed
});
const emit = defineEmits(['close', 'update:index']);

const item = computed(() => props.items[props.index] || null);
const sub = computed(() => item.value?.submission || null);
const nameOf = (user) => user?.displayName || 'Someone';

// Holo view: a tilting holographic card of the picture (components/holo)
const holo = ref(false);
// Closing the viewer (or losing its artwork) closes the Holo view for good
watch(item, (now) => {
  if (!now) holo.value = false;
});
</script>

<template>
  <BaseModal :open="Boolean(item)" :title="sub?.title || 'Untitled gift'" size="lg" @close="emit('close')">
    <div v-if="item" class="viewer">
      <p class="credit">
        By <PersonLink :user="item.giver" :size="24" class="who" /> for
        <PersonLink :user="item.recipient" :size="24" class="who" />
        <template v-if="item.event">
          · <RouterLink :to="`/events/${item.event.id}`">{{ item.event.name }}</RouterLink>
        </template>
      </p>
      <SubmissionDetails :submission="sub" :caption="`From ${nameOf(item.giver)} to ${nameOf(item.recipient)}`" :show-title="false" />
      <div class="foot">
        <span class="count">
          <FavouriteButton :submission-id="sub.id" :title="sub.title || 'this gift'" with-label />
          Artwork {{ index + 1 }} of {{ items.length }}
          <button v-if="sub.images?.length" type="button" class="holo-btn" @click="holo = true">
            <Sparkles :size="18" aria-hidden="true" /> Holo view
          </button>
        </span>
        <div class="nav">
          <button type="button" class="btn btn-outline btn-sm" :disabled="index <= 0" @click="emit('update:index', index - 1)">
            <ArrowLeft :size="16" aria-hidden="true" /> Previous
          </button>
          <button
            type="button"
            class="btn btn-outline btn-sm"
            :disabled="index >= items.length - 1"
            @click="emit('update:index', index + 1)"
          >
            Next <ArrowRight :size="16" aria-hidden="true" />
          </button>
        </div>
      </div>
      <ReportButton
        target-type="submission"
        :target-id="sub.id"
        :what="`the gift from ${nameOf(item.giver)}`"
        :own="Boolean(auth.user && item.giver?.id === auth.user.id)"
        look="link"
      />
    </div>
  </BaseModal>
  <HoloView v-if="holo && item" :items="items" :index="index" @update:index="emit('update:index', $event)" @close="holo = false" />
</template>

<style scoped>
.viewer {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.credit {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--muted);
}
.who {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  color: var(--text);
}
.foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.count {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 0.88rem;
  color: var(--muted);
  font-weight: 600;
}
.holo-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border: 0;
  border-radius: 999px;
  font-weight: 800;
  font-size: 0.95rem;
  color: #2f2d2b;
  cursor: pointer;
  background: linear-gradient(110deg, #ffb3d9, #ffe8a3, #b5ffe1, #a9d4ff, #d9bbff, #ffb3d9);
  background-size: 300% 100%;
  box-shadow: 0 6px 20px rgba(201, 120, 255, 0.35), inset 0 0 0 2px rgba(255, 255, 255, 0.7);
  animation: holo-shift 4s linear infinite;
}
.holo-btn:hover {
  box-shadow: 0 10px 26px rgba(201, 120, 255, 0.5), inset 0 0 0 2px rgba(255, 255, 255, 0.9);
}
.holo-btn:focus-visible {
  outline: 3px solid var(--pink);
  outline-offset: 3px;
}
@keyframes holo-shift {
  to {
    background-position: 300% 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .holo-btn {
    animation: none;
  }
}
.nav {
  display: flex;
  gap: 8px;
}
</style>
