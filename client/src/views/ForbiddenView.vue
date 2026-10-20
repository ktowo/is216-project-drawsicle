<script setup>
import { ref, computed } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { LockKeyhole, House, Compass, LogIn, UserPlus, UserRoundCog, Loader2, CalendarHeart } from 'lucide-vue-next';
import StatusPage from '@/components/ui/StatusPage.vue';
import { auth, logout } from '@/stores/auth';
import { safeRedirect } from '@/router';

const route = useRoute();
const router = useRouter();

// Pages can send people here with ?from=/events/123/manage so logging in as someone else brings them back
const from = computed(() => {
  const value = typeof route.query.from === 'string' ? route.query.from : '';
  return value && safeRedirect(value) === value ? value : '';
});
const loginTarget = computed(() => ({ name: 'login', query: from.value ? { redirect: from.value } : {} }));

const switching = ref(false);
async function logInAsSomeoneElse() {
  switching.value = true;
  try {
    await logout();
    await router.push(loginTarget.value);
  } finally {
    switching.value = false;
  }
}
</script>

<template>
  <StatusPage code="403" :icon="LockKeyhole" title="This page isn't open to you">
    <template v-if="auth.user">
      <p>
        You're logged in as <strong>{{ auth.user.displayName }}</strong
        >, and this page is only for an event's organisers.
      </p>
      <p>
        If you should be helping run the event, ask one of its organisers to add you. If you have another account that
        can, you can switch to it.
      </p>
    </template>
    <template v-else>
      <p>You need to log in first, and the page may only be open to an event's organisers.</p>
    </template>

    <template #actions>
      <template v-if="auth.user">
        <RouterLink to="/dashboard" class="btn btn-primary">
          <House :size="18" aria-hidden="true" /> Go to your dashboard
        </RouterLink>
        <RouterLink to="/events" class="btn btn-outline">
          <Compass :size="18" aria-hidden="true" /> Browse events
        </RouterLink>
        <RouterLink to="/my-events" class="btn btn-ghost">
          <CalendarHeart :size="18" aria-hidden="true" /> My events
        </RouterLink>
      </template>
      <template v-else>
        <RouterLink :to="loginTarget" class="btn btn-primary"><LogIn :size="18" aria-hidden="true" /> Log in</RouterLink>
        <RouterLink to="/register" class="btn btn-outline">
          <UserPlus :size="18" aria-hidden="true" /> Create an account
        </RouterLink>
        <RouterLink to="/events" class="btn btn-ghost"><Compass :size="18" aria-hidden="true" /> Browse events</RouterLink>
      </template>
    </template>

    <template v-if="auth.user" #footer>
      <p class="switch">
        Not the right account?
        <button type="button" class="btn btn-ghost btn-sm" :disabled="switching" @click="logInAsSomeoneElse">
          <Loader2 v-if="switching" :size="16" class="spin" aria-hidden="true" />
          <UserRoundCog v-else :size="16" aria-hidden="true" /> Log in as someone else
        </button>
      </p>
    </template>
  </StatusPage>
</template>

<style scoped>
.switch {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px 8px;
}
</style>
