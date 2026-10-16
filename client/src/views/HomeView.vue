<script setup>
import { useBaseStore } from '@/stores/baseStore';
import axios from 'axios';

import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import {
    Sparkles,
    ArrowRight,
    CalendarPlus,
    Share2,
    Shuffle,
    CalendarClock,
    BookHeart,
    UserRoundPlus,
    Gift,
    Upload,
    PartyPopper,
    WandSparkles,
    BellRing,
    LockKeyhole,
    LayoutDashboard,
    ImageUp,
    Check,
    Clock,
    Compass,
    CalendarHeart,
    RotateCcw,
    CircleHelp,
} from 'lucide-vue-next';
import Hero from '@/components/main/Hero.vue';

const baseStore = useBaseStore();
const API_URL = baseStore.API_URL;
const response = ref("-- No Connection --");
const isAuthenticated = ref(true);

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
    <main class="overflow-x-clip">
       <Hero></Hero>
    </main>
    <h1 class="text-purple-800 text-4xl"><img class="float-left h-12 m-3" src="/drawsicle.svg">Hello World!</h1>
    <p>The <a :href="API_URL">server</a> says: <code class="text-blue-500">{{ response }}</code></p>
</template>

<style scoped>

</style>