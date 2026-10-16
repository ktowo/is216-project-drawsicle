<script setup>
import PairDiagram from '@/components/PairDiagram.vue';
import { useBaseStore } from '@/stores/baseStore';
import axios from 'axios';
import { onMounted, ref } from 'vue';

const baseStore = useBaseStore();
const API_URL = baseStore.API_URL;
const response = ref("-- No Connection --");

const pairChain = ref([]);
const initialAngle = ref(0);

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
setInterval(() => {initialAngle.value += 0.06}, 1/30);
</script>

<template>
    <div class="grid sm:grid-cols-3 grid-cols-1">
        <div class="sm:order-2">
            <h1 class="text-purple-800 text-4xl">Hello World!</h1>
            <p>The <a :href="API_URL">server</a> says: <code class="text-blue-500">{{ response }}</code></p>
        </div>
        <PairDiagram class="p m-6 sm:col-span-2" :chain="pairChain" :initial-angle="initialAngle"></PairDiagram>
    </div>
</template>

<style scoped></style>