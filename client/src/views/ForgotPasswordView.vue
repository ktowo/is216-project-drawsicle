<script setup>
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { Mail, MailCheck, ArrowLeft, Loader2 } from 'lucide-vue-next';
import AuthLayout from '@/components/AuthLayout.vue';
import TextField from '@/components/TextField.vue';
import { api } from '@/api';

const email = ref('');
const loading = ref(false);
const error = ref('');
const sent = ref(false);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function submit() {
  error.value = '';
  if (!EMAIL_RE.test(email.value.trim())) {
    error.value = 'Enter a valid email address.';
    return;
  }
  loading.value = true;
  try {
    await api('/auth/forgot-password', { method: 'POST', body: { email: email.value.trim() } });
    sent.value = true;
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
      <button type="button" class="btn btn-outline btn-block" @click="sent = false">Use a different email</button>
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
.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 1.05rem;
}
</style>
