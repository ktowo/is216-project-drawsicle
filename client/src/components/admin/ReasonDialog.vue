<script setup>
import { ref, watch } from 'vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';

// A confirm dialog with a reason box. The reason goes into the audit log and,
// for bans and event moderation, is shown to the people affected.
const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  confirmLabel: { type: String, default: 'Confirm' },
  danger: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  required: { type: Boolean, default: true },
  placeholder: { type: String, default: 'Say briefly why. The people affected will see this.' },
});
const emit = defineEmits(['confirm', 'cancel']);

const reason = ref('');
watch(
  () => props.open,
  (open) => {
    if (open) reason.value = '';
  }
);
</script>

<template>
  <ConfirmDialog
    :open="open"
    :title="title"
    :message="message"
    :confirm-label="confirmLabel"
    :danger="danger"
    :loading="loading"
    :confirm-disabled="required && !reason.trim()"
    @confirm="emit('confirm', reason.trim())"
    @cancel="emit('cancel')"
  >
    <div class="field">
      <label class="label" for="admin-reason">Reason{{ required ? '' : ' (optional)' }}</label>
      <div class="input-wrap">
        <textarea
          id="admin-reason"
          v-model="reason"
          class="textarea reason"
          maxlength="500"
          rows="3"
          :placeholder="placeholder"
        />
      </div>
    </div>
  </ConfirmDialog>
</template>

<style scoped>
.reason {
  min-height: 90px;
}
</style>
