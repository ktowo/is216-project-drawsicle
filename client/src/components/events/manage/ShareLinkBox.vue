<script setup>
import { ref, computed, useId } from 'vue';
import { useRouter } from 'vue-router';
import { Copy, Check, RefreshCw, Link2, Lock } from 'lucide-vue-next';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import { api } from '@/api';
import { toast } from '@/stores/toast';
import { absoluteEventUrl, copyText } from '@/utils/events';

// The link organisers share. Private events get the invite link (with ?invite=<code>)
// and a way to replace the code; public events just get the plain event link.
const props = defineProps({
  event: { type: Object, required: true },
});
const emit = defineEmits(['updated']);

const router = useRouter();
const inputId = `share-${useId()}`;
const copied = ref(false);
const confirmOpen = ref(false);
const regenerating = ref(false);
const regenerateError = ref('');

const isPrivate = computed(() => props.event.publicity === 'private');
const url = computed(() =>
  absoluteEventUrl(router, props.event, isPrivate.value ? { invite: props.event.inviteCode } : {})
);
const canRegenerate = computed(() => isPrivate.value && props.event.status !== 'completed');

let copiedTimer = null;
async function copy() {
  const ok = await copyText(url.value);
  if (!ok) {
    toast.error("Couldn't copy the link. Select it and copy it by hand.");
    return;
  }
  copied.value = true;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => (copied.value = false), 2000);
}

function selectAll(e) {
  e.target.select();
}

function askRegenerate() {
  regenerateError.value = '';
  confirmOpen.value = true;
}

async function regenerate() {
  regenerating.value = true;
  regenerateError.value = '';
  try {
    const { inviteCode } = await api(`/events/${props.event.id}/invite/regenerate`, { method: 'POST' });
    emit('updated', { ...props.event, inviteCode });
    confirmOpen.value = false;
    toast.success('New invite link ready. The old one no longer works.');
  } catch (e) {
    regenerateError.value = e.message;
  } finally {
    regenerating.value = false;
  }
}
</script>

<template>
  <section class="card p-5 sm:p-6" :aria-labelledby="`${inputId}-title`">
    <h2 :id="`${inputId}-title`" class="section-title flex items-center gap-2">
      <Lock v-if="isPrivate" :size="20" aria-hidden="true" />
      <Link2 v-else :size="20" aria-hidden="true" />
      {{ isPrivate ? 'Invite link' : 'Share link' }}
    </h2>
    <p class="section-sub text-sm">
      <template v-if="isPrivate">
        This event is private. Only people with this link (and anyone who already signed up) can see it.
      </template>
      <template v-else>This event is public and listed on Browse events. Share the link with your community.</template>
      <template v-if="event.status === 'draft'"> The link starts working once you open sign-ups.</template>
    </p>

    <div class="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
      <label :for="inputId" class="sr-only">{{ isPrivate ? 'Invite link' : 'Event link' }}</label>
      <div class="input-wrap flex-1 min-w-0">
        <input :id="inputId" :value="url" class="input text-sm" readonly @focus="selectAll" />
      </div>
      <div class="flex gap-2">
        <button type="button" class="btn btn-primary btn-sm flex-1 sm:flex-none" @click="copy">
          <Check v-if="copied" :size="16" aria-hidden="true" />
          <Copy v-else :size="16" aria-hidden="true" />
          {{ copied ? 'Copied' : 'Copy link' }}
        </button>
        <button
          v-if="canRegenerate"
          type="button"
          class="btn btn-outline btn-sm flex-1 sm:flex-none"
          @click="askRegenerate"
        >
          <RefreshCw :size="16" aria-hidden="true" /> Regenerate
        </button>
      </div>
    </div>
    <span class="sr-only" aria-live="polite">{{ copied ? 'Link copied to the clipboard' : '' }}</span>

    <ConfirmDialog
      :open="confirmOpen"
      title="Make a new invite link?"
      message="The current link stops working straight away. People who already signed up keep their access, but anyone you sent the old link to will need the new one."
      confirm-label="Regenerate link"
      :loading="regenerating"
      @confirm="regenerate"
      @cancel="confirmOpen = false"
    >
      <p v-if="regenerateError" class="alert alert-error m-0" role="alert">{{ regenerateError }}</p>
    </ConfirmDialog>
  </section>
</template>
