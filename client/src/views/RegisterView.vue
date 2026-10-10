<script setup>
import { ref } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import { UserPlus, Mail, Lock, Loader2 } from 'lucide-vue-next';
import AuthLayout from '../components/AuthLayout.vue';
import TextField from '../components/TextField.vue';
import GoogleButton from '../components/GoogleButton.vue';
import { register } from '../stores/auth';

const router = useRouter();

const email = ref('');
const password = ref('');
const confirm = ref('');
const loading = ref(false);
const error = ref('');

async function submit() {
  error.value = '';
  if (password.value.length < 8) {
    error.value = 'Password must be at least 8 characters.';
    return;
  }
  if (password.value !== confirm.value) {
    error.value = "Passwords don't match.";
    return;
  }

  loading.value = true;
  try {
    await register(email.value, password.value);
    router.replace('/dashboard');
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthLayout :icon="UserPlus" title="Create your account" subtitle="Sign up to get started">
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
        placeholder="At least 8 characters"
        autocomplete="new-password"
        required
      />
      <TextField
        v-model="confirm"
        label="Confirm Password"
        type="password"
        :icon="Lock"
        placeholder="Type it again"
        autocomplete="new-password"
        required
      />

      <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>

      <button class="btn btn-primary btn-block submit" :disabled="loading">
        <Loader2 v-if="loading" :size="18" class="spin" />
        Create account
      </button>
    </form>

    <template #footer>
      Already have an account? <RouterLink to="/login">Log in</RouterLink>
    </template>
  </AuthLayout>
</template>

<style scoped>
.alert {
  margin: 20px 0 0;
}
.submit {
  margin-top: 32px;
  font-size: 1.1rem;
  padding: 16px;
}
</style>
