<script setup>
const props = defineProps({
    progress: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    }
})
</script>

<template>
    <div class="bar" aria-hidden="true"><span :style="{ width: `${progress}%` }" /></div>
</template>

<style scoped>
.bar {
    /* margin: 32px 0 28px; */
    height: 6px;
    border-radius: 999px;
    background: var(--border);
    overflow: hidden;
}

.bar span {
    display: block;
    height: 100%;
    background: var(--pink);
    border-radius: inherit;
    transition: width .4s ease;
}
</style>