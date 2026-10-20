<script setup>
import { ref } from 'vue';
import { MailCheck } from 'lucide-vue-next';
import { resendConfirmation } from '@/auth/supabaseSignIn';
import { toast } from '@/stores/toast';

// "Check your email" with a way to get the confirmation link again (Supabase sign-in: an email
// address must be confirmed before the first log-in).
//   <ConfirmEmailNotice v-if="confirmEmail" :email="confirmEmail" />
const props = defineProps({
  email: { type: String, required: true },
});

const sending = ref(false);
async function resend() {
  if (sending.value) return;
  sending.value = true;
  try {
    await resendConfirmation(props.email);
    toast.success(`Sent again to ${props.email}.`);
  } catch (err) {
    toast.error(err.message);
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <div class="confirm-notice" role="status">
    <MailCheck :size="20" aria-hidden="true" />
    <div>
      <p><strong>Check your email.</strong> We sent a link to {{ email }} to confirm it's yours.</p>
      <button type="button" class="btn btn-ghost btn-sm" :disabled="sending" @click="resend">Send it again</button>
    </div>
  </div>
</template>

<style scoped>
.confirm-notice {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--pink-soft);
  color: var(--text);
}
.confirm-notice p {
  margin: 0 0 6px;
}
</style>
