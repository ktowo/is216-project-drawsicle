<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { Gift, MailPlus, Check } from 'lucide-vue-next';
import UserAvatar from '@/components/UserAvatar.vue';
import ArtistTagChips from '@/components/profile/ArtistTagChips.vue';
import FollowButton from '@/components/profile/FollowButton.vue';
import { assetUrl } from '@/api';
import { userProfileLink } from '@/utils/events';
import { CARD_COLORS } from '@shared/taste.mjs';

// One artist on Discover (and the quiz result): their colour, tags, badges, a few gifts and Follow.
// card: the artist card shape from GET /discover/artists
const props = defineProps({
  card: { type: Object, required: true },
  // Short reasons this artist was suggested ("You both like fantasy")
  reasons: { type: Array, default: () => [] },
  // Hide the Follow button (e.g. a preview of your own card)
  noFollow: { type: Boolean, default: false },
  headingTag: { type: String, default: 'h3' },
  // Every tag (the quiz preview); cards on Discover show a shorter list
  allTags: { type: Boolean, default: false },
  // Organisers with an open event get an Invite button (the page opens the invite window)
  invitable: { type: Boolean, default: false },
  // Already invited to every open event of yours
  invited: { type: Boolean, default: false },
});
const emit = defineEmits(['follow-changed', 'invite']);

const user = computed(() => props.card.user || {});
const link = computed(() => userProfileLink(user.value));
const color = computed(() => CARD_COLORS.find((c) => c.value === props.card.artistTags?.cardColor) || null);
const style = computed(() => (color.value ? { '--card': color.value.swatch, '--card-ink': color.value.ink } : undefined));
const badges = computed(() => (props.card.badges || []).slice(0, 2));
const avatarUser = computed(() => ({ ...user.value, avatarUrl: user.value.avatarUrl ? assetUrl(user.value.avatarUrl) : null }));
const gifts = computed(() => (props.card.gifts || []).filter((g) => g.image));

function onFollow(res) {
  emit('follow-changed', { username: user.value.username, following: Boolean(res?.viewer?.following) });
}
</script>

<template>
  <article class="card artist-card" :class="{ colored: color }" :style="style">
    <div class="band" aria-hidden="true" />
    <div class="body">
      <div class="who">
        <UserAvatar :user="avatarUser" :size="56" class="avatar" />
        <div class="names">
          <component :is="headingTag" class="name">
            <RouterLink v-if="link" :to="link" class="name-link">{{ user.displayName || user.username }}</RouterLink>
            <span v-else>{{ user.displayName }}</span>
          </component>
          <p v-if="user.username" class="handle">@{{ user.username }}</p>
        </div>
      </div>

      <ul v-if="reasons.length" class="reasons" aria-label="Why we suggest them">
        <li v-for="r in reasons" :key="r">{{ r }}</li>
      </ul>

      <ArtistTagChips :tags="card.artistTags" :compact="!allTags" />

      <ul v-if="gifts.length" class="gifts" :aria-label="`Gifts ${user.displayName} made`">
        <li v-for="g in gifts" :key="g.id" :class="{ warned: g.contentWarnings?.length }">
          <img :src="assetUrl(g.image)" :alt="g.alt || g.title || 'A gift they made'" loading="lazy" />
        </li>
      </ul>

      <div class="meta">
        <span v-if="card.exchangesCompleted" class="stat">
          <Gift :size="14" aria-hidden="true" />
          {{ card.exchangesCompleted }} {{ card.exchangesCompleted === 1 ? 'exchange' : 'exchanges' }}
        </span>
        <span v-for="b in badges" :key="b.key" class="badge-chip" :title="b.description">{{ b.label }}</span>
      </div>

      <div v-if="!noFollow && user.username" class="actions">
        <FollowButton
          :username="user.username"
          :name="user.displayName"
          :viewer="{ following: Boolean(card.following) }"
          @changed="onFollow"
        />
        <button v-if="invitable && invited" type="button" class="btn btn-ghost btn-sm" disabled>
          <Check :size="16" aria-hidden="true" /> Invited
        </button>
        <button
          v-else-if="invitable"
          type="button"
          class="btn btn-outline btn-sm"
          :aria-label="`Invite ${user.displayName || user.username} to an event`"
          @click="emit('invite', card)"
        >
          <MailPlus :size="16" aria-hidden="true" /> Invite
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.artist-card {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  transition: transform 0.15s, box-shadow 0.15s;
}
.artist-card:hover {
  transform: translateY(-2px);
}
.band {
  height: 44px;
  background: var(--card, var(--pink-soft));
}
.body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 18px 18px;
  flex: 1;
}
/* The avatar overlaps the colour band; the name always starts below it so it stays readable
   on any card colour, in light and dark mode */
.who {
  position: relative;
  padding-left: 76px;
  min-height: 40px;
  margin-top: 8px;
}
.avatar {
  position: absolute;
  left: 0;
  top: -36px;
  border: 4px solid var(--surface);
  border-radius: 50%;
  background: var(--surface);
}
.names {
  min-width: 0;
}
.name {
  margin: 0;
  font-size: 1.08rem;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.name-link {
  color: var(--text);
}
.name-link:hover {
  color: var(--pink-dark);
}
.handle {
  margin: 0;
  color: var(--muted);
  font-size: 0.86rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.reasons li {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 700;
  background: var(--card, var(--pink-soft));
  color: var(--card-ink, var(--pink-dark));
}
.gifts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.gifts li {
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
  background: var(--surface-2, var(--border));
}
.gifts img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
/* Gifts with content warnings stay blurred on cards; the full gallery has the reveal */
.gifts li.warned img {
  filter: blur(14px);
  transform: scale(1.1);
}
.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  font-size: 0.84rem;
  color: var(--muted);
}
.stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
}
.badge-chip {
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid var(--border);
  font-weight: 600;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: auto;
  padding-top: 4px;
}
@media (prefers-reduced-motion: reduce) {
  .artist-card,
  .artist-card:hover {
    transition: none;
    transform: none;
  }
}
</style>
