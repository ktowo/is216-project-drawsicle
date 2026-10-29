<script setup>
import { SlidersHorizontal } from 'lucide-vue-next';

const props = defineProps({
    filterCount: Number
})

const emit = defineEmits(['click'])
    
</script>

<template>
    <button
        type="button"
        class="btn btn-outline btn-sm filters-toggle"
        :aria-expanded="filtersOpen ? 'true' : 'false'"
        aria-controls="discover-filters"
        @click="$emit('click')"
    >
        <SlidersHorizontal :size="16" aria-hidden="true" /> Filters
        <span v-if="filterCount" class="filter-count">{{ filterCount }}</span>
    </button>
</template>

<style scoped>
    .filters-toggle {
  display: inline-flex;
}
.filters {
  display: none;
}
.filters.open {
  display: flex;
}
.filter-count {
  min-width: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--pink);
  color: #fff;
  font-size: 0.78rem;
  font-weight: 700;
}
</style>