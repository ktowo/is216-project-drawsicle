<script setup>
import { play } from '@/effects/sfx';
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { LogIn, Mail, Lock, Loader2, X } from 'lucide-vue-next';
import AuthLayout from '@/components/AuthLayout.vue';
import TextField from '@/components/TextField.vue';
import GoogleButton from '@/components/GoogleButton.vue';
import DiscordButton from '@/components/DiscordButton.vue';
import OrDivider from '@/components/ui/OrDivider.vue';
import UserAvatar from '@/components/UserAvatar.vue';
import TestLogins from '@/components/TestLogins.vue';
import { TEST_LOGINS_ENABLED } from '@/utils/testLogins';
import { recentLogins, rememberLogin, forgetLogin, rememberPreference, setRememberPreference } from '@/utils/recentLogins';
import { login } from '@/stores/auth';
import { toast } from '@/stores/toast';
import { api } from '@/api';
import { safeRedirect } from '@/router';

const route = useRoute();
const router = useRouter();

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
const remember = ref(rememberPreference());
// Accounts that ticked "Remember me" here before: one click fills in the email
const recent = ref(recentLogins());
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

function pickAccount(account) {
  email.value = account.email;
  error.value = '';
  nextTick(() => document.getElementById('login-password')?.focus());
}

function forget(account) {
  forgetLogin(account.email);
  recent.value = recentLogins();
  if (email.value === account.email) email.value = '';
}

// Test accounts dropdown: picking fills the form, "Sign in as" logs straight in
function fillAccount(account) {
  email.value = account.email;
  password.value = account.password;
  error.value = '';
}

function quickLogin(account) {
  fillAccount(account);
  submit();
}

async function submit() {
  error.value = '';
  if (!email.value.trim() || !password.value) {
    error.value = 'Enter your email and password.';
    return;
  }

  loading.value = true;
  try {
    const { user, reactivated } = await login(email.value.trim(), password.value, { remember: remember.value });
    setRememberPreference(remember.value);
    if (remember.value) rememberLogin(user);
    else forgetLogin(user.email);
    if (reactivated) toast.success('Welcome back, your account is active again.', { quiet: true });
    play('chime');
    router.replace(redirectTo.value);
  } catch (e) {
    play('bonk');
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthLayout :icon="LogIn" title="Welcome back" subtitle="Log in to your account">
    <TestLogins v-if="TEST_LOGINS_ENABLED" :busy="loading" @pick="fillAccount" @login="quickLogin" />

    <template v-if="showProviders">
      <div class="providers">
        <GoogleButton v-if="providers.google" :redirect="route.query.redirect ? redirectTo : ''" />
        <DiscordButton v-if="providers.discord" :redirect="route.query.redirect ? redirectTo : ''" />
      </div>
      <OrDivider />
    </template>

    <section v-if="recent.length" class="quick" aria-labelledby="quick-title">
      <h2 id="quick-title" class="quick-title">Log in as</h2>
      <ul class="quick-list">
        <li v-for="a in recent" :key="a.email" class="quick-item" :class="{ on: email === a.email }">
          <button type="button" class="quick-pick" @click="pickAccount(a)">
            <UserAvatar :user="{ displayName: a.displayName || a.email, avatarUrl: a.avatarUrl }" :size="34" />
            <span class="min-w-0">
              <span class="quick-name">{{ a.displayName || a.email }}</span>
              <span class="quick-email">{{ a.email }}</span>
            </span>
          </button>
          <button type="button" class="quick-forget" :aria-label="`Forget ${a.email} on this device`" title="Forget on this device" @click="forget(a)">
            <X :size="15" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </section>

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
        id="login-password"
        placeholder="••••••••"
        autocomplete="current-password"
        required
      >
        <template #aside>
          <RouterLink to="/forgot-password" class="aside-link">Forgot password?</RouterLink>
        </template>
      </TextField>

      <label class="remember">
        <input v-model="remember" type="checkbox" />
        <span>
          Remember me
          <span class="remember-hint">{{ remember ? 'Stay logged in for 30 days, with quick login on this device.' : 'Log out when the browser closes.' }}</span>
        </span>
      </label>

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
.quick {
  margin-bottom: 20px;
}
.quick-title {
  margin: 0 0 8px;
  color: var(--muted);
  font-family: var(--font-body);
  font-size: 0.85rem;
  font-weight: 700;
}
.quick-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.quick-item {
  display: flex;
  align-items: center;
  border: 1.5px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
}
.quick-item.on,
.quick-item:hover {
  border-color: var(--pink);
}
.quick-pick {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.quick-name,
.quick-email {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.quick-name {
  font-weight: 700;
}
.quick-email {
  color: var(--muted);
  font-size: 0.82rem;
}
.quick-forget {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  margin-right: 6px;
  border: 0;
  border-radius: 10px;
  background: none;
  color: var(--muted);
  cursor: pointer;
}
.quick-forget:hover,
.quick-forget:focus-visible {
  background: var(--surface-2);
  color: var(--text);
}
.quick-pick:focus-visible {
  outline: 3px solid var(--pink);
  outline-offset: -3px;
  border-radius: 12px;
}
.remember {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 18px;
  font-weight: 700;
  cursor: pointer;
}
.remember input {
  width: 18px;
  height: 18px;
  margin-top: 2px;
  accent-color: var(--pink-dark);
}
.remember-hint {
  display: block;
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 500;
}
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
</style>
