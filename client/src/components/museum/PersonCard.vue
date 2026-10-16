<script setup>
import { ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { X, Armchair, Award, Users, UserRound } from 'lucide-vue-next';
import PixelHead from './PixelHead.vue';
import FollowButton from '@/components/profile/FollowButton.vue';
import { api } from '@/api';

// The info card for someone in the room (like the one you get clicking a visitor): their head,
// name, a few badges, and follow / profile buttons. For yourself it has your own links and a
// sit / stand button instead.
const props = defineProps({
  user: { type: Object, required: true },
  self: { type: Boolean, default: false },
  sitting: { type: Boolean, default: false },
});
const emit = defineEmits(['close', 'sit']);

const profile = ref(null);
watch(
  () => props.user?.username,
  async (username) => {
    profile.value = null;
    if (!username) return;
    try {
      profile.value = await api(`/users/${encodeURIComponent(username)}`);
    } catch {
      profile.value = null;
    }
  },
  { immediate: true }
);

function onFollow({ viewer, stats }) {
  if (!profile.value) return;
  profile.value = { ...profile.value, viewer: { ...profile.value.viewer, ...viewer }, stats: { ...profile.value.stats, ...stats } };
}
</script>

<template>
  <div class="card person" role="dialog" :aria-label="self ? 'You' : user.displayName">
    <button type="button" class="close" aria-label="Close" @click="emit('close')"><X :size="16" aria-hidden="true" /></button>
    <div class="top">
      <PixelHead :user="user" :size="52" />
      <div class="min-w-0">
        <p class="name">{{ user.displayName }}<span v-if="self" class="you"> (you)</span></p>
        <p v-if="user.username" class="handle">@{{ user.username }}</p>
        <p v-if="profile?.stats" class="counts">
          {{ profile.stats.followers || 0 }} followers · {{ profile.stats.following || 0 }} following
        </p>
      </div>
    </div>
    <ul v-if="profile?.badges?.length" class="badges" aria-label="Badges">
      <li v-for="b in profile.badges.slice(0, 3)" :key="b.key" :title="b.description">
        <Award :size="13" aria-hidden="true" /> {{ b.label }}
      </li>
    </ul>
    <div class="actions">
      <template v-if="self">
        <button type="button" class="btn btn-outline btn-xs" @click="emit('sit')">
          <Armchair :size="14" aria-hidden="true" /> {{ sitting ? 'Stand up' : 'Sit down' }}
        </button>
        <RouterLink to="/profile" class="btn btn-ghost btn-xs"><UserRound :size="14" aria-hidden="true" /> Your profile</RouterLink>
        <RouterLink to="/friends" class="btn btn-ghost btn-xs"><Users :size="14" aria-hidden="true" /> Friends</RouterLink>
      </template>
      <template v-else-if="user.username">
        <FollowButton :username="user.username" :name="user.displayName" :viewer="profile?.viewer || null" @changed="onFollow" />
        <RouterLink :to="`/users/${user.username}`" class="btn btn-ghost btn-xs">View profile</RouterLink>
      </template>
    </div>
  </div>
</template>

<style scoped>
.person {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(300px, calc(100vw - 48px));
  padding: 14px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}
.close {
  position: absolute;
  top: 8px;
  right: 8px;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}
.close:hover {
  background: var(--chip);
}
.top {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-right: 24px;
}
.name {
  margin: 0;
  font-weight: 800;
  overflow-wrap: anywhere;
}
.you {
  font-weight: 600;
  color: var(--muted);
}
.handle,
.counts {
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted);
}
.badges {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.badges li {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--warning-soft);
  color: var(--warning);
  font-size: 0.75rem;
  font-weight: 700;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
