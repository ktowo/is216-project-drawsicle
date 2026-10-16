<script setup>
import { computed } from 'vue';
import { lookFor } from '@/museum/looks';

// Just the head of someone's museum avatar, for friend lists and the toolbar
const props = defineProps({
  user: { type: Object, default: null }, // { id, displayName }
  size: { type: Number, default: 32 },
  online: { type: Boolean, default: false },
});
const look = computed(() => lookFor(props.user?.id || props.user?.displayName || 'guest'));
</script>

<template>
  <span class="head" :style="{ width: `${size}px`, height: `${size}px` }" aria-hidden="true">
    <svg viewBox="-12 -56 24 30" :width="size" :height="size">
      <rect x="-12" y="-56" width="24" height="30" rx="6" class="bg" />
      <rect x="-8" y="-45" width="16" height="16" rx="4" :fill="look.skin" />
      <rect x="-9" y="-48" width="18" height="7" rx="3" :fill="look.hair" />
      <rect x="-9" y="-45" width="4" height="9" rx="2" :fill="look.hair" />
      <rect v-if="look.style === 'bun'" x="-4" y="-53" width="8" height="6" rx="3" :fill="look.hair" />
      <rect x="0" y="-39" width="2" height="3" fill="#2b2230" />
      <rect x="5" y="-39" width="2" height="3" fill="#2b2230" />
      <rect x="2" y="-33" width="4" height="1.5" rx="0.75" fill="#b5536b" />
      <rect x="-8" y="-29" width="16" height="4" rx="2" :fill="look.shirt" />
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
