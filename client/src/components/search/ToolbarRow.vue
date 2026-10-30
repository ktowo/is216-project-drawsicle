<template>
    <div class="toolbar-row">
        <slot></slot>
    </div>  
</template>

<style scoped>
.toolbar-row {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
}
</style>