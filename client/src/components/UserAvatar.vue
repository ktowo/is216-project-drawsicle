<script setup>
import { ref, computed, watch } from 'vue';
import { assetUrl } from '@/api';

const props = defineProps({
  user: { type: Object, default: null },
  size: { type: Number, default: 40 },
  // Spoken name when the avatar is shown on its own, without the person's name beside it.
  // Left empty it is decorative, which is right next to a visible name.
  label: { type: String, default: '' },
});

const imageFailed = ref(false);
watch(() => props.user?.avatarUrl, () => (imageFailed.value = false));

const src = computed(() => assetUrl(props.user?.avatarUrl || ''));

const initials = computed(() => {
  const name = (props.user?.displayName || props.user?.username || props.user?.email || '?').trim() || '?';
  const words = name.split(/\s+/).filter(Boolean);
  // Spread so emoji and accented letters aren't cut in half
  const letters = words.length > 1 ? [...words[0]][0] + [...words[1]][0] : [...name].slice(0, 2).join('');
  return letters.toUpperCase();
});
</script>

<template>
  <span
    class="avatar"
    :role="label ? 'img' : undefined"
    :aria-label="label || undefined"
    :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.36}px` }"
  >
    <img
      v-if="src && !imageFailed"
      :src="src"
      alt=""
      referrerpolicy="no-referrer"
      @error="imageFailed = true"
    />
    <span v-else aria-hidden="true">{{ initials }}</span>
  </span>
</template>

<style scoped>
.avatar {
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--chip);
  color: var(--text);
  font-weight: 600;
  overflow: hidden;
}
.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
