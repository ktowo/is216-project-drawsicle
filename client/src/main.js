import './assets/app.css';

import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { startSparkleCursor } from './effects/sparkleCursor';

createApp(App).use(router).mount('#app');

startSparkleCursor();
