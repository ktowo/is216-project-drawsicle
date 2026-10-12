<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import UserAvatar from '@/components/UserAvatar.vue';
import { assetUrl } from '@/api';
import { userProfileLink } from '@/utils/events';

// A person's avatar and name, linking to their public profile when they have a username.
// Deleted accounts (no username) show as plain text.
//   <PersonLink :user="event.organizers[0]" :size="28" />
const props = defineProps({
  user: { type: Object, default: null },
  size: { type: Number, default: 24 }, // avatar size; 0 hides the avatar
  showHandle: { type: Boolean, default: false }, // '@username' after the name
  fallback: { type: String, default: 'Someone' },
});

const to = computed(() => userProfileLink(props.user));
const name = computed(() => props.user?.displayName || props.user?.username || props.fallback);
const avatarUser = computed(() => ({
  ...(props.user || {}),
  avatarUrl: props.user?.avatarUrl ? assetUrl(props.user.avatarUrl) : null,
}));
</script>

<template>
  <component :is="to ? RouterLink : 'span'" :to="to || undefined" class="person-link" :class="{ linked: to }">
    <UserAvatar v-if="size" :user="avatarUser" :size="size" class="person-avatar" />
    <span class="person-text">
      <span class="person-name">{{ name }}</span>
      <span v-if="showHandle && user?.username" class="person-handle">@{{ user.username }}</span>
    </span>
  </component>
</template>

<style scoped>
.person-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
  color: inherit;
  vertical-align: middle;
}
.person-text {
  display: inline-flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.25;
}
.person-name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.person-handle {
  font-size: 0.82rem;
  color: var(--muted);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.linked:hover .person-name {
  color: var(--pink-dark);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.person-avatar {
  flex-shrink: 0;
}
</style>
