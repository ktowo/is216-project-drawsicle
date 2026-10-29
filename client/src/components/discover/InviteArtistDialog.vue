<script setup>
import { ref, computed, watch, useId } from 'vue';
import { MailPlus, Loader2, Check } from 'lucide-vue-next';
import BaseModal from '@/components/ui/BaseModal.vue';
import { api } from '@/api';
import { toast } from '@/stores/toast';
import { LIMITS } from '@shared/constants.mjs';
import { formatDate } from '@/utils/format';

// "Invite to an event": an organiser picks one of their open events and adds an optional message.
// The artist gets a notification with a link to the event (POST /events/:id/invites).
//   artist: { id, displayName, username }      events: the organiser's events with sign-ups open
const props = defineProps({
  open: { type: Boolean, default: false },
  artist: { type: Object, default: null },
  events: { type: Array, default: () => [] },
  // "eventId:artistId" for invites already sent, so the window starts on an event they haven't been invited to
  invitedPairs: { type: Object, default: () => new Set() },
});
const emit = defineEmits(['close', 'invited']);

const uid = useId();
const eventId = ref('');
const message = ref('');
const sending = ref(false);
const error = ref('');
// Artists already invited to the chosen event, so we can say so instead of failing
const invitedIds = ref(new Set());
const checking = ref(false);

const chosen = computed(() => props.events.find((e) => e.id === eventId.value) || null);
const alreadyInvited = computed(() => Boolean(props.artist && invitedIds.value.has(props.artist.id)));
const name = computed(() => props.artist?.displayName || props.artist?.username || 'this artist');

async function loadInvited() {
  invitedIds.value = new Set();
  if (!eventId.value) return;
  const asked = eventId.value;
  checking.value = true;
  try {
    const { invites = [] } = await api(`/events/${asked}/invites`);
    if (asked === eventId.value) invitedIds.value = new Set(invites.map((i) => i.artist?.id).filter(Boolean));
  } catch {
    // Not essential: the server still says "already invited" if it comes to that
  } finally {
    checking.value = false;
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    message.value = '';
    error.value = '';
    const free = props.events.find((e) => !props.invitedPairs.has(`${e.id}:${props.artist?.id}`));
    eventId.value = (free || props.events[0])?.id || '';
    loadInvited();
  },
  { immediate: true }
);
watch(eventId, loadInvited);

async function send() {
  if (!chosen.value || !props.artist || sending.value || alreadyInvited.value) return;
  error.value = '';
  sending.value = true;
  try {
    await api(`/events/${chosen.value.id}/invites`, {
      method: 'POST',
      body: { artistId: props.artist.id, message: message.value.trim() },
    });
    toast.success(`Invited ${name.value} to ${chosen.value.name}.`);
    emit('invited', { eventId: chosen.value.id, artistId: props.artist.id });
    emit('close');
  } catch (e) {
    // Already invited or already signed up: show it in the window so they can pick another event
    error.value = e.message;
    if (e.code === 'ALREADY_INVITED') invitedIds.value = new Set([...invitedIds.value, props.artist.id]);
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <BaseModal :open="open" :title="`Invite ${name}`" size="sm" @close="emit('close')">
    <form class="invite-form" novalidate @submit.prevent="send">
      <p class="lead">
        They will get a notification with a link to the event. They can sign up if they'd like to, and
        it's no problem if not.
      </p>

      <div class="field">
        <label :for="`${uid}-event`" class="label">Which event?</label>
        <select :id="`${uid}-event`" v-model="eventId" class="select picker">
          <option v-for="e in events" :key="e.id" :value="e.id">{{ e.name }}</option>
        </select>
        <p v-if="chosen" class="hint">Sign-ups close {{ formatDate(chosen.signupDeadline) }}.</p>
      </div>

      <div class="field">
        <label :for="`${uid}-message`" class="label">A message (optional)</label>
        <textarea
          :id="`${uid}-message`"
          v-model="message"
          class="note-input"
          rows="3"
          :maxlength="LIMITS.inviteMessage"
          placeholder="Why would they fit in? (for example, “Your ink art would be perfect for this theme”)"
        />
        <p class="hint count">{{ message.length }} / {{ LIMITS.inviteMessage }}</p>
      </div>

      <p v-if="alreadyInvited" class="done" role="status">
        <Check :size="15" aria-hidden="true" /> You've already invited {{ name }} to this event.
      </p>
      <p v-if="error" class="field-error" role="alert">{{ error }}</p>

      <div class="actions">
        <button type="button" class="btn btn-ghost btn-sm" @click="emit('close')">Cancel</button>
        <button type="submit" class="btn btn-primary btn-sm" :disabled="sending || checking || alreadyInvited || !chosen">
          <Loader2 v-if="sending" :size="16" class="spin" aria-hidden="true" />
          <MailPlus v-else :size="16" aria-hidden="true" />
          Send invite
        </button>
      </div>
    </form>
  </BaseModal>
</template>

<style scoped>
.invite-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.lead {
  margin: 0;
  color: var(--text-soft);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.label {
  font-weight: 700;
}
.picker {
  width: 100%;
}
.hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.88rem;
}
.count {
  align-self: flex-end;
}
.note-input {
  width: 100%;
  padding: 10px 12px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  resize: vertical;
}
.note-input:focus {
  outline: none;
  border-color: var(--pink);
  box-shadow: 0 0 0 3px var(--pink-soft);
}
.done {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--success);
  font-size: 0.92rem;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
