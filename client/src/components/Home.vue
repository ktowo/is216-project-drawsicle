<script setup>
import axios from 'axios';
import { onMounted, ref } from 'vue';

const API_URL = "http://localhost:8000/api/";
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
    <h1>Hello World!</h1>
    <p>The <a :href="API_URL">server</a> says: <code>{{ response }}</code></p>
</template>

<style scoped></style>