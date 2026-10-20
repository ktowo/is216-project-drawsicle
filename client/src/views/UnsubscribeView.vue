<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { MailX, MailCheck } from 'lucide-vue-next';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import { api } from '@/api';

// Where an email's "Unsubscribe" link lands (server/services/unsubscribe.js). Opening the page
// turns that email type off straight away, no login needed; Undo puts it back.
const route = useRoute();
const token = typeof route.query.t === 'string' ? route.query.t : '';
const state = ref('working'); // working | done | undone | error
const result = ref(null);
const error = ref('');
const busy = ref(false);

onMounted(async () => {
  if (!token) {
    state.value = 'error';
    error.value = 'This unsubscribe link is incomplete. You can change your emails in your notification settings.';
    return;
  }
  try {
    result.value = await api('/unsubscribe', { method: 'POST', body: { token } });
    state.value = 'done';
  } catch (err) {
    state.value = 'error';
    error.value = err.message;
  }
});

async function undo() {
  if (busy.value) return;
  busy.value = true;
  try {
    await api('/unsubscribe/undo', { method: 'POST', body: { token, previous: result.value.previous } });
    state.value = 'undone';
  } catch (err) {
    error.value = err.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="unsubscribe">
    <LoadingBlock v-if="state === 'working'" label="Updating your emails…" />

    <div v-else class="card notice" :role="state === 'error' ? 'alert' : 'status'">
      <template v-if="state === 'done'">
        <MailX :size="36" class="icon" aria-hidden="true" />
        <h1>You won't get {{ result.label === 'the daily digest' ? 'the daily digest' : `${result.label.toLowerCase()} emails` }} any more</h1>
        <p>You'll still see these in your notifications on Drawsicle.</p>
        <div class="actions">
          <button type="button" class="btn btn-outline" :disabled="busy" @click="undo">Undo</button>
          <RouterLink to="/notifications" class="btn btn-ghost">Email settings</RouterLink>
        </div>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
      </template>

      <template v-else-if="state === 'undone'">
        <MailCheck :size="36" class="icon" aria-hidden="true" />
        <h1>Turned back on</h1>
        <p>These emails will come as before.</p>
        <RouterLink to="/notifications" class="btn btn-ghost">Email settings</RouterLink>
      </template>

      <template v-else>
        <h1>That didn't work</h1>
        <p>{{ error }}</p>
        <RouterLink to="/notifications" class="btn btn-primary">Email settings</RouterLink>
      </template>
    </div>
  </main>
</template>

<style scoped>
.unsubscribe {
  display: grid;
  place-items: center;
  min-height: 60vh;
  padding: 24px 16px;
}
.notice {
  max-width: 440px;
  padding: 30px;
  text-align: center;
}
.icon {
  color: var(--pink);
}
.notice h1 {
  margin: 10px 0 8px;
  font-size: 1.35rem;
}
.notice p {
  margin: 0 0 18px;
  color: var(--muted);
}
.actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}
.error {
  margin: 14px 0 0;
  color: var(--danger, #c0392b);
}
</style>
