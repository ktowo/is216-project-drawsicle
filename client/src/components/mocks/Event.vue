<script setup>
import CardBase from './CardBase.vue';
</script>

<template>
    <CardBase>
        <p class="m-label">Event name</p>
        <div class="m-input">Winter Secret Santa 2026</div>
        <p class="m-label">Theme</p>
        <div class="m-input">Cosy winter nights</div>
        <div class="m-row">
            <div class="m-chip on">Art</div>
            <div class="m-chip on">Writing</div>
            <div class="m-chip">Adoptable</div>
        </div>
        <div class="m-row">
            <div class="m-input half">
                <Clock :size="13" /> Sign-ups close 25 Oct
            </div>
            <div class="m-input half">Max 40 artists</div>
        </div>
    </CardBase>
</template>