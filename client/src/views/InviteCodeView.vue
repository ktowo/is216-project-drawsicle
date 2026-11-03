<script setup>
import { ref } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { Ticket, ArrowRight, Loader2 } from 'lucide-vue-next';
import AuthLayout from '@/components/AuthLayout.vue';
import TextField from '@/components/TextField.vue';
import { api } from '@/api';
import { safeRedirect } from '@/router';

// "Enter your invite code": new accounts need a code, so this page asks for it first, checks it
// (POST /auth/invite-check, which doesn't use it up) and then opens the sign-up form with the code
// already filled in. The code is used up only when the account is made.
const route = useRoute();
const router = useRouter();

const CODE_MAX = 40;
const code = ref(typeof route.query.code === 'string' ? route.query.code.trim().toUpperCase().slice(0, CODE_MAX) : '');
const error = ref('');
const loading = ref(false);

async function submit() {
  if (loading.value) return;
  const clean = code.value.trim().toUpperCase();
  if (!clean) {
    error.value = 'Enter the invite code you were given.';
    return;
  }
  error.value = '';
  loading.value = true;
  try {
    const { inviteCode } = await api('/auth/invite-check', { method: 'POST', body: { inviteCode: clean } });
    const query = { code: inviteCode || clean };
    if (route.query.redirect) query.redirect = safeRedirect(route.query.redirect);
    router.push({ name: 'register', query });
  } catch (e) {
    error.value = e?.message || "We couldn't check that code. Please try again.";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthLayout :icon="Ticket" title="Enter your invite code" subtitle="New Drawsicle accounts need an invite code">
    <form novalidate @submit.prevent="submit">
      <TextField
        id="invite-code"
        v-model="code"
        label="Invite code"
        :icon="Ticket"
        placeholder="Paste your invite code"
        autocomplete="off"
        :maxlength="CODE_MAX"
        :error="error"
        hint="Ask the person who invited you if you don't have one."
        required
      />
      <button type="submit" class="btn btn-primary btn-block submit" :disabled="loading">
        <Loader2 v-if="loading" :size="18" class="spin" aria-hidden="true" />
        <ArrowRight v-else :size="18" aria-hidden="true" />
        Continue
      </button>
    </form>

    <template #footer>
      Already have an account?
      <RouterLink to="/login">Log in</RouterLink>
    </template>
  </AuthLayout>
</template>

<style scoped>
.submit {
  margin-top: 20px;
}
</style>
