<script setup>
import { ref, computed, useId } from 'vue';
import { useRoute } from 'vue-router';
import { Flag, Loader2 } from 'lucide-vue-next';
import BaseModal from '@/components/ui/BaseModal.vue';
import { api } from '@/api';
import { auth } from '@/stores/auth';
import { toast } from '@/stores/toast';
import { REPORT_REASONS, LIMITS } from '@shared/constants.mjs';

// "Report" for a gift, a profile, a character or an event. Opens a short form and sends it
// to the site admins. Hidden when the viewer owns the thing (pass `own`).
const props = defineProps({
  targetType: { type: String, required: true }, // submission | user | character | event
  targetId: { type: String, required: true },
  // How the form refers to it: "this gift", "Mika's profile"...
  what: { type: String, required: true },
  own: { type: Boolean, default: false },
  // 'button' (small ghost button) or 'link' (plain text link for footers)
  look: { type: String, default: 'button' },
});

const route = useRoute();
const uid = useId();
const open = ref(false);
const reason = ref('');
const details = ref('');
const sending = ref(false);
const error = ref('');
const sent = ref(false);

const needsDetails = computed(() => reason.value === 'other');
const canSend = computed(() => reason.value && (!needsDetails.value || details.value.trim()) && !sending.value);

function start() {
  reason.value = '';
  details.value = '';
  error.value = '';
  open.value = true;
}

async function send() {
  if (!canSend.value) return;
  sending.value = true;
  error.value = '';
  try {
    await api('/reports', {
      method: 'POST',
      body: { targetType: props.targetType, targetId: props.targetId, reason: reason.value, details: details.value.trim() },
    });
    sent.value = true;
    open.value = false;
    toast.success("Thanks. The site admins will take a look, and we'll let you know when they have.");
  } catch (e) {
    if (e.code === 'ALREADY_REPORTED') {
      sent.value = true;
      open.value = false;
      toast.info(e.message);
    } else {
      error.value = e.message;
    }
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <template v-if="!own">
    <RouterLink
      v-if="!auth.user"
      :to="{ path: '/login', query: { redirect: route.fullPath } }"
      :class="look === 'link' ? 'report-link' : 'btn btn-ghost btn-sm'"
    >
      <Flag :size="look === 'link' ? 14 : 16" aria-hidden="true" /> Report
    </RouterLink>
    <button
      v-else
      type="button"
      :class="look === 'link' ? 'report-link' : 'btn btn-ghost btn-sm'"
      :disabled="sent"
      :aria-label="sent ? `You reported ${what}` : `Report ${what}`"
      @click="start"
    >
      <Flag :size="look === 'link' ? 14 : 16" aria-hidden="true" /> {{ sent ? 'Reported' : 'Report' }}
    </button>

    <BaseModal :open="open" :title="`Report ${what}`" size="md" @close="open = false">
      <form class="flex flex-col gap-4" @submit.prevent="send">
        <p class="m-0 hint">
          Only the site admins see reports. The person you report isn't told who sent it. If someone is in danger,
          contact the people around you or local services first.
        </p>
        <fieldset class="reasons">
          <legend class="label">What's wrong?</legend>
          <label v-for="r in REPORT_REASONS" :key="r.value" class="reason" :class="{ on: reason === r.value }">
            <input v-model="reason" type="radio" :name="`${uid}-reason`" :value="r.value" />
            <span>{{ r.label }}</span>
          </label>
        </fieldset>
        <div class="field">
          <label class="label" :for="`${uid}-details`">
            Anything the admins should know?{{ needsDetails ? '' : ' (optional)' }}
          </label>
          <div class="input-wrap">
            <textarea
              :id="`${uid}-details`"
              v-model="details"
              class="textarea"
              rows="4"
              :maxlength="LIMITS.reportDetails"
              :required="needsDetails"
              placeholder="For stolen art, a link to the original helps a lot."
            />
          </div>
        </div>
        <p v-if="error" class="alert alert-error m-0" role="alert">{{ error }}</p>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn btn-ghost" @click="open = false">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="!canSend">
            <Loader2 v-if="sending" :size="16" class="spin" aria-hidden="true" /> Send report
          </button>
        </div>
      </form>
    </BaseModal>
  </template>
</template>

<style scoped>
.reasons {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  border: 0;
}
.reasons legend {
  margin-bottom: 6px;
}
.reason {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: 1.5px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  font-weight: 600;
}
.reason.on {
  border-color: var(--pink);
  background: var(--pink-soft);
}
.reason input {
  accent-color: var(--pink);
}
.report-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--muted);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.report-link:hover:not(:disabled) {
  color: var(--danger);
}
.report-link:disabled {
  cursor: default;
  text-decoration: none;
}
</style>
