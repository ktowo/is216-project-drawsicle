<script setup>
import { Loader2 } from 'lucide-vue-next';

defineProps({
  label: { type: String, default: 'Loading…' },
});
</script>

<template>
  <div class="loading-block" role="status" aria-live="polite">
    <Loader2 :size="26" class="spin" aria-hidden="true" />
    <span>{{ label }}</span>
  </div>
</template>

<style scoped>
.loading-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 56px 16px;
  color: var(--muted);
  font-weight: 500;
  text-align: center;
}
.loading-block :deep(svg) {
  color: var(--pink);
}
</style>
