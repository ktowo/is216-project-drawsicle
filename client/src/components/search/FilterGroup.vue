<script setup>
    const props = defineProps({
        title: String,
        labelId: String,
    })
</script>

<template>
    <div class="filter-group">
        <p v-if="title?.length" :id="labelId" class="label">{{ title }}</p>
        <slot></slot>
    </div>
</template>

<style scoped>
.filter-group .label {
  margin: 0 0 6px;
}
</style>