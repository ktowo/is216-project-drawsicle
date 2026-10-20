<script setup>
import { ref, computed, watch, useId } from 'vue';
import { useRouter } from 'vue-router';
import { Copy, Loader2 } from 'lucide-vue-next';
import BaseModal from '@/components/ui/BaseModal.vue';
import { api } from '@/api';
import { toast } from '@/stores/toast';
import { toLocalInput, fromLocalInput } from '@/utils/format';
import { LIMITS } from '@shared/constants.mjs';

// "Duplicate event": a new draft with this event's settings, rules, tags and banner, but none of
// its people, matches or gifts (POST /events/:id/duplicate). Opens the copy's edit page after.
const props = defineProps({
  open: { type: Boolean, default: false },
  event: { type: Object, required: true },
});
const emit = defineEmits(['close']);

const router = useRouter();
const uid = useId();
const DAY = 24 * 60 * 60 * 1000;
const DEFAULT_SIGNUP_DAYS = 14; // same default as the server

const name = ref('');
const signup = ref('');
const submission = ref('');
const errors = ref({});
const error = ref('');
const saving = ref(false);

// Time people get to make their gift in the original, kept for the copy
const gapMs = computed(() => {
  const gap = new Date(props.event.submissionDeadline) - new Date(props.event.signupDeadline);
  return Number.isFinite(gap) && gap > 0 ? gap : 21 * DAY;
});

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    name.value = `Copy of ${props.event.name}`.slice(0, LIMITS.eventName);
    // Same time of day as the original's sign-up deadline, two weeks out
    const start = new Date(Date.now() + DEFAULT_SIGNUP_DAYS * DAY);
    const original = new Date(props.event.signupDeadline);
    if (!Number.isNaN(original.getTime())) start.setHours(original.getHours(), original.getMinutes(), 0, 0);
    signup.value = toLocalInput(start);
    submission.value = toLocalInput(new Date(start.getTime() + gapMs.value));
    errors.value = {};
    error.value = '';
  }
);

// Moving the sign-up date moves the gift deadline with it, like the original's spacing
function onSignupChange() {
  const start = new Date(signup.value);
  if (!Number.isNaN(start.getTime())) submission.value = toLocalInput(new Date(start.getTime() + gapMs.value));
}

function validate() {
  const found = {};
  const trimmed = name.value.trim();
  if (!trimmed) found.name = 'Give the new event a name.';
  else if (trimmed.length > LIMITS.eventName) found.name = `Keep it under ${LIMITS.eventName} characters.`;
  const start = fromLocalInput(signup.value);
  const end = fromLocalInput(submission.value);
  if (!start) found.signup = 'Pick when sign-ups close.';
  else if (new Date(start) <= new Date()) found.signup = 'Sign-ups need to close in the future.';
  if (!end) found.submission = 'Pick when gifts are due.';
  else if (start && new Date(end) <= new Date(start)) found.submission = 'Gifts are due after sign-ups close.';
  return found;
}

function close() {
  if (!saving.value) emit('close');
}

async function duplicate() {
  error.value = '';
  errors.value = validate();
  const first = Object.keys(errors.value)[0];
  if (first) {
    document.getElementById(`${uid}-${first}`)?.focus();
    return;
  }
  saving.value = true;
  try {
    const { event: copy } = await api(`/events/${props.event.id}/duplicate`, {
      method: 'POST',
      body: {
        name: name.value.trim(),
        signupDeadline: fromLocalInput(signup.value),
        submissionDeadline: fromLocalInput(submission.value),
      },
    });
    toast.success(`${copy.name} is ready as a draft. Check the details, then open sign-ups.`);
    emit('close');
    router.push(`/events/${copy.id}/edit`);
  } catch (e) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <BaseModal :open="open" title="Duplicate event" size="md" @close="close">
    <form :id="`${uid}-form`" class="flex flex-col gap-5" novalidate @submit.prevent="duplicate">
      <p class="hint m-0">
        Starts a new draft with the same description, rules, tags, banner and settings. Nobody from this event is
        carried over, so you can run it again with a fresh group.
      </p>

      <div class="field">
        <label :for="`${uid}-name`" class="label">Name</label>
        <div class="input-wrap" :class="{ 'is-invalid': errors.name }">
          <input
            :id="`${uid}-name`"
            v-model="name"
            class="input"
            :maxlength="LIMITS.eventName"
            :aria-invalid="errors.name ? 'true' : undefined"
            :aria-describedby="errors.name ? `${uid}-name-error` : undefined"
          />
        </div>
        <p v-if="errors.name" :id="`${uid}-name-error`" class="field-error">{{ errors.name }}</p>
      </div>

      <div class="dates">
        <div class="field">
          <label :for="`${uid}-signup`" class="label">Sign-ups close</label>
          <div class="input-wrap" :class="{ 'is-invalid': errors.signup }">
            <input
              :id="`${uid}-signup`"
              v-model="signup"
              class="input"
              type="datetime-local"
              :aria-invalid="errors.signup ? 'true' : undefined"
              :aria-describedby="errors.signup ? `${uid}-signup-error` : undefined"
              @change="onSignupChange"
            />
          </div>
          <p v-if="errors.signup" :id="`${uid}-signup-error`" class="field-error">{{ errors.signup }}</p>
        </div>
        <div class="field">
          <label :for="`${uid}-submission`" class="label">Gifts due</label>
          <div class="input-wrap" :class="{ 'is-invalid': errors.submission }">
            <input
              :id="`${uid}-submission`"
              v-model="submission"
              class="input"
              type="datetime-local"
              :aria-invalid="errors.submission ? 'true' : undefined"
              :aria-describedby="errors.submission ? `${uid}-submission-error` : undefined"
            />
          </div>
          <p v-if="errors.submission" :id="`${uid}-submission-error`" class="field-error">{{ errors.submission }}</p>
        </div>
      </div>
      <p class="hint m-0">You can change everything else on the next page before anyone sees it.</p>

      <p v-if="error" class="alert alert-error m-0" role="alert">{{ error }}</p>
    </form>

    <template #footer>
      <button type="button" class="btn btn-outline btn-sm" :disabled="saving" @click="close">Cancel</button>
      <button type="submit" :form="`${uid}-form`" class="btn btn-primary btn-sm" :disabled="saving">
        <Loader2 v-if="saving" :size="16" class="spin" aria-hidden="true" />
        <Copy v-else :size="16" aria-hidden="true" />
        Make a copy
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.dates {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.dates .field + .field {
  margin-top: 0;
}
@media (max-width: 560px) {
  .dates {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
