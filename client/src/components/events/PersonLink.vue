<script setup>
import { ref, computed, useId, onBeforeUnmount } from 'vue';
import { RouterLink } from 'vue-router';
import UserAvatar from '@/components/UserAvatar.vue';
import ProfileHoverCard from '@/components/profile/ProfileHoverCard.vue';
import { assetUrl } from '@/api';
import { userProfileLink } from '@/utils/events';

// A person's avatar and name, linking to their public profile when they have a username.
// Deleted accounts (no username) show as plain text. On devices with a mouse, resting on the
// name (or tabbing to it) opens a small profile card after a moment; touch screens just follow
// the link. Only people the page already links get a card, so nothing new is revealed.
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

// ---------- Hover card ----------
const OPEN_DELAY = 450;
const CLOSE_DELAY = 180;
const cardId = `person-card-${useId()}`;
const root = ref(null);
const open = ref(false);
let openTimer = null;
let closeTimer = null;

const canHover = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

function startOpen(fromKeyboard = false) {
  if (!to.value || (!fromKeyboard && !canHover())) return;
  clearTimeout(closeTimer);
  clearTimeout(openTimer);
  openTimer = setTimeout(() => (open.value = true), OPEN_DELAY);
}
function startClose() {
  clearTimeout(openTimer);
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => (open.value = false), CLOSE_DELAY);
}
function keepOpen() {
  clearTimeout(closeTimer);
}
function closeNow() {
  clearTimeout(openTimer);
  clearTimeout(closeTimer);
  open.value = false;
}
function onKeydown(e) {
  if (e.key === 'Escape' && open.value) {
    e.stopPropagation();
    closeNow();
  }
}
// Keyboard focus shows the card too, but only when the focus came from the keyboard
function onFocus(e) {
  if (e.target.matches?.(':focus-visible')) startOpen(true);
}
onBeforeUnmount(closeNow);
</script>

<template>
  <component
    :is="to ? RouterLink : 'span'"
    ref="root"
    :to="to || undefined"
    class="person-link"
    :class="{ linked: to }"
    :aria-describedby="open ? cardId : undefined"
    @mouseenter="startOpen()"
    @mouseleave="startClose"
    @focus="onFocus"
    @blur="startClose"
    @keydown="onKeydown"
    @click="closeNow"
  >
    <UserAvatar v-if="size" :user="avatarUser" :size="size" class="person-avatar" />
    <span class="person-text">
      <span class="person-name">{{ name }}</span>
      <span v-if="showHandle && user?.username" class="person-handle">@{{ user.username }}</span>
    </span>
    <ProfileHoverCard
      v-if="open && to"
      :id="cardId"
      :username="user.username"
      :anchor="root?.$el || root"
      @enter="keepOpen"
      @leave="startClose"
      @close="closeNow"
    />
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
