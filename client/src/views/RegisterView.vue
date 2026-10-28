<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { UserPlus, Mail, Lock, Loader2, Smile, Ticket } from 'lucide-vue-next';
import AuthLayout from '@/components/AuthLayout.vue';
import TextField from '@/components/TextField.vue';
import GoogleButton from '@/components/GoogleButton.vue';
import DiscordButton from '@/components/DiscordButton.vue';
import OrDivider from '@/components/ui/OrDivider.vue';
import PasswordStrength from '@/components/PasswordStrength.vue';
import { register } from '@/stores/auth';
import ConfirmEmailNotice from '@/components/ConfirmEmailNotice.vue';
import { toast } from '@/stores/toast';
import { api } from '@/api';
import { safeRedirect } from '@/router';

const route = useRoute();
const router = useRouter();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 60;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

const displayName = ref('');
const email = ref('');
const password = ref('');
const confirm = ref('');
const inviteCode = ref('');
const loading = ref(false);
const error = ref('');
// Problems shown under each field. They appear after the first try and then update as you type.
const fieldErrors = reactive({ displayName: '', email: '', password: '', confirm: '', inviteCode: '' });
const tried = ref(false);
// The email that already has an account, so the links can offer to log in with it
const takenEmail = ref('');
// Supabase sign-in: the address to confirm before the first log-in
const confirmEmail = ref('');
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

function checkFields() {
  const name = displayName.value.trim();
  const mail = email.value.trim();
  fieldErrors.displayName = name.length > NAME_MAX ? `That's too long (max ${NAME_MAX} characters).` : '';
  if (!mail) fieldErrors.email = 'Enter your email address.';
  else if (!EMAIL_RE.test(mail)) fieldErrors.email = 'That doesn\'t look like an email address. Check for typos.';
  else if (takenEmail.value && mail.toLowerCase() === takenEmail.value) {
    fieldErrors.email = 'There is already an account with this email.';
  } else fieldErrors.email = '';
  if (password.value.length < PASSWORD_MIN) fieldErrors.password = `Use at least ${PASSWORD_MIN} characters.`;
  else if (password.value.length > PASSWORD_MAX) fieldErrors.password = `That's too long (max ${PASSWORD_MAX} characters).`;
  else fieldErrors.password = '';
  fieldErrors.confirm =
    !fieldErrors.password && password.value !== confirm.value ? "This doesn't match the password above." : '';
  fieldErrors.inviteCode = inviteCode.value.trim() ? '' : 'Enter the invite code you were given.';
  return !Object.values(fieldErrors).some(Boolean);
}

// After the first try, errors clear (or change) as soon as the field is fixed
watch([displayName, email, password, confirm], () => {
  if (tried.value) checkFields();
});

const takenLinks = computed(() => {
  const query = { email: takenEmail.value };
  if (route.query.redirect) query.redirect = redirectTo.value;
  return { login: { name: 'login', query }, forgot: { path: '/forgot-password', query: { email: takenEmail.value } } };
});

async function submit() {
  error.value = '';
  tried.value = true;
  if (!checkFields()) return;

  loading.value = true;
  try {
    const user = await register(email.value.trim(), password.value, displayName.value, inviteCode.value);
    toast.success(`Welcome to Drawsicle, ${user.displayName}!`);
    router.replace(redirectTo.value);
  } catch (e) {
    if (e.code === 'EMAIL_TAKEN') {
      takenEmail.value = email.value.trim().toLowerCase();
      checkFields();
    } else if (e.code === 'CHECK_EMAIL') {
      confirmEmail.value = email.value.trim();
    } else {
      error.value = e.message;
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthLayout :icon="UserPlus" title="Create your account" subtitle="Join art exchanges in a few clicks">
    <template v-if="showProviders">
      <div class="providers">
        <GoogleButton v-if="providers.google" :redirect="route.query.redirect ? redirectTo : ''" :invite-code="inviteCode" />
        <DiscordButton v-if="providers.discord" :redirect="route.query.redirect ? redirectTo : ''" :invite-code="inviteCode" />
      </div>
      <OrDivider />
    </template>

    <form novalidate @submit.prevent="submit">
      <TextField
        v-model="inviteCode"
        label="Invite code"
        :icon="Ticket"
        placeholder="Paste your invite code"
        autocomplete="off"
        :error="fieldErrors.inviteCode"
        required
      />
      <TextField
        v-model="displayName"
        label="Display name (optional)"
        :icon="Smile"
        placeholder="How other artists will see you"
        autocomplete="nickname"
        :maxlength="NAME_MAX"
        :error="fieldErrors.displayName"
        hint="You can change this later. We'll use the start of your email if you leave it empty."
      />
      <TextField
        v-model="email"
        label="Email"
        type="email"
        :icon="Mail"
        placeholder="you@example.com"
        autocomplete="email"
        :error="fieldErrors.email"
        required
      />
      <p v-if="takenEmail && email.trim().toLowerCase() === takenEmail" class="taken" role="status">
        Is it yours?
        <RouterLink :to="takenLinks.login">Log in</RouterLink>
        or
        <RouterLink :to="takenLinks.forgot">reset your password</RouterLink>.
      </p>
      <TextField
        v-model="password"
        label="Password"
        type="password"
        :icon="Lock"
        :placeholder="`At least ${PASSWORD_MIN} characters`"
        autocomplete="new-password"
        :maxlength="PASSWORD_MAX"
        :error="fieldErrors.password"
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
        :maxlength="PASSWORD_MAX"
        :error="fieldErrors.confirm"
        required
      />

      <ConfirmEmailNotice v-if="confirmEmail" :email="confirmEmail" />
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
.taken {
  margin: 2px 0 16px;
  font-size: 0.95rem;
  color: var(--text-soft);
}
.taken a {
  font-weight: 600;
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
