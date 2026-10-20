<script setup>
import { CircleAlert, RotateCcw } from 'lucide-vue-next';

defineProps({
  message: { type: String, default: '' },
  retryable: { type: Boolean, default: true },
});
const emit = defineEmits(['retry']);
</script>

<template>
  <div class="error-block" role="alert">
    <span class="icon" aria-hidden="true"><CircleAlert :size="26" /></span>
    <p class="title">Something went wrong</p>
    <p class="message">{{ message || "We couldn't load this. Please try again." }}</p>
    <button v-if="retryable" type="button" class="btn btn-outline btn-sm" @click="emit('retry')">
      <RotateCcw :size="16" aria-hidden="true" /> Try again
    </button>
  </div>
</template>

<style scoped>
.error-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
  padding: 40px 20px;
  border-radius: var(--radius-lg);
  background: var(--danger-soft);
}
.icon {
  color: var(--danger);
  display: grid;
  place-items: center;
}
.title {
  margin: 4px 0 0;
  font-weight: 700;
  color: var(--danger);
}
.message {
  margin: 0 0 12px;
  max-width: 52ch;
  color: var(--text);
}
</style>
