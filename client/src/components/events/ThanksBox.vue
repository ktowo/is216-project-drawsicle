<script setup>
import { ref, computed, watch, useId } from 'vue';
import { Heart, Loader2, Pencil, Trash2 } from 'lucide-vue-next';
import { api } from '@/api';
import { toast } from '@/stores/toast';
import { REACTIONS, LIMITS } from '@shared/constants.mjs';
import { formatDate } from '@/utils/format';

// After the reveal: thank the person who made your gift (a reaction, a note or both).
// mine: the viewer received this gift and can write; otherwise it just shows their thanks.
const props = defineProps({
  eventId: { type: String, required: true },
  submission: { type: Object, required: true },
  name: { type: String, default: 'them' }, // the giver when it's mine, the recipient otherwise
  mine: { type: Boolean, default: false },
});
const emit = defineEmits(['saved']);

const uid = useId();
const thanks = computed(() => props.submission.thanks || null);
const editing = ref(false);
const reaction = ref('');
const message = ref('');
const saving = ref(false);
const error = ref('');

const reactionOf = (value) => REACTIONS.find((r) => r.value === value) || null;

function startEdit() {
  reaction.value = thanks.value?.reaction || '';
  message.value = thanks.value?.message || '';
  error.value = '';
  editing.value = true;
}
watch(
  () => props.submission.id,
  () => {
    editing.value = props.mine && !thanks.value;
    reaction.value = '';
    message.value = '';
  },
  { immediate: true }
);

async function save() {
  error.value = '';
  if (!reaction.value && !message.value.trim()) {
    error.value = 'Pick a reaction or write a few words.';
    return;
  }
  saving.value = true;
  try {
    const { submission } = await api(`/events/${props.eventId}/thanks`, {
      method: 'PUT',
      body: { reaction: reaction.value, message: message.value.trim() },
    });
    editing.value = false;
    emit('saved', submission);
    toast.success(`${props.name} will see your thanks.`);
  } catch (e) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}

async function remove() {
  saving.value = true;
  try {
    const { submission } = await api(`/events/${props.eventId}/thanks`, { method: 'DELETE' });
    emit('saved', submission);
    editing.value = true;
  } catch (e) {
    toast.error(e.message);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="thanks">
    <!-- Showing thanks someone wrote -->
    <div v-if="thanks && !editing" class="note">
      <p class="note-head">
        <span v-if="reactionOf(thanks.reaction)" class="emoji" aria-hidden="true">{{ reactionOf(thanks.reaction).emoji }}</span>
        <span>
          <strong>{{ mine ? 'You said thanks' : `${name} says thanks` }}</strong>
          <span v-if="reactionOf(thanks.reaction)" class="muted">: {{ reactionOf(thanks.reaction).label }}</span>
          <span class="muted date"> · {{ formatDate(thanks.at) }}</span>
        </span>
      </p>
      <p v-if="thanks.message" class="note-text">{{ thanks.message }}</p>
      <div v-if="mine" class="note-actions">
        <button type="button" class="btn btn-ghost btn-xs" :disabled="saving" @click="startEdit">
          <Pencil :size="14" aria-hidden="true" /> Edit
        </button>
        <button type="button" class="btn btn-ghost btn-xs btn-danger-text" :disabled="saving" @click="remove">
          <Trash2 :size="14" aria-hidden="true" /> Remove
        </button>
      </div>
    </div>

    <!-- Writing thanks for my gift -->
    <form v-else-if="mine" class="form" novalidate @submit.prevent="save">
      <p :id="`${uid}-label`" class="form-title"><Heart :size="16" aria-hidden="true" /> Say thanks to {{ name }}</p>
      <div class="reactions" role="radiogroup" :aria-labelledby="`${uid}-label`">
        <button
          v-for="r in REACTIONS"
          :key="r.value"
          type="button"
          role="radio"
          class="reaction"
          data-sfx="heart"
          :class="{ on: reaction === r.value }"
          :aria-checked="reaction === r.value ? 'true' : 'false'"
          :title="r.label"
          @click="reaction = reaction === r.value ? '' : r.value"
        >
          <span aria-hidden="true">{{ r.emoji }}</span>
          <span class="sr-only">{{ r.label }}</span>
        </button>
      </div>
      <label :for="`${uid}-message`" class="sr-only">Your note</label>
      <textarea
        :id="`${uid}-message`"
        v-model="message"
        class="note-input"
        rows="3"
        :maxlength="LIMITS.thanksMessage"
        :placeholder="`What did you love about it? ${name} gets a notification.`"
      />
      <p v-if="error" class="field-error" role="alert">{{ error }}</p>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-sm" :disabled="saving">
          <Loader2 v-if="saving" :size="16" class="spin" aria-hidden="true" />
          {{ thanks ? 'Save' : 'Send thanks' }}
        </button>
        <button v-if="thanks" type="button" class="btn btn-ghost btn-sm" @click="editing = false">Cancel</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.thanks {
  border-top: 1px dashed var(--border);
  padding-top: 14px;
}
.note-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 0;
}
.emoji {
  font-size: 1.5rem;
  line-height: 1;
}
.muted {
  color: var(--muted);
}
.date {
  font-size: 0.85rem;
}
.note-text {
  margin: 8px 0 0;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.note-actions {
  display: flex;
  gap: 4px;
  margin-top: 6px;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.form-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-weight: 700;
  color: var(--pink-dark);
}
.reactions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.reaction {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  border: 1.5px solid var(--border);
  background: var(--surface);
  font-size: 1.3rem;
  cursor: pointer;
  transition: transform 0.1s;
}
.reaction:hover {
  border-color: var(--pink-line);
}
.reaction.on {
  border-color: var(--pink);
  background: var(--pink-soft);
  transform: scale(1.08);
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
.form-actions {
  display: flex;
  gap: 8px;
}
@media (prefers-reduced-motion: reduce) {
  .reaction {
    transition: none;
  }
}
</style>
