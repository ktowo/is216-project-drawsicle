<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { Mail, Lock, KeyRound, Loader2, TriangleAlert, CircleCheck, Circle, Download } from 'lucide-vue-next';
import PageHeader from '@/components/ui/PageHeader.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import TextField from '@/components/TextField.vue';
import PasswordStrength from '@/components/PasswordStrength.vue';
import BlockList from '@/components/profile/BlockList.vue';
import { auth, setUser } from '@/stores/auth';
import { toast } from '@/stores/toast';
import { api } from '@/api';
import { formatDate } from '@/utils/format';
import { saveJson, dateStamp } from '@/utils/download';
import { LIMITS } from '@shared/constants.mjs';

const router = useRouter();

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const GRACE_DAYS = LIMITS.deactivationGraceDays;

const linked = computed(() => ({
  google: Boolean(auth.user?.providers?.google),
  discord: Boolean(auth.user?.providers?.discord),
}));
const hasProvider = computed(() => linked.value.google || linked.value.discord);

// true / false when we know, null when we can't tell. Accounts made with email always have a
// password; ones made with Google or Discord may or may not have added one since. The server's
// WRONG_PASSWORD answer settles it.
const passwordKnown = ref(null);
const hasPassword = computed(() => {
  if (passwordKnown.value !== null) return passwordKnown.value;
  if (typeof auth.user?.hasPassword === 'boolean') return auth.user.hasPassword;
  return hasProvider.value ? null : true;
});

const providerNames = computed(() =>
  [linked.value.google && 'Google', linked.value.discord && 'Discord'].filter(Boolean).join(' or ')
);

// Which sign-in buttons the server offers (rows for providers that aren't set up are hidden)
const available = ref({ google: false, discord: false });
onMounted(async () => {
  try {
    const data = await api('/auth/providers');
    available.value = { google: Boolean(data.google), discord: Boolean(data.discord) };
  } catch {
    // Connected providers still show; the others just aren't offered
  }
});

const methods = computed(() => {
  const rows = [
    {
      key: 'password',
      label: 'Email and password',
      connected: hasPassword.value === true,
      status: hasPassword.value === true ? 'Set up' : hasPassword.value === false ? 'No password yet' : 'Optional',
    },
  ];
  for (const [key, label] of [
    ['google', 'Google'],
    ['discord', 'Discord'],
  ]) {
    if (linked.value[key] || available.value[key]) {
      rows.push({ key, label, connected: linked.value[key], status: linked.value[key] ? 'Connected' : 'Not connected' });
    }
  }
  return rows;
});
const canConnectMore = computed(() => methods.value.some((m) => m.key !== 'password' && !m.connected));

// ---------- Password ----------

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const pwErrors = ref({});
const pwError = ref('');
const savingPassword = ref(false);

const passwordTitle = computed(() => (hasPassword.value === false ? 'Set a password' : 'Change password'));
const passwordIntro = computed(() => {
  if (hasPassword.value === false) {
    return `You sign in with ${providerNames.value}. Add a password to also log in with your email address.`;
  }
  if (hasPassword.value === null) {
    return `You can sign in with ${providerNames.value}. If you have never set a password, leave "Current password" empty to add one.`;
  }
  return 'Changing your password logs you out on every other device.';
});

function focusId(id) {
  nextTick(() => document.getElementById(id)?.focus());
}

async function savePassword() {
  pwError.value = '';
  const errors = {};
  if (hasPassword.value === true && !currentPassword.value) errors.current = 'Enter your current password.';
  if (newPassword.value.length < PASSWORD_MIN) errors.new = `Use at least ${PASSWORD_MIN} characters.`;
  else if (newPassword.value.length > PASSWORD_MAX) errors.new = `Keep it under ${PASSWORD_MAX} characters.`;
  else if (currentPassword.value && newPassword.value === currentPassword.value) {
    errors.new = 'Pick something different from your current password.';
  }
  if (!errors.new && confirmPassword.value !== newPassword.value) errors.confirm = "Passwords don't match.";
  pwErrors.value = errors;
  if (errors.current) return focusId('account-current-password');
  if (errors.new) return focusId('account-new-password');
  if (errors.confirm) return focusId('account-confirm-password');

  const before = hasPassword.value;
  savingPassword.value = true;
  try {
    const body = { newPassword: newPassword.value };
    if (currentPassword.value) body.currentPassword = currentPassword.value;
    const { user } = await api('/auth/change-password', { method: 'POST', body });
    setUser(user);
    passwordKnown.value = true;
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
    toast.success(
      before === false
        ? 'Password set. You can now log in with your email too.'
        : 'Password saved. Other devices have been logged out.'
    );
  } catch (e) {
    if (e.code === 'WRONG_PASSWORD') {
      // The account definitely has a password, so ask for it properly
      passwordKnown.value = true;
      pwErrors.value = {
        current: currentPassword.value
          ? "That isn't your current password."
          : 'This account already has a password. Enter it to change it.',
      };
      focusId('account-current-password');
    } else if (e.status === 400) {
      pwErrors.value = { new: e.message };
      focusId('account-new-password');
    } else {
      pwError.value = e.message;
    }
  } finally {
    savingPassword.value = false;
  }
}

// ---------- Your data ----------

const exporting = ref(false);
const exportError = ref('');

async function downloadData() {
  if (exporting.value) return;
  exporting.value = true;
  exportError.value = '';
  try {
    const data = await api('/profile/export');
    if (saveJson(`drawsicle-data-${dateStamp()}.json`, data)) {
      toast.success('Your data file is downloading. Check your downloads folder.');
    } else {
      exportError.value = "Your browser didn't let us save the file. Try again, or try another browser.";
    }
  } catch (e) {
    exportError.value = e.message;
  } finally {
    exporting.value = false;
  }
}

// ---------- Deactivate ----------

const deactivateOpen = ref(false);
const deactivatePassword = ref('');
const deactivateError = ref('');
const deactivating = ref(false);

function openDeactivate() {
  deactivatePassword.value = '';
  deactivateError.value = '';
  deactivateOpen.value = true;
}

function closeDeactivate() {
  if (!deactivating.value) deactivateOpen.value = false;
}

async function deactivate() {
  if (deactivating.value) return;
  deactivateError.value = '';
  if (hasPassword.value === true && !deactivatePassword.value) {
    deactivateError.value = 'Enter your password to confirm.';
    focusId('account-deactivate-password');
    return;
  }

  deactivating.value = true;
  try {
    const body = deactivatePassword.value ? { password: deactivatePassword.value } : {};
    await api('/profile/deactivate', { method: 'POST', body });
    deactivating.value = false;
    deactivateOpen.value = false;
    setUser(null);
    await router.push('/');
    toast.info(`Your account is deactivated. Log back in within ${GRACE_DAYS} days if you change your mind.`, {
      duration: 8000,
    });
  } catch (e) {
    if (e.code === 'WRONG_PASSWORD') {
      passwordKnown.value = true;
      deactivateError.value = deactivatePassword.value
        ? "That password isn't right."
        : 'This account has a password. Enter it to confirm.';
      focusId('account-deactivate-password');
    } else {
      deactivateError.value = e.message;
    }
  } finally {
    deactivating.value = false;
  }
}
</script>

<template>
  <div v-if="auth.user" class="account-view">
    <PageHeader title="Account" subtitle="Sign-in details, password and account status." />

    <section class="card panel" aria-labelledby="signin-heading">
      <h2 id="signin-heading" class="section-title">Sign-in details</h2>
      <p class="section-sub">
        Member since {{ formatDate(auth.user.createdAt) || 'recently' }}.
      </p>

      <TextField
        id="account-email"
        :model-value="auth.user.email"
        label="Email"
        type="email"
        :icon="Mail"
        readonly
        hint="Your email address can't be changed yet. It's only used for sign-in and the emails you choose."
        class="email-field"
      />

      <h3 class="sub-heading">Ways to sign in</h3>
      <ul class="methods">
        <li v-for="m in methods" :key="m.key" class="method">
          <span class="method-icon" :class="{ on: m.connected }" aria-hidden="true">
            <CircleCheck v-if="m.connected" :size="18" />
            <Circle v-else :size="18" />
          </span>
          <span class="method-label">{{ m.label }}</span>
          <span class="method-status" :class="{ on: m.connected }">{{ m.status }}</span>
        </li>
      </ul>
      <p v-if="canConnectMore" class="hint connect-hint">
        To connect another way to sign in, log out and use its "Continue with" button on the login page with
        this same email address ({{ auth.user.email }}).
      </p>
    </section>

    <form class="card panel" novalidate aria-labelledby="password-heading" @submit.prevent="savePassword">
      <h2 id="password-heading" class="section-title">{{ passwordTitle }}</h2>
      <p class="section-sub">{{ passwordIntro }}</p>

      <!-- Hidden username lets password managers save the new password against the right account -->
      <input
        type="email"
        class="sr-only"
        :value="auth.user.email"
        autocomplete="username"
        tabindex="-1"
        aria-hidden="true"
        readonly
      />

      <div class="password-fields">
        <TextField
          v-if="hasPassword !== false"
          id="account-current-password"
          v-model="currentPassword"
          :label="hasPassword === null ? 'Current password (if you have one)' : 'Current password'"
          type="password"
          :icon="Lock"
          autocomplete="current-password"
          :maxlength="PASSWORD_MAX"
          :error="pwErrors.current"
          :required="hasPassword === true"
        />
        <TextField
          id="account-new-password"
          v-model="newPassword"
          label="New password"
          type="password"
          :icon="KeyRound"
          autocomplete="new-password"
          :maxlength="PASSWORD_MAX"
          :error="pwErrors.new"
          :hint="`At least ${PASSWORD_MIN} characters.`"
          required
        />
        <PasswordStrength :password="newPassword" />
        <TextField
          id="account-confirm-password"
          v-model="confirmPassword"
          label="Confirm new password"
          type="password"
          :icon="KeyRound"
          autocomplete="new-password"
          :maxlength="PASSWORD_MAX"
          :error="pwErrors.confirm"
          required
        />
      </div>

      <p v-if="pwError" class="alert alert-error form-alert" role="alert">{{ pwError }}</p>

      <div class="actions start">
        <button type="submit" class="btn btn-primary" :disabled="savingPassword">
          <Loader2 v-if="savingPassword" :size="18" class="spin" aria-hidden="true" />
          {{ hasPassword === false ? 'Set password' : 'Save password' }}
        </button>
      </div>
    </form>

    <BlockList />

    <section class="card panel" aria-labelledby="data-heading">
      <h2 id="data-heading" class="section-title">Your data</h2>
      <p class="section-sub data-sub">
        Get a copy of everything Drawsicle keeps about you in one file: your profile and settings, characters,
        sign-up forms, the gifts you've made, your notifications and the events you asked us to remind you about.
      </p>
      <p class="section-sub data-sub">
        It's a JSON file you can open in any text editor. Gifts other artists made for you aren't included; they
        stay on each event's page. Downloading doesn't change or delete anything.
      </p>
      <button type="button" class="btn btn-outline" :disabled="exporting" @click="downloadData">
        <Loader2 v-if="exporting" :size="18" class="spin" aria-hidden="true" />
        <Download v-else :size="18" aria-hidden="true" />
        Download my data
      </button>
      <p v-if="exportError" class="alert alert-error form-alert" role="alert">{{ exportError }}</p>
    </section>

    <section class="card panel danger-zone" aria-labelledby="danger-heading">
      <h2 id="danger-heading" class="section-title">
        <TriangleAlert :size="20" aria-hidden="true" /> Deactivate account
      </h2>
      <p class="danger-text">
        You'll be logged out everywhere and your profile is hidden. Changed your mind? Log back in within
        {{ GRACE_DAYS }} days and everything comes back. After that we remove your name, email, profile and sign-in
        details for good. Events and gifts you took part in stay, shown as "Deleted user".
      </p>
      <p class="danger-text">
        Your sign-ups are withdrawn from events that haven't published their matches yet. Matches that are already
        out stay as they are, because someone is already making a gift for you, so let those organisers know.
      </p>
      <div class="actions start">
        <button type="button" class="btn btn-outline btn-danger-text" @click="openDeactivate">
          Deactivate my account
        </button>
      </div>
    </section>

    <ConfirmDialog
      :open="deactivateOpen"
      title="Deactivate your account?"
      :message="`You can undo this by logging in again within ${GRACE_DAYS} days.`"
      confirm-label="Deactivate"
      danger
      :loading="deactivating"
      @confirm="deactivate"
      @cancel="closeDeactivate"
    >
      <form novalidate @submit.prevent="deactivate">
        <TextField
          v-if="hasPassword !== false"
          id="account-deactivate-password"
          v-model="deactivatePassword"
          :label="hasPassword === null ? 'Password (if you have one)' : 'Your password'"
          type="password"
          :icon="Lock"
          autocomplete="current-password"
          :maxlength="PASSWORD_MAX"
          :hint="hasPassword === null ? `Leave empty if you only sign in with ${providerNames}.` : ''"
        />
        <p v-if="deactivateError" class="alert alert-error dialog-alert" role="alert">{{ deactivateError }}</p>
      </form>
    </ConfirmDialog>
  </div>
</template>

<style scoped>
.account-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.account-view :deep(.page-header) {
  margin-bottom: 4px;
}
.panel {
  padding: 32px;
}
.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.section-sub {
  margin-bottom: 24px;
}
.email-field,
.password-fields {
  max-width: 520px;
}
.sub-heading {
  margin: 28px 0 10px;
  font-family: var(--font-body);
  font-size: 1rem;
  font-weight: 700;
}
.methods {
  list-style: none;
  margin: 0;
  padding: 0;
  max-width: 520px;
}
.method {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid var(--border);
}
.method:first-child {
  border-top: 0;
}
.method-icon {
  display: grid;
  place-items: center;
  color: #c9b597;
}
.method-icon.on {
  color: var(--success);
}
.method-label {
  font-weight: 600;
  flex: 1;
  min-width: 0;
}
.method-status {
  font-size: 0.9rem;
  color: var(--muted);
  text-align: right;
}
.method-status.on {
  color: var(--success);
  font-weight: 600;
}
.connect-hint {
  margin: 12px 0 0;
  max-width: 60ch;
  overflow-wrap: anywhere;
}
.form-alert {
  margin: 22px 0 0;
}
.data-sub {
  max-width: 70ch;
  margin-bottom: 18px;
}
.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 28px;
}
.actions.start {
  justify-content: flex-start;
  margin-top: 18px;
}
.danger-zone {
  border-color: var(--pink-line);
}
.danger-zone .section-title {
  color: var(--danger);
}
.danger-text {
  margin: 10px 0 0;
  max-width: 70ch;
  line-height: 1.6;
}
.dialog-alert {
  margin: 16px 0 0;
}
@media (max-width: 640px) {
  .panel {
    padding: 24px 18px;
  }
  .actions .btn {
    width: 100%;
  }
}
</style>
