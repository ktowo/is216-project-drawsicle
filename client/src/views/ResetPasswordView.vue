<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { KeyRound, Lock, AlertTriangle, Loader2, Clock, CircleCheck } from 'lucide-vue-next';
import AuthLayout from '@/components/AuthLayout.vue';
import TextField from '@/components/TextField.vue';
import PasswordStrength from '@/components/PasswordStrength.vue';
import { api } from '@/api';
import { setUser } from '@/stores/auth';

const route = useRoute();

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

const token = typeof route.query.token === 'string' ? route.query.token : '';
const tokenLooksValid = /^[a-f0-9]{64}$/.test(token);

// The page goes through these:
//   checking   asking the server if the link still works (before anyone types a password)
//   form       link is fine: choose a new password
//   invalid    link can't be used; `problem` says why
//   done       password changed and logged in
const step = ref(tokenLooksValid ? 'checking' : 'invalid');
const problem = ref(tokenLooksValid ? null : 'incomplete');
const problemMessage = ref('');
const accountEmail = ref('');

const password = ref('');
const confirm = ref('');
const fieldErrors = ref({ password: '', confirm: '' });
const loading = ref(false);
const error = ref('');

// What each reason looks like on the "can't use this link" screen
const PROBLEMS = {
  incomplete: {
    icon: AlertTriangle,
    title: 'This link is incomplete',
    subtitle: 'Part of the link is missing',
    message:
      'The link you opened is cut short, which can happen when an email app breaks it over two lines. Request a new email, or copy the whole link from the one you have.',
  },
  expired: {
    icon: Clock,
    title: 'This link has expired',
    subtitle: 'Reset links work for 1 hour',
    message: 'For your security, reset links stop working after an hour. Request a new one and use it straight away.',
  },
  used: {
    icon: AlertTriangle,
    title: "This link can't be used",
    subtitle: 'It was already used, or a newer one replaced it',
    message:
      'Each link works once, and only the newest email counts. If you already changed your password, just log in. Otherwise request a new link.',
  },
};

const shownProblem = computed(() => PROBLEMS[problem.value] || PROBLEMS.used);

function showProblem(reason, message = '') {
  problem.value = PROBLEMS[reason] ? reason : 'used';
  problemMessage.value = message;
  step.value = 'invalid';
}

onMounted(async () => {
  if (step.value !== 'checking') return;
  try {
    const data = await api(`/auth/reset-password/check?token=${token}`);
    accountEmail.value = data.email || '';
    step.value = 'form';
  } catch (e) {
    if (e.code === 'INVALID_TOKEN') {
      showProblem(e.data?.reason);
    } else {
      // Couldn't check (offline, server down): let them try anyway; submitting checks again
      step.value = 'form';
      error.value = `We couldn't check this link just now (${e.message}). You can still try.`;
    }
  }
});

function validate() {
  const errors = { password: '', confirm: '' };
  if (password.value.length < PASSWORD_MIN) errors.password = `Use at least ${PASSWORD_MIN} characters.`;
  else if (password.value.length > PASSWORD_MAX) errors.password = `That's too long (max ${PASSWORD_MAX} characters).`;
  if (!errors.password && password.value !== confirm.value) errors.confirm = "This doesn't match the password above.";
  fieldErrors.value = errors;
  return !errors.password && !errors.confirm;
}

async function submit() {
  error.value = '';
  if (!validate()) return;

  loading.value = true;
  try {
    const { user } = await api('/auth/reset-password', {
      method: 'POST',
      body: { token, password: password.value },
    });
    setUser(user);
    step.value = 'done';
  } catch (e) {
    if (e.code === 'INVALID_TOKEN') showProblem(e.data?.reason);
    else error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthLayout v-if="step === 'checking'" :icon="KeyRound" title="Checking your link" subtitle="This only takes a moment">
    <p class="reason checking" role="status">
      <Loader2 :size="20" class="spin" aria-hidden="true" /> Making sure your reset link still works…
    </p>
  </AuthLayout>

  <AuthLayout
    v-else-if="step === 'invalid'"
    :icon="shownProblem.icon"
    :title="shownProblem.title"
    :subtitle="shownProblem.subtitle"
  >
    <p class="reason">{{ problemMessage || shownProblem.message }}</p>
    <div class="stack">
      <RouterLink to="/forgot-password" class="btn btn-primary btn-block">Email me a new link</RouterLink>
      <RouterLink v-if="problem === 'used'" to="/login" class="btn btn-outline btn-block">Log in instead</RouterLink>
    </div>
    <template #footer>
      <RouterLink to="/help" class="footer-link">Still stuck? Get help</RouterLink>
    </template>
  </AuthLayout>

  <AuthLayout
    v-else-if="step === 'done'"
    :icon="CircleCheck"
    title="Password updated"
    subtitle="You're logged in with your new password"
  >
    <p class="reason">
      For your safety we logged you out everywhere else. Use your new password next time you log in on another device.
    </p>
    <div class="stack">
      <RouterLink to="/dashboard" class="btn btn-primary btn-block">Go to my dashboard</RouterLink>
    </div>
  </AuthLayout>

  <AuthLayout v-else :icon="KeyRound" title="Choose a new password" subtitle="Make it something you'll remember">
    <p v-if="accountEmail" class="account">
      For the account <strong>{{ accountEmail }}</strong>
    </p>
    <form novalidate @submit.prevent="submit">
      <TextField
        v-model="password"
        label="New password"
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
        label="Confirm new password"
        type="password"
        :icon="Lock"
        placeholder="Type it again"
        autocomplete="new-password"
        :maxlength="PASSWORD_MAX"
        :error="fieldErrors.confirm"
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
.checking {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.account {
  margin: 0 0 18px;
  text-align: center;
  color: var(--text-soft);
}
.stack {
  display: grid;
  gap: 10px;
  margin-top: 24px;
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
