<script setup>
import { LoaderCircle, X } from 'lucide-vue-next';

const props = defineProps({
    summary: String,
    loadedOnce: Boolean,
    loading: Boolean,
    error: String,
    hasFilters: Boolean
});
const emit = defineEmits(['clearFilters']);
    
</script>

<template>
    <div class="results-head">
      <p class="summary" aria-live="polite">
        <template v-if="loadedOnce && !error">{{ summary }}</template>
        <LoaderCircle v-if="loading && loadedOnce" size="16" class="spin" aria-label="Updating" />
      </p>
      <button v-if="hasFilters" type="button" class="btn btn-ghost" @click="$emit('clearFilters')">
        <X size="16" aria-hidden="true" /> Clear filters
      </button>
    </div>
</template>

<style scoped>
.results-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 26px 0 14px;
  min-height: 38px;
  scroll-margin-top: 90px;
}
.summary {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--muted);
  font-weight: 600;
}
</style>