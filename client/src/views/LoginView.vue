<script setup>
import { ref } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { LogIn, Mail, Lock, Loader2 } from 'lucide-vue-next';
import AuthLayout from '../components/AuthLayout.vue';
import TextField from '../components/TextField.vue';
import GoogleButton from '../components/GoogleButton.vue';
import { login } from '../stores/auth';
import { safeRedirect } from '../router';

const route = useRoute();
const router = useRouter();

const googleErrors = {
  google_cancelled: 'Google sign-in was cancelled.',
  google_failed: "Couldn't sign in with Google. Please try again.",
  google_unverified: "Your Google email isn't verified yet.",
  google_not_configured: "Google sign-in isn't set up on the server yet.",
};

const email = ref('');
const password = ref('');
const loading = ref(false);
const error = ref(googleErrors[route.query.error] || '');

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    await login(email.value, password.value);
    router.replace(safeRedirect(route.query.redirect));
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthLayout :icon="LogIn" title="Welcome back" subtitle="Log in to your account">
    <GoogleButton />

    <form novalidate @submit.prevent="submit">
      <TextField
        v-model="email"
        label="Email"
        type="email"
        :icon="Mail"
        placeholder="you@example.com"
        autocomplete="email"
        required
      />
      <TextField
        v-model="password"
        label="Password"
        type="password"
        :icon="Lock"
        placeholder="••••••••"
        autocomplete="current-password"
        required
      >
        <template #aside>
          <RouterLink to="/forgot-password" class="aside-link">Forgot password?</RouterLink>
        </template>
      </TextField>

      <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>

      <button class="btn btn-primary btn-block submit" :disabled="loading">
        <Loader2 v-if="loading" :size="18" class="spin" />
        Log in
      </button>
    </form>

    <template #footer>
      Don't have an account? <RouterLink to="/register">Create one</RouterLink>
    </template>
  </AuthLayout>
</template>

<style scoped>
.aside-link {
  font-size: 0.95rem;
}
.alert {
  margin: 20px 0 0;
}
.submit {
  margin-top: 32px;
  font-size: 1.1rem;
  padding: 16px;
}
</style>
