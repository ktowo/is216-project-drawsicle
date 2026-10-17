<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { ArrowLeft, ArrowRight } from 'lucide-vue-next';
import BaseModal from '@/components/ui/BaseModal.vue';
import PersonLink from '@/components/events/PersonLink.vue';
import SubmissionDetails from '@/components/events/SubmissionDetails.vue';
import ReportButton from '@/components/ReportButton.vue';
import FavouriteButton from '@/components/FavouriteButton.vue';
import { auth } from '@/stores/auth';

// A closer look at one artwork in the museum, with the ones either side a click away
const props = defineProps({
  items: { type: Array, required: true },
  index: { type: Number, default: -1 }, // -1: closed
});
const emit = defineEmits(['close', 'update:index']);

const item = computed(() => props.items[props.index] || null);
const sub = computed(() => item.value?.submission || null);
const nameOf = (user) => user?.displayName || 'Someone';
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
.nav {
  display: flex;
  gap: 8px;
}
</style>
