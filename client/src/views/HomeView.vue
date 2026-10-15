<script setup>
import { useBaseStore } from '@/stores/baseStore';
import axios from 'axios';
import { onMounted, ref } from 'vue';

const baseStore = useBaseStore();
const API_URL = baseStore.API_URL;
const response = ref("-- No Connection --");

onMounted(async () => {
    try {
        const res = await axios.get(API_URL);
        console.log(res.data);
        response.value = res.data;
    } catch (e) {
        console.error(e);
    }
})
</script>

<template>
    <h1 class="text-purple-800 text-4xl">Hello World!</h1>
    <p>The <a :href="API_URL">server</a> says: <code class="text-blue-500">{{ response }}</code></p>
</template>

<style scoped></style>