<script setup>
import { ref, computed } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { UserPlus, UserCheck, Users, Loader2 } from 'lucide-vue-next';
import { api } from '@/api';
import { auth } from '@/stores/auth';
import { toast } from '@/stores/toast';

// Follow someone from their profile. Following each other makes you friends.
// viewer: { following, followsYou, friends } from GET /users/:username
const props = defineProps({
  username: { type: String, required: true },
  name: { type: String, default: 'them' },
  viewer: { type: Object, default: null },
});
const emit = defineEmits(['changed']); // { viewer, stats }

const route = useRoute();
const busy = ref(false);

const label = computed(() => {
  const v = props.viewer;
  if (v?.friends) return 'Friends';
  if (v?.following) return 'Following';
  return v?.followsYou ? 'Follow back' : 'Follow';
});

async function toggle(e) {
  e.preventDefault(); // The follow button can be clicked, even if it's on top of an ArtistCard, which can be clicked.
  busy.value = true;
  try {
    const following = Boolean(props.viewer?.following);
    const res = await api(`/users/${encodeURIComponent(props.username)}/follow`, { method: following ? 'DELETE' : 'POST' });
    emit('changed', res);
    if (!following) {
      toast.success(res.viewer?.friends ? `You and ${props.name} are friends now!` : `You're following ${props.name}.`);
    }
  } catch (e) {
    toast.error(e.message);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <RouterLink v-if="!auth.user" :to="{ path: '/login', query: { redirect: route.fullPath } }" class="btn btn-primary btn-sm">
    <UserPlus :size="16" aria-hidden="true" /> Follow
  </RouterLink>
  <span v-else class="follow">
    <button
      type="button"
      class="btn btn-sm"
      :class="viewer?.following ? 'btn-outline' : 'btn-primary'"
      :aria-pressed="viewer?.following ? 'true' : 'false'"
      :title="viewer?.following ? `Click to unfollow ${name}` : undefined"
      :disabled="busy"
      @click="toggle"
    >
      <Loader2 v-if="busy" :size="16" class="spin" aria-hidden="true" />
      <Users v-else-if="viewer?.friends" :size="16" aria-hidden="true" />
      <UserCheck v-else-if="viewer?.following" :size="16" aria-hidden="true" />
      <UserPlus v-else :size="16" aria-hidden="true" />
      {{ label }}
    </button>
    <span v-if="viewer?.followsYou && !viewer?.friends" class="chip">Follows you</span>
  </span>
</template>

<style scoped>
.follow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.chip {
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--info-soft);
  color: var(--info);
  font-size: 0.8rem;
  font-weight: 700;
}
</style>
