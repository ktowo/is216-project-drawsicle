<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { RouterLink } from 'vue-router';
import { Gift, Loader2 } from 'lucide-vue-next';
import UserAvatar from '@/components/UserAvatar.vue';
import ArtistTagChips from './ArtistTagChips.vue';
import FollowButton from './FollowButton.vue';
import { assetUrl } from '@/api';
import { auth } from '@/stores/auth';
import { getArtistCard, rememberFollowing } from '@/utils/artistCards';
import { CARD_COLORS } from '@shared/taste.mjs';

// The small profile card that opens over someone's name (see PersonLink). Rendered on <body>
// so card and table edges never clip it; placed below the name, or above when there's no room.
const props = defineProps({
  id: { type: String, required: true },
  username: { type: String, required: true },
  anchor: { type: Object, default: null }, // the name's element
});
const emit = defineEmits(['enter', 'leave', 'close']);

const card = ref(null);
const failed = ref(false);
const pos = ref({ top: 0, left: 0, above: false });
const el = ref(null);

const WIDTH = 300;
function place() {
  if (!props.anchor) return;
  const r = props.anchor.getBoundingClientRect();
  const height = el.value?.offsetHeight || 220;
  const above = r.bottom + 10 + height > window.innerHeight && r.top - 10 - height > 0;
  const left = Math.min(Math.max(8, r.left), window.innerWidth - WIDTH - 8);
  pos.value = { top: above ? r.top - 10 - height : r.bottom + 10, left, above };
}

onMounted(async () => {
  place();
  window.addEventListener('scroll', close, { passive: true, capture: true });
  window.addEventListener('resize', close);
  try {
    card.value = await getArtistCard(props.username);
  } catch {
    failed.value = true;
  }
  requestAnimationFrame(place);
});
onBeforeUnmount(() => {
  window.removeEventListener('scroll', close, { capture: true });
  window.removeEventListener('resize', close);
});
function close() {
  emit('close');
}

const user = computed(() => card.value?.user || null);
const color = computed(() => CARD_COLORS.find((c) => c.value === card.value?.artistTags?.cardColor) || null);
const isMe = computed(() => Boolean(auth.user && user.value && auth.user.id === user.value.id));
const avatarUser = computed(() => ({ ...(user.value || {}), avatarUrl: user.value?.avatarUrl ? assetUrl(user.value.avatarUrl) : null }));

function onFollow(res) {
  const following = Boolean(res?.viewer?.following);
  card.value = { ...card.value, following };
  rememberFollowing(props.username, following);
}
watch(card, () => requestAnimationFrame(place));
</script>

<template>
  <Teleport to="body">
    <div
      :id="id"
      ref="el"
      class="hover-card card"
      :class="{ above: pos.above }"
      :style="{ top: `${pos.top}px`, left: `${pos.left}px`, width: `${WIDTH}px`, '--card': color?.swatch }"
      role="tooltip"
      @mouseenter="emit('enter')"
      @mouseleave="emit('leave')"
    >
      <div class="band" aria-hidden="true" />
      <div v-if="user" class="body">
        <div class="who">
          <UserAvatar :user="avatarUser" :size="48" class="avatar" />
          <div class="names">
            <p class="name">{{ user.displayName }}</p>
            <p class="handle">@{{ user.username }}</p>
          </div>
        </div>
        <ArtistTagChips :tags="card.artistTags" compact />
        <p v-if="card.exchangesCompleted || card.badges?.length" class="meta">
          <span v-if="card.exchangesCompleted" class="stat">
            <Gift :size="13" aria-hidden="true" /> {{ card.exchangesCompleted }}
            {{ card.exchangesCompleted === 1 ? 'exchange' : 'exchanges' }}
          </span>
          <span v-for="b in card.badges.slice(0, 2)" :key="b.key" class="badge-chip">{{ b.label }}</span>
        </p>
        <div class="actions">
          <FollowButton
            v-if="!isMe"
            :username="user.username"
            :name="user.displayName"
            :viewer="{ following: Boolean(card.following) }"
            @changed="onFollow"
          />
          <RouterLink :to="`/users/${user.username}`" class="btn btn-outline btn-sm" @click="close">View profile</RouterLink>
        </div>
      </div>
      <p v-else-if="failed" class="body hint">Couldn't load this profile.</p>
      <p v-else class="body loading"><Loader2 :size="16" class="spin" aria-hidden="true" /> Loading…</p>
    </div>
  </Teleport>
</template>

<style scoped>
.hover-card {
  position: fixed;
  z-index: 1000;
  overflow: hidden;
  padding: 0;
  box-shadow: 0 10px 30px rgba(40, 25, 10, 0.18);
  animation: pop 0.12s ease-out;
}
.band {
  height: 30px;
  background: var(--card, var(--pink-soft));
}
.body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 14px 14px;
  margin: 0;
}
.who {
  position: relative;
  padding-left: 64px;
  min-height: 34px;
  margin-top: 8px;
}
.avatar {
  position: absolute;
  left: 0;
  top: -28px;
  border: 3px solid var(--surface);
  border-radius: 50%;
  background: var(--surface);
  flex-shrink: 0;
}
.names {
  min-width: 0;
}
.name {
  margin: 0;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.handle {
  margin: 0;
  font-size: 0.84rem;
  color: var(--muted);
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  margin: 0;
  font-size: 0.82rem;
  color: var(--muted);
}
.stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
}
.badge-chip {
  padding: 1px 7px;
  border-radius: 6px;
  border: 1px solid var(--border);
  font-weight: 600;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.loading {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 14px;
  color: var(--muted);
}
@keyframes pop {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}
.above {
  animation-name: pop-up;
}
@keyframes pop-up {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .hover-card {
    animation: none;
  }
}
</style>
