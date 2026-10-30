<script setup>
import { SlidersHorizontal } from 'lucide-vue-next';

const filtersOpen = defineModel({type: Boolean, required: true});
const props = defineProps({
    ariaControls: String,
    filterCount: Number
})
    
</script>

<template>
    <button
        type="button"
        class="btn btn-outline btn-sm filters-toggle"
        :aria-expanded="filtersOpen ? 'true' : 'false'"
        :aria-controls="ariaControls"
        @click="filtersOpen = !filtersOpen" 
    >
        <SlidersHorizontal :size="16" aria-hidden="true" /> <span class="max-sm:hidden">Filters</span>
        <span v-if="filterCount" class="filter-count">{{ filterCount }}</span>
    </button>
</template>

<style scoped>
.filters-toggle {
  display: inline-flex;
  position: relative;
}
.filters {
  display: none;
}
.filters.open {
  display: flex;
}
.filter-count {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--pink);
  color: #fff;
  font-size: 0.78rem;
  font-weight: 700;
}
</style>