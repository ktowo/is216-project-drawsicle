<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import { finishRedirect, exchangeForSession, verifyEmailLink } from '@/auth/supabaseSignIn';
import { setUser } from '@/stores/auth';
import { rememberPreference } from '@/utils/recentLogins';
import { safeRedirect, emailLinkType } from '@/utils/supabaseAuth';

// Where Supabase sends people back after Google, Discord or an email link (AUTH_PROVIDER=supabase).
// Swaps the one-time code for a Supabase session, then that for the app's own session.
const route = useRoute();
const router = useRouter();
const error = ref('');

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
    const token = linkType ? (await verifyEmailLink(q.token_hash, linkType)).accessToken : await finishRedirect(q.code);
    const { user, reactivated } = await exchangeForSession(token, { remember: rememberPreference() });
    setUser(user);
    const to = safeRedirect(typeof q.redirect === 'string' ? q.redirect : '');
    router.replace(reactivated ? { path: to, query: { reactivated: '1' } } : to);
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
.notice p {
  margin: 0 0 18px;
  color: var(--muted);
}
</style>
