<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { LogIn, Mail, Lock, Loader2, FlaskConical } from 'lucide-vue-next';
import AuthLayout from '@/components/AuthLayout.vue';
import TextField from '@/components/TextField.vue';
import GoogleButton from '@/components/GoogleButton.vue';
import DiscordButton from '@/components/DiscordButton.vue';
import OrDivider from '@/components/ui/OrDivider.vue';
import { login } from '@/stores/auth';
import { toast } from '@/stores/toast';
import { api, isMockMode } from '@/api';
import { safeRedirect } from '@/router';

const route = useRoute();
const router = useRouter();

const DEMO = { email: 'mika@demo.test', password: 'drawisicle123' };

// Codes the server puts in ?error= when a Google/Discord sign-in fails
const PROVIDER_ERRORS = {
  google_cancelled: 'Google sign-in was cancelled.',
  google_failed: "Couldn't sign in with Google. Please try again.",
  google_unverified: "Your Google email isn't verified yet.",
  google_not_configured: "Google sign-in isn't set up on the server yet.",
  discord_cancelled: 'Discord sign-in was cancelled.',
  discord_failed: "Couldn't sign in with Discord. Please try again.",
  discord_unverified: 'Your Discord account needs a verified email address first.',
  account_banned: 'This account has been suspended by the site admins.',
  discord_no_email: "Discord didn't share an email address, so we couldn't sign you in.",
  discord_not_configured: "Discord sign-in isn't set up on the server yet.",
};

function providerError(code) {
  if (typeof code !== 'string' || !code) return '';
  if (PROVIDER_ERRORS[code]) return PROVIDER_ERRORS[code];
  if (code.startsWith('google_')) return "Couldn't sign in with Google. Please try again.";
  if (code.startsWith('discord_')) return "Couldn't sign in with Discord. Please try again.";
  return '';
}

const email = ref('');
const password = ref('');
const loading = ref(false);
const error = ref(providerError(route.query.error));
const providers = ref({ google: false, discord: false });

const redirectTo = computed(() => safeRedirect(route.query.redirect));
const showProviders = computed(() => providers.value.google || providers.value.discord);

onMounted(async () => {
  try {
    const data = await api('/auth/providers');
    providers.value = { google: Boolean(data.google), discord: Boolean(data.discord) };
  } catch {
    // No providers list: just show the email form
  }
});

function fillDemo() {
  email.value = DEMO.email;
  password.value = DEMO.password;
}

async function submit() {
  error.value = '';
  if (!email.value.trim() || !password.value) {
    error.value = 'Enter your email and password.';
    return;
  }

  loading.value = true;
  try {
    const { reactivated } = await login(email.value.trim(), password.value);
    if (reactivated) toast.success('Welcome back, your account is active again.');
    router.replace(redirectTo.value);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthLayout :icon="LogIn" title="Welcome back" subtitle="Log in to your account">
    <div v-if="isMockMode" class="demo-box">
      <FlaskConical :size="18" class="demo-icon" aria-hidden="true" />
      <div class="demo-text">
        <strong>Demo mode.</strong> Log in as Mika with
        <code>{{ DEMO.email }}</code> / <code>{{ DEMO.password }}</code>
      </div>
      <button type="button" class="btn btn-outline btn-xs" @click="fillDemo">Fill in</button>
    </div>

    <template v-if="showProviders">
      <div class="providers">
        <GoogleButton v-if="providers.google" :redirect="route.query.redirect ? redirectTo : ''" />
        <DiscordButton v-if="providers.discord" :redirect="route.query.redirect ? redirectTo : ''" />
      </div>
      <OrDivider />
    </template>

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

      <button type="submit" class="btn btn-primary btn-block submit" :disabled="loading">
        <Loader2 v-if="loading" :size="18" class="spin" aria-hidden="true" />
        Log in
      </button>
    </form>

    <template #footer>
      Don't have an account?
      <RouterLink :to="route.query.redirect ? { name: 'register', query: { redirect: redirectTo } } : '/register'">
        Create one
      </RouterLink>
    </template>
  </AuthLayout>
</template>

<style scoped>
.aside-link {
  font-size: 0.95rem;
}
.providers {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.alert {
  margin: 20px 0 0;
}
.submit {
  margin-top: 32px;
  font-size: 1.1rem;
  padding: 16px;
}
.demo-box {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 24px;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--info-soft, var(--blue-soft));
  color: var(--info, var(--blue-ink));
  font-size: 0.92rem;
}
.demo-icon {
  flex-shrink: 0;
}
.demo-text {
  flex: 1 1 200px;
  line-height: 1.5;
}
.demo-text code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.85rem;
  background: color-mix(in srgb, var(--surface) 70%, transparent);
  padding: 1px 5px;
  border-radius: 6px;
  word-break: break-all;
}
</style>
