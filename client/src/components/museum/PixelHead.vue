<script setup>
import { computed } from 'vue';
import PixelAvatar from './PixelAvatar.vue';
import { lookFor } from '@/museum/looks';

// Just the head of someone's museum avatar (the full avatar, cropped), for friend lists, chat
// bubbles and the toolbar. Shows their saved look, hair and accessory included.
const props = defineProps({
  user: { type: Object, default: null }, // { id, displayName, look? }
  size: { type: Number, default: 32 },
  online: { type: Boolean, default: false },
});
const look = computed(() => lookFor(props.user || 'guest'));
</script>

<template>
  <span class="head" :style="{ width: `${size}px`, height: `${size}px` }" aria-hidden="true">
    <svg viewBox="-14 -58 28 33" :width="size" :height="size">
      <rect x="-14" y="-58" width="28" height="33" rx="7" class="bg" />
      <PixelAvatar :x="0" :y="0" facing="se" :look="look" />
    </svg>
    <span v-if="online" class="dot" />
  </span>
</template>

<style scoped>
.head {
  position: relative;
  display: inline-block;
  flex-shrink: 0;
}
.head svg {
  display: block;
  border-radius: 8px;
}
.bg {
  fill: var(--museum-head-bg, #e9e0f2);
}
.dot {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #3ecf6e;
  border: 2px solid var(--surface, #fff);
}
</style>
