<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { UserPlus, Mail, Lock, Loader2, Smile } from 'lucide-vue-next';
import AuthLayout from '@/components/AuthLayout.vue';
import TextField from '@/components/TextField.vue';
import GoogleButton from '@/components/GoogleButton.vue';
import DiscordButton from '@/components/DiscordButton.vue';
import OrDivider from '@/components/ui/OrDivider.vue';
import PasswordStrength from '@/components/PasswordStrength.vue';
import { register } from '@/stores/auth';
import { toast } from '@/stores/toast';
import { api } from '@/api';
import { safeRedirect } from '@/router';

const route = useRoute();
const router = useRouter();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 60;

const displayName = ref('');
const email = ref('');
const password = ref('');
const confirm = ref('');
const loading = ref(false);
const error = ref('');
const providers = ref({ google: false, discord: false });

const redirectTo = computed(() => safeRedirect(route.query.redirect));
const showProviders = computed(() => providers.value.google || providers.value.discord);

// Opened in a new tab so the half-filled form isn't lost (resolve() keeps mock mode's # URLs working)
const termsHref = router.resolve('/terms').href;
const guidelinesHref = router.resolve('/guidelines').href;

onMounted(async () => {
  try {
    const data = await api('/auth/providers');
    providers.value = { google: Boolean(data.google), discord: Boolean(data.discord) };
  } catch {
    // No providers list: just show the email form
  }
});

async function submit() {
  error.value = '';
  if (displayName.value.trim().length > NAME_MAX) {
    error.value = `Display name is too long (max ${NAME_MAX}).`;
    return;
  }
  if (!EMAIL_RE.test(email.value.trim())) {
    error.value = 'Enter a valid email address.';
    return;
  }
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
    const user = await register(email.value.trim(), password.value, displayName.value);
    toast.success(`Welcome to Drawisicle, ${user.displayName}!`);
    router.replace(redirectTo.value);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthLayout :icon="UserPlus" title="Create your account" subtitle="Join art exchanges in a few clicks">
    <template v-if="showProviders">
      <div class="providers">
        <GoogleButton v-if="providers.google" :redirect="route.query.redirect ? redirectTo : ''" />
        <DiscordButton v-if="providers.discord" :redirect="route.query.redirect ? redirectTo : ''" />
      </div>
      <OrDivider />
    </template>

    <form novalidate @submit.prevent="submit">
      <TextField
        v-model="displayName"
        label="Display name (optional)"
        :icon="Smile"
        placeholder="How other artists will see you"
        autocomplete="nickname"
        :maxlength="NAME_MAX"
        hint="You can change this later. We'll use the start of your email if you leave it empty."
      />
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
        :maxlength="128"
        required
      />
      <PasswordStrength :password="password" />
      <TextField
        v-model="confirm"
        label="Confirm password"
        type="password"
        :icon="Lock"
        placeholder="Type it again"
        autocomplete="new-password"
        :maxlength="128"
        required
      />

      <p v-if="error" class="alert alert-error" role="alert">{{ error }}</p>

      <p class="terms">
        By creating an account you agree to the
        <a :href="termsHref" target="_blank" rel="noopener">Terms<span class="sr-only"> (opens in a new tab)</span></a>
        and the
        <a :href="guidelinesHref" target="_blank" rel="noopener">
          Community guidelines<span class="sr-only"> (opens in a new tab)</span></a>.
      </p>

      <button type="submit" class="btn btn-primary btn-block submit" :disabled="loading">
        <Loader2 v-if="loading" :size="18" class="spin" aria-hidden="true" />
        Create account
      </button>
    </form>

    <template #footer>
      Already have an account?
      <RouterLink :to="route.query.redirect ? { name: 'login', query: { redirect: redirectTo } } : '/login'">
        Log in
      </RouterLink>
    </template>
  </AuthLayout>
</template>

<style scoped>
.providers {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.alert {
  margin: 20px 0 0;
}
.terms {
  margin: 24px 0 0;
  font-size: 0.9rem;
  color: var(--muted);
  line-height: 1.5;
}
.terms a {
  font-weight: 600;
}
.submit {
  margin-top: 16px;
  font-size: 1.1rem;
  padding: 16px;
}
</style>
