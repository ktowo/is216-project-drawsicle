<script setup>
import { computed, ref, onMounted } from 'vue';
import { usingSupabase, startProviderSignIn } from '@/auth/supabaseSignIn';
import { toast } from '@/stores/toast';

// Full page navigation: the server redirects to Discord and back (same as GoogleButton).
const props = defineProps({
  label: { type: String, default: 'Continue with Discord' },
  redirect: { type: String, default: '' },
});

const href = computed(() => {
  const base = `${(import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')}/auth/discord`;
  const safe = props.redirect.startsWith('/') && !props.redirect.startsWith('//');
  return safe ? `${base}?redirect=${encodeURIComponent(props.redirect)}` : base;
});

// With Supabase sign-in (AUTH_PROVIDER=supabase) the button starts Supabase's redirect instead
const viaSupabase = ref(false);
onMounted(async () => {
  viaSupabase.value = await usingSupabase();
});
async function onClick(e) {
  if (!viaSupabase.value) return;
  e.preventDefault();
  const safe = props.redirect.startsWith('/') && !props.redirect.startsWith('//');
  try {
    await startProviderSignIn('discord', safe ? props.redirect : '');
  } catch (err) {
    toast.error(err.message);
  }
}
</script>

<template>
  <a class="btn btn-outline btn-block provider-btn" :href="href" @click="onClick">
    <svg width="22" height="22" viewBox="0 0 127.14 96.36" aria-hidden="true">
      <path
        fill="#5865F2"
        d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z"
      />
    </svg>
    <span>{{ label }}</span>
  </a>
</template>

<style scoped>
.provider-btn {
  gap: 16px;
  font-weight: 500;
  font-size: 1.05rem;
  padding: 15px 22px;
}
</style>
