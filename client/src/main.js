import './assets/app.css';

import { createApp, watch } from 'vue';
import App from './App.vue';
import router from './router';
import { startSparkleCursor } from './effects/sparkleCursor';
import { installImageFallback } from './effects/imageFallback';
import { preferences, initPreferences } from './stores/preferences';

initPreferences();
// Broken pictures become generated artwork instead of a broken-image icon
installImageFallback();
createApp(App).use(router).mount('#app');

// The sparkle cursor follows the toggle in the navbar
let stopSparkles = null;
watch(
  () => preferences.sparkles,
  (on) => {
    if (on && !stopSparkles) stopSparkles = startSparkleCursor();
    if (!on && stopSparkles) {
      stopSparkles();
      stopSparkles = null;
    }
  },
  { immediate: true }
);
