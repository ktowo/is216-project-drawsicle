<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import Navbar from './components/Navbar.vue';
import Footer from './components/Footer.vue';
import ToastHost from './components/ui/ToastHost.vue';
import DemoBanner from './components/DemoBanner.vue';
import { isMockMode } from './api';

const route = useRoute();
// Login/register/reset screens use their own full-page layout
const showChrome = computed(() => !route.meta.hideChrome);
</script>

<template>
  <div class="app-shell">
    <DemoBanner v-if="isMockMode" />
    <Navbar v-if="showChrome" />
    <div class="app-main">
      <RouterView />
    </div>
    <Footer v-if="showChrome" />
    <ToastHost />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.app-main {
  flex: 1;
}
</style>
