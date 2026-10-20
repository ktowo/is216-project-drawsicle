<script setup>
import { ref, computed, onBeforeUnmount } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { Mail, MailCheck, ArrowLeft, Loader2, RotateCw } from 'lucide-vue-next';
import AuthLayout from '@/components/AuthLayout.vue';
import TextField from '@/components/TextField.vue';
import { api } from '@/api';
import { toast } from '@/stores/toast';

const route = useRoute();
// ?email= fills it in (from the sign-up page when the email already has an account)
const email = ref(typeof route.query.email === 'string' ? route.query.email.slice(0, 254) : '');
const loading = ref(false);
const error = ref('');
const sent = ref(false);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_WAIT_SECONDS = 30;

// Seconds until "Send it again" works
const wait = ref(0);
let timer = null;
function startWait() {
  wait.value = RESEND_WAIT_SECONDS;
  clearInterval(timer);
  timer = setInterval(() => {
    wait.value -= 1;
    if (wait.value <= 0) clearInterval(timer);
  }, 1000);
}
onBeforeUnmount(() => clearInterval(timer));

const resendLabel = computed(() => (wait.value > 0 ? `Send it again in ${wait.value}s` : 'Send it again'));

async function send() {
  await api('/auth/forgot-password', { method: 'POST', body: { email: email.value.trim() } });
  startWait();
}

async function submit() {
  error.value = '';
  if (!EMAIL_RE.test(email.value.trim())) {
    error.value = 'Enter a valid email address.';
    return;
  }
  loading.value = true;
  try {
    await send();
    sent.value = true;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function resend() {
  if (wait.value > 0 || loading.value) return;
  error.value = '';
  loading.value = true;
  try {
    await send();
    toast.success('Sent again. Only the newest link works.');
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthLayout
    :icon="sent ? MailCheck : Mail"
    :title="sent ? 'Check your inbox' : 'Reset password'"
    :subtitle="sent ? 'The link works for 1 hour' : 'We\'ll send you a link to reset it'"
  >
    <div v-if="sent" class="sent">
      <p>
        If an account exists for <strong>{{ email }}</strong>, a reset link is on its way.
        Check your spam folder if it doesn't show up in a minute.
      </p>
      <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>
      <div class="sent-actions">
        <button type="button" class="btn btn-primary btn-block" :disabled="wait > 0 || loading" @click="resend">
          <Loader2 v-if="loading" :size="18" class="spin" aria-hidden="true" />
          <RotateCw v-else :size="18" aria-hidden="true" />
          {{ resendLabel }}
        </button>
        <button type="button" class="btn btn-outline btn-block" @click="sent = false">Use a different email</button>
      </div>
    </div>

    <form v-else novalidate @submit.prevent="submit">
      <TextField
        v-model="email"
        label="Email address"
        type="email"
        :icon="Mail"
        placeholder="you@example.com"
        autocomplete="email"
        required
      />

      <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>

      <button type="submit" class="btn btn-primary btn-block submit" :disabled="loading">
        <Loader2 v-if="loading" :size="18" class="spin" aria-hidden="true" />
        Send reset link
      </button>
    </form>

    <template #footer>
      <RouterLink to="/login" class="back"><ArrowLeft :size="16" aria-hidden="true" /> Back to log in</RouterLink>
    </template>
  </AuthLayout>
</template>

<style scoped>
.alert {
  margin: 20px 0 0;
}
.submit {
  margin-top: 28px;
  font-size: 1.1rem;
  padding: 16px;
}
.sent {
  text-align: center;
}
.sent p {
  margin: 0 0 24px;
  line-height: 1.6;
}
.sent .alert {
  margin: 0 0 16px;
}
.sent-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 1.05rem;
}
</style>
