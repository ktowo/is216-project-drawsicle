<script setup>
import { Loader2 } from 'lucide-vue-next';
import BaseModal from './BaseModal.vue';

// "Are you sure?" dialog. The parent closes it (sets open to false) after confirm/cancel.
const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: 'Are you sure?' },
  message: { type: String, default: '' },
  confirmLabel: { type: String, default: 'Confirm' },
  cancelLabel: { type: String, default: 'Cancel' },
  danger: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
});
const emit = defineEmits(['confirm', 'cancel']);

function cancel() {
  // Don't let Esc or a backdrop click hide a request that is still running
  if (!props.loading) emit('cancel');
}
</script>

<template>
  <BaseModal :open="open" :title="title" size="sm" @close="cancel">
    <p v-if="message" class="message">{{ message }}</p>
    <div v-if="$slots.default" class="extra" :class="{ spaced: message }">
      <slot />
    </div>

    <template #footer>
      <button type="button" class="btn btn-outline btn-sm" :disabled="loading" @click="cancel">
        {{ cancelLabel }}
      </button>
      <button
        type="button"
        class="btn btn-sm"
        :class="danger ? 'btn-danger' : 'btn-primary'"
        :disabled="loading"
        @click="emit('confirm')"
      >
        <Loader2 v-if="loading" :size="16" class="spin" aria-hidden="true" />
        {{ confirmLabel }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.message {
  margin: 0;
  color: var(--text);
  line-height: 1.6;
}
.extra.spaced {
  margin-top: 16px;
}
</style>
