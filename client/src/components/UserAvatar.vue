<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
  user: { type: Object, default: null },
  size: { type: Number, default: 40 },
});

const imageFailed = ref(false);
watch(() => props.user?.avatarUrl, () => (imageFailed.value = false));

const initials = computed(() => {
  const name = (props.user?.displayName || props.user?.email || '?').trim();
  const words = name.split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2);
  return letters.toUpperCase();
});
</script>

<template>
  <span class="avatar" :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.36}px` }">
    <img
      v-if="user?.avatarUrl && !imageFailed"
      :src="user.avatarUrl"
      alt=""
      referrerpolicy="no-referrer"
      @error="imageFailed = true"
    />
    <span v-else>{{ initials }}</span>
  </span>
</template>

<style scoped>
.avatar {
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 50%;
  background: #f3ebdc;
  color: var(--text);
  font-weight: 500;
  overflow: hidden;
}
.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
