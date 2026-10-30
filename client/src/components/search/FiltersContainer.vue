<script setup>
    const props = defineProps({
        filtersOpen: Boolean
    })
</script>

<template>
    <div class="filters" :class="{ open: filtersOpen }">
        <slot></slot>
    </div>
</template>

<style scoped>
.filters {
  display: none;
  flex-direction: column;
  gap: 14px;
  margin-top: 14px;
}
.filters.open {
  display: flex;
}
</style>