<script setup>
import { computed } from 'vue';
import { CalendarDays } from 'lucide-vue-next';
import UserAvatar from '@/components/UserAvatar.vue';
import SocialLinks from './SocialLinks.vue';
import { formatMonthYear } from '@/utils/format';

// Top of a public profile: big avatar, names, "member since", bio, social links.
// Buttons (edit, share) go in the default slot.
const props = defineProps({
  profile: { type: Object, required: true },
  // 'h2' when the header is a preview inside another page
  headingTag: { type: String, default: 'h1' },
});

const name = computed(() => props.profile.displayName || props.profile.username || 'Artist');
const since = computed(() => formatMonthYear(props.profile.createdAt));
const bio = computed(() => (props.profile.bio || '').trim());
</script>

<template>
  <header class="card profile-head">
    <UserAvatar :user="profile" :size="112" class="head-avatar" />

    <div class="head-main">
      <component :is="headingTag" class="head-name">{{ name }}</component>
      <p v-if="profile.username" class="head-handle">@{{ profile.username }}</p>
      <p v-if="since" class="head-since">
        <CalendarDays :size="15" aria-hidden="true" /> Member since {{ since }}
      </p>

      <p v-if="bio" class="head-bio">{{ bio }}</p>
      <p v-else class="head-bio none">No bio yet.</p>

      <SocialLinks :socials="profile.socials" :owner-name="name" class="head-socials" />

      <div v-if="$slots.default" class="head-actions">
        <slot />
      </div>
    </div>
  </header>
</template>

<style scoped>
.profile-head {
  display: flex;
  gap: 28px;
  align-items: flex-start;
  padding: 32px 34px;
}
.head-avatar {
  border: 4px solid var(--pink-soft);
  box-shadow: 0 4px 14px rgba(90, 65, 30, 0.1);
}
.head-main {
  min-width: 0;
  flex: 1;
}
.head-name {
  font-size: clamp(1.8rem, 4vw, 2.4rem);
  font-weight: 800;
  overflow-wrap: anywhere;
}
.head-handle {
  margin: 2px 0 0;
  font-weight: 600;
  color: var(--muted);
  overflow-wrap: anywhere;
}
.head-since {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 10px 0 0;
  font-size: 0.92rem;
  color: var(--muted);
}
.head-bio {
  margin: 16px 0 0;
  max-width: 62ch;
  line-height: 1.7;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.head-bio.none {
  color: var(--muted);
  font-style: italic;
}
.head-socials {
  margin-top: 16px;
}
.head-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 20px;
}
@media (max-width: 640px) {
  .profile-head {
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 16px;
    padding: 26px 18px;
  }
  .head-since,
  .head-actions {
    justify-content: center;
  }
  .head-socials {
    justify-content: center;
  }
  .head-bio {
    text-align: left;
  }
}
</style>
