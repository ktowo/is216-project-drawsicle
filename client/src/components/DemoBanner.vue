<script setup>
import { computed, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { FlaskConical, RotateCcw, X } from 'lucide-vue-next';
import { DEMO_LOGIN_EMAIL, DEMO_PASSWORD } from '@shared/demo-data.mjs';
import { auth } from '../stores/auth';

// Shown by App.vue in mock mode only (VITE_API_MODE=mock)
const DISMISS_KEY = 'drawisicle-demo-banner-hidden';

function readDismissed() {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

const route = useRoute();
// The login page shows the same details next to its form
const showLoginHint = computed(() => !auth.user && route.name !== 'login');

const hidden = ref(readDismissed());
const confirming = ref(false);
const resetting = ref(false);
const error = ref('');

function dismiss() {
  hidden.value = true;
  try {
    sessionStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // Storage blocked: it just comes back on the next page load
  }
}

async function reset() {
  resetting.value = true;
  error.value = '';
  try {
    // Loaded on demand so the mock never ends up in the normal build
    const { resetMockData } = await import('../mock/index.js');
    resetMockData();
    location.reload();
  } catch {
    error.value = "Couldn't reset the demo data. Try clearing this site's data in your browser.";
    resetting.value = false;
    confirming.value = false;
  }
}
</script>

<template>
  <aside v-if="!hidden" class="demo-banner" aria-label="Demo mode">
    <div class="inner">
      <p class="message">
        <FlaskConical :size="16" class="shrink-0" aria-hidden="true" />
        <span>
          <strong>Demo mode:</strong> everything runs in your browser and resets when you clear site data.
          <template v-if="showLoginHint">
            <RouterLink to="/login" class="login-link">Log in as Mika</RouterLink>
            with <code>{{ DEMO_LOGIN_EMAIL }}</code> / <code>{{ DEMO_PASSWORD }}</code>.
          </template>
        </span>
      </p>

      <div class="actions">
        <template v-if="confirming">
          <span class="confirm-text" role="status">Start over with fresh demo data?</span>
          <button type="button" class="btn btn-xs btn-primary" :disabled="resetting" @click="reset">
            <span v-if="resetting" class="spin" aria-hidden="true"></span>
            {{ resetting ? 'Resetting…' : 'Yes, reset' }}
          </button>
          <button type="button" class="btn btn-xs btn-ghost" :disabled="resetting" @click="confirming = false">Cancel</button>
        </template>
        <button v-else type="button" class="btn btn-xs btn-outline" @click="confirming = true">
          <RotateCcw :size="14" aria-hidden="true" />
          Reset demo data
        </button>
        <button type="button" class="btn btn-xs btn-ghost btn-icon" aria-label="Hide the demo banner" @click="dismiss">
          <X :size="16" aria-hidden="true" />
        </button>
      </div>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
  </aside>
</template>

<style scoped>
.demo-banner {
  /* Above the sticky navbar (z-index 40), whose hidden skip link would otherwise peek out over this bar */
  position: relative;
  z-index: 41;
  background: var(--pink-soft);
  border-bottom: 1px solid var(--pink-line);
  color: var(--text);
  font-size: 0.88rem;
}
.inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 8px 16px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
}
.message {
  margin: 0;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  line-height: 1.45;
  min-width: 0;
}
.message :deep(svg) {
  margin-top: 2px;
  color: var(--pink-dark);
}
.login-link {
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 2px;
}
code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.82rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0 5px;
  overflow-wrap: anywhere;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}
.confirm-text {
  font-weight: 600;
}
.error {
  margin: 0 auto;
  max-width: 1200px;
  padding: 0 16px 8px;
  color: var(--danger);
  font-weight: 600;
}
@media (max-width: 640px) {
  .actions {
    margin-left: 0;
  }
}
</style>
