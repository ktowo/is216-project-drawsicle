<script setup>
import LinkifiedText from '@/components/ui/LinkifiedText.vue';
import { computed } from 'vue';
import { Check, X, UserMinus, Loader2 } from 'lucide-vue-next';
import BaseModal from '@/components/ui/BaseModal.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import CharacterCard from '@/components/characters/CharacterCard.vue';
import { RouterLink } from 'vue-router';
import UserAvatar from '@/components/UserAvatar.vue';
import { userProfileLink } from '@/utils/events';
import { formatDateTime } from '@/utils/format';
import { typeList, personName } from './helpers';

// Everything one applicant wrote, for organisers deciding on a sign-up.
const props = defineProps({
  open: { type: Boolean, default: false },
  application: { type: Object, default: null },
  canReview: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
});
const emit = defineEmits(['close', 'review']);

const app = computed(() => props.application);
const characters = computed(() => (Array.isArray(app.value?.offeredCharacters) ? app.value.offeredCharacters : []));
const title = computed(() => (app.value ? personName(app.value.user) : 'Sign-up'));
</script>

<template>
  <BaseModal :open="open" :title="title" size="lg" @close="emit('close')">
    <div v-if="app" class="flex flex-col gap-6">
      <div class="flex flex-wrap items-center gap-3.5">
        <UserAvatar :user="app.user" :size="52" />
        <div class="min-w-0 flex-1">
          <p v-if="app.user?.username" class="m-0 text-cocoa">
            <RouterLink :to="userProfileLink(app.user)" class="handle-link">@{{ app.user.username }}</RouterLink>
          </p>
          <p class="m-0 text-sm text-cocoa">Signed up {{ formatDateTime(app.createdAt) }}</p>
        </div>
        <StatusBadge :status="app.status" kind="application" />
      </div>

      <dl class="details">
        <div>
          <dt>Community username</dt>
          <dd>{{ app.communityUsername || '–' }}</dd>
        </div>
        <div>
          <dt>Can make</dt>
          <dd>{{ typeList(app.canCreate) || '–' }}</dd>
        </div>
        <div>
          <dt>Would like to receive</dt>
          <dd>{{ typeList(app.wantsTypes) || '–' }}</dd>
        </div>
        <div>
          <dt>Can't draw</dt>
          <dd>
            <span v-if="!app.cannotDraw?.length">Nothing listed</span>
            <span v-else class="flex flex-wrap gap-1.5">
              <span v-for="tag in app.cannotDraw" :key="tag" class="badge badge-muted">{{ tag }}</span>
            </span>
          </dd>
        </div>
        <div class="wide">
          <dt>Likes</dt>
          <dd class="prose-text">{{ app.likes || 'Nothing listed' }}</dd>
        </div>
        <div v-if="app.wantsTypes?.includes('adoptable')" class="wide">
          <dt>Adopt wishlist</dt>
          <dd><LinkifiedText v-if="app.adoptWishlist" tag="span" class="prose-text" :text="app.adoptWishlist" /><span v-else>Nothing listed</span></dd>
        </div>
        <div class="wide">
          <dt>Please avoid</dt>
          <dd class="prose-text">{{ app.avoid || 'Nothing listed' }}</dd>
        </div>
        <div class="wide">
          <dt>Notes for organisers</dt>
          <dd class="prose-text">{{ app.notes || 'No notes' }}</dd>
        </div>
      </dl>

      <section>
        <h3 class="text-lg font-bold mb-3">Characters offered ({{ characters.length || app.offeredCharacterIds?.length || 0 }})</h3>
        <p v-if="!characters.length" class="hint m-0">Character details aren't available.</p>
        <div v-else class="grid gap-3 sm:grid-cols-2">
          <CharacterCard v-for="c in characters" :key="c.id" :character="c" compact />
        </div>
      </section>
    </div>

    <template v-if="app && canReview && (app.status === 'pending' || app.status === 'accepted' || app.status === 'rejected')" #footer>
      <Loader2 v-if="busy" :size="18" class="spin self-center text-brand" aria-hidden="true" />
      <template v-if="app.status === 'pending'">
        <button type="button" class="btn btn-outline btn-sm btn-danger-text" :disabled="busy" @click="emit('review', 'rejected')">
          <X :size="16" aria-hidden="true" /> Reject
        </button>
        <button type="button" class="btn btn-primary btn-sm" :disabled="busy" @click="emit('review', 'accepted')">
          <Check :size="16" aria-hidden="true" /> Accept
        </button>
      </template>
      <button
        v-else-if="app.status === 'accepted'"
        type="button"
        class="btn btn-outline btn-sm btn-danger-text"
        :disabled="busy"
        @click="emit('review', 'rejected')"
      >
        <UserMinus :size="16" aria-hidden="true" /> Remove from event
      </button>
      <button v-else type="button" class="btn btn-outline btn-sm" :disabled="busy" @click="emit('review', 'accepted')">
        <Check :size="16" aria-hidden="true" /> Accept after all
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.details {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 24px;
}
.details .wide {
  grid-column: 1 / -1;
}
.details dt {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--muted);
}
.details dd {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
}
.prose-text {
  white-space: pre-line;
}
@media (max-width: 520px) {
  .details {
    grid-template-columns: minmax(0, 1fr);
  }
}
.handle-link {
  color: inherit;
}
.handle-link:hover {
  color: var(--pink-dark);
  text-decoration: underline;
  text-underline-offset: 3px;
}
</style>
