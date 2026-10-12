<script setup>
import { computed, ref, watch, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import Navbar from './components/Navbar.vue';
import Footer from './components/Footer.vue';
import ToastHost from './components/ui/ToastHost.vue';
import DemoBanner from './components/DemoBanner.vue';
import { isMockMode } from './api';

const route = useRoute();
// Login/register/reset screens use their own full-page layout
const showChrome = computed(() => !route.meta.hideChrome);

// After moving to another page, send keyboard focus to the new page's <main> and say the page
// title out loud, so screen reader and keyboard users aren't left on a link that no longer exists.
// Changing only the query (filters) or the #anchor on the same page leaves focus alone.
const announcement = ref('');
watch(
  () => route.path,
  async (path, oldPath) => {
    if (!oldPath || path === oldPath) return;
    await nextTick();
    const main = document.querySelector('main');
    if (main) {
      if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
      main.focus({ preventScroll: true });
    }
    announcement.value = document.title;
  }
);
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
    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ announcement }}</p>
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
