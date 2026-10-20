<script setup>
import { ref, computed, watch, useId } from 'vue';
import { Send, Loader2 } from 'lucide-vue-next';
import BaseModal from '@/components/ui/BaseModal.vue';
import ChoiceChips from '@/components/ui/ChoiceChips.vue';
import { api } from '@/api';
import { toast } from '@/stores/toast';
import { pluralize } from '@/utils/format';

// "Send a reminder" dialog used on the overview and submissions tabs.
const props = defineProps({
  open: { type: Boolean, default: false },
  eventId: { type: String, required: true },
  // Counts shown next to each audience; null when not loaded
  missingCount: { type: Number, default: null },
  participantCount: { type: Number, default: null },
});
const emit = defineEmits(['close', 'sent']);

// Same cap as the server (REMINDER_MESSAGE_MAX in submission-router.js, the length of a notification message)
const MESSAGE_MAX = 500;

const uid = useId();
const audience = ref('missing_submissions');
const message = ref('');
const sending = ref(false);
const error = ref('');

const withCount = (label, n) => (n === null || n === undefined ? label : `${label} (${n})`);
const options = computed(() => [
  { value: 'missing_submissions', label: withCount('People missing submissions', props.missingCount) },
  { value: 'all_participants', label: withCount('All participants', props.participantCount) },
]);

const nobodyMissing = computed(() => audience.value === 'missing_submissions' && props.missingCount === 0);
const tooLong = computed(() => message.value.trim().length > MESSAGE_MAX);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    audience.value = props.missingCount === 0 ? 'all_participants' : 'missing_submissions';
    message.value = '';
    error.value = '';
  }
);

function close() {
  if (!sending.value) emit('close');
}

async function send() {
  if (tooLong.value || nobodyMissing.value) return;
  error.value = '';
  sending.value = true;
  try {
    const { sent } = await api(`/events/${props.eventId}/reminders`, {
      method: 'POST',
      body: { audience: audience.value, message: message.value.trim() || undefined },
    });
    if (sent > 0) toast.success(`Sent to ${pluralize(sent, 'person', 'people')}.`);
    else toast.info('Nobody needed a reminder.');
    emit('sent', sent);
    emit('close');
  } catch (e) {
    error.value = e.message;
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <BaseModal :open="open" title="Send a reminder" size="md" @close="close">
    <form :id="`${uid}-form`" class="flex flex-col gap-5" @submit.prevent="send">
      <div>
        <p :id="`${uid}-audience`" class="label m-0 mb-2.5">Who should get it?</p>
        <ChoiceChips
          v-model="audience"
          :options="options"
          :multiple="false"
          :disabled-values="missingCount === 0 ? ['missing_submissions'] : []"
          :aria-labelledby="`${uid}-audience`"
        />
        <p v-if="nobodyMissing" class="hint m-0 mt-2">Everyone has submitted, so there is nobody to remind.</p>
      </div>

      <div class="field">
        <div class="field-head">
          <label :for="`${uid}-message`" class="label">Message <span class="text-cocoa font-normal">(optional)</span></label>
          <span class="hint" :class="{ 'text-danger': tooLong }">{{ message.trim().length }}/{{ MESSAGE_MAX }}</span>
        </div>
        <div class="input-wrap" :class="{ 'is-invalid': tooLong }">
          <textarea
            :id="`${uid}-message`"
            v-model="message"
            class="textarea"
            rows="4"
            placeholder="e.g. Halfway there! Post your WIPs in the event channel if you'd like feedback."
          />
        </div>
        <p class="hint m-0">
          Everyone gets an in-app notification with the deadline, plus an email if they have email reminders turned on.
        </p>
      </div>

      <p v-if="error" class="alert alert-error m-0" role="alert">{{ error }}</p>
    </form>

    <template #footer>
      <button type="button" class="btn btn-outline btn-sm" :disabled="sending" @click="close">Cancel</button>
      <button
        type="submit"
        :form="`${uid}-form`"
        class="btn btn-primary btn-sm"
        :disabled="sending || tooLong || nobodyMissing"
      >
        <Loader2 v-if="sending" :size="16" class="spin" aria-hidden="true" />
        <Send v-else :size="16" aria-hidden="true" />
        Send reminder
      </button>
    </template>
  </BaseModal>
</template>
