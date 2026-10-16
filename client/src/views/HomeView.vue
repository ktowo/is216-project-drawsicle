<script setup>
import PairDiagram from '@/components/PairDiagram.vue';
import { useBaseStore } from '@/stores/baseStore';
import axios from 'axios';
import { onMounted, ref } from 'vue';

const baseStore = useBaseStore();
const API_URL = baseStore.API_URL;
const response = ref("-- No Connection --");

const pairChain = ref([]);

onMounted(async () => {
    try {
        const res = await axios.get(API_URL);
        console.log(res.data);
        response.value = res.data;
    } catch (e) {
        console.error(e);
    }

    // pair chain
    try {
        const response = await axios.get(API_URL + "event/get-chain/");
        pairChain.value = response.data.chain;
    } catch (error) {
        console.error(error);
    }
})
</script>

<template>
    <h1 class="text-purple-800 text-4xl">Hello World!</h1>
    <p>The <a :href="API_URL">server</a> says: <code class="text-blue-500">{{ response }}</code></p>
    <PairDiagram :chain="pairChain"></PairDiagram>
</template>

<style scoped></style>