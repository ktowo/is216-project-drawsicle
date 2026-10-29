<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import TextField from '@/components/TextField.vue';
import { Ticket } from 'lucide-vue-next';
import { finishRedirect, exchangeForSession, verifyEmailLink } from '@/auth/supabaseSignIn';
import { setUser } from '@/stores/auth';
import { rememberPreference } from '@/utils/recentLogins';
import { safeRedirect, emailLinkType } from '@/utils/supabaseAuth';
import { takeInvite, isInviteProblem } from '@/utils/pendingInvite';

// Where Supabase sends people back after Google, Discord or an email link (AUTH_PROVIDER=supabase).
// Swaps the one-time code for a Supabase session, then that for the app's own session.
const route = useRoute();
const router = useRouter();
const error = ref('');
// New accounts need an invite code: kept from the sign-up page, or asked for here
const askInvite = ref(false);
const inviteCode = ref('');
const inviteError = ref('');
const finishing = ref(false);
let pendingToken = '';
let pendingRedirect = '/dashboard';

async function finish(token, code) {
  const { user, reactivated } = await exchangeForSession(token, { remember: rememberPreference(), inviteCode: code || undefined });
  setUser(user);
  router.replace(reactivated ? { path: pendingRedirect, query: { reactivated: '1' } } : pendingRedirect);
}

async function submitInvite() {
  if (finishing.value) return;
  const code = inviteCode.value.trim();
  if (!code) {
    inviteError.value = 'Enter the invite code you were given.';
    return;
  }
  inviteError.value = '';
  finishing.value = true;
  try {
    await finish(pendingToken, code);
  } catch (err) {
    inviteError.value = err?.message || 'That invite code did not work.';
  } finally {
    finishing.value = false;
  }
}

onMounted(async () => {
  const q = route.query;
  if (q.error || q.error_description) {
    error.value = q.error === 'access_denied' ? 'Sign-in was cancelled.' : "We couldn't sign you in. Please try again.";
    return;
  }
  // A "confirm your email" link: one-time token_hash, works in any browser
  const linkType = typeof q.token_hash === 'string' && q.token_hash ? emailLinkType(q.type) : null;
  if (!linkType && (typeof q.code !== 'string' || !q.code)) {
    error.value = 'This sign-in link is incomplete or was already used. Please sign in again.';
    return;
  }
  try {
    pendingRedirect = safeRedirect(typeof q.redirect === 'string' ? q.redirect : '');
    pendingToken = linkType ? (await verifyEmailLink(q.token_hash, linkType)).accessToken : await finishRedirect(q.code);
    const kept = takeInvite();
    try {
      await finish(pendingToken, kept);
    } catch (err) {
      if (!isInviteProblem(err)) throw err;
      // A new account without a (working) invite code: ask here, with the same sign-in
      inviteCode.value = kept;
      inviteError.value = kept ? err.message : '';
      askInvite.value = true;
    }
  } catch (err) {
    error.value =
      err?.code === 'expired'
        ? 'This confirmation link has expired. Log in with your email and password to get a new one.'
        : err?.code === 'used'
          ? 'This link was already used. If your email is confirmed, just log in.'
          : err?.message || "We couldn't sign you in. Please try again.";
  }
});
</script>

<template>
  <main class="callback">
    <div v-if="error" class="card notice" role="alert">
      <h1>Couldn't sign you in</h1>
      <p>{{ error }}</p>
      <RouterLink to="/login" class="btn btn-primary">Back to log in</RouterLink>
    </div>
    <form v-else-if="askInvite" class="card notice" novalidate @submit.prevent="submitInvite">
      <h1>One more step</h1>
      <p>New Drawsicle accounts need an invite code. Enter the one you were given to finish signing up.</p>
      <TextField
        id="callback-invite"
        v-model="inviteCode"
        label="Invite code"
        :icon="Ticket"
        placeholder="Paste your invite code"
        autocomplete="off"
        :error="inviteError"
        required
        class="invite-field"
      />
      <button type="submit" class="btn btn-primary" :disabled="finishing">Finish signing up</button>
      <RouterLink to="/login" class="btn btn-ghost">Cancel</RouterLink>
    </form>
    <LoadingBlock v-else label="Signing you in…" />
  </main>
</template>

<style scoped>
.callback {
  display: grid;
  place-items: center;
  min-height: 60vh;
  padding: 24px 16px;
}
.notice {
  max-width: 420px;
  padding: 28px;
  text-align: center;
}
.notice h1 {
  margin: 0 0 8px;
  font-size: 1.4rem;
}
.invite-field {
  margin-bottom: 14px;
  text-align: left;
}
.notice p {
  margin: 0 0 18px;
  color: var(--muted);
}
</style>
