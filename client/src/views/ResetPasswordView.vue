<script setup>
import { ref } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { KeyRound, Lock, AlertTriangle, Loader2 } from 'lucide-vue-next';
import AuthLayout from '@/components/AuthLayout.vue';
import TextField from '@/components/TextField.vue';
import PasswordStrength from '@/components/PasswordStrength.vue';
import { api } from '@/api';
import { setUser } from '@/stores/auth';
import { toast } from '@/stores/toast';

const route = useRoute();
const router = useRouter();

const token = typeof route.query.token === 'string' ? route.query.token : '';
const tokenLooksValid = /^[a-f0-9]{64}$/.test(token);

const password = ref('');
const confirm = ref('');
const loading = ref(false);
const error = ref('');
// null = link fine so far, otherwise the reason it's unusable
const invalidReason = ref(
  tokenLooksValid ? null : 'The link you used appears to be incomplete. Please request a new password reset email.'
);

async function submit() {
  error.value = '';
  if (password.value.length < 8) {
    error.value = 'Password must be at least 8 characters.';
    return;
  }
  if (password.value.length > 128) {
    error.value = 'Password is too long (max 128 characters).';
    return;
  }
  if (password.value !== confirm.value) {
    error.value = "Passwords don't match.";
    return;
  }

  loading.value = true;
  try {
    const { user } = await api('/auth/reset-password', {
      method: 'POST',
      body: { token, password: password.value },
    });
    setUser(user);
    toast.success('Password updated. You are logged in.');
    router.replace('/dashboard');
  } catch (e) {
    if (e.code === 'INVALID_TOKEN') {
      invalidReason.value = 'This link has expired or was already used. Please request a new password reset email.';
    } else {
      error.value = e.message;
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthLayout
    v-if="invalidReason"
    :icon="AlertTriangle"
    title="Invalid reset link"
    subtitle="This password reset link is missing or invalid"
  >
    <p class="reason">{{ invalidReason }}</p>
    <template #footer>
      <RouterLink to="/forgot-password" class="footer-link">Request a new link</RouterLink>
    </template>
  </AuthLayout>

  <AuthLayout v-else :icon="KeyRound" title="Choose a new password" subtitle="Make it something you'll remember">
    <form novalidate @submit.prevent="submit">
      <TextField
        v-model="password"
        label="New password"
        type="password"
        :icon="Lock"
        placeholder="At least 8 characters"
        autocomplete="new-password"
        :maxlength="128"
        required
      />
      <PasswordStrength :password="password" />
      <TextField
        v-model="confirm"
        label="Confirm new password"
        type="password"
        :icon="Lock"
        placeholder="Type it again"
        autocomplete="new-password"
        :maxlength="128"
        required
      />

      <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>

      <button type="submit" class="btn btn-primary btn-block submit" :disabled="loading">
        <Loader2 v-if="loading" :size="18" class="spin" aria-hidden="true" />
        Save new password
      </button>
    </form>

    <template #footer>
      <RouterLink to="/login" class="footer-link">Back to log in</RouterLink>
    </template>
  </AuthLayout>
</template>

<style scoped>
.reason {
  margin: 0;
  text-align: center;
  line-height: 1.6;
  font-size: 1.05rem;
}
.alert {
  margin: 20px 0 0;
}
.submit {
  margin-top: 28px;
  font-size: 1.1rem;
  padding: 16px;
}
.footer-link {
  font-size: 1.05rem;
}
</style>
