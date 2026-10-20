<script setup>
import { ref, computed, onMounted, useId } from 'vue';
import { MailPlus, Loader2, Check } from 'lucide-vue-next';
import { api } from '@/api';
import { toast } from '@/stores/toast';
import { pluralize } from '@/utils/format';

// "Invite people back": everyone accepted in one of your earlier exchanges gets an invite
// notification for this one (POST /events/:id/invite-from). Each past exchange only once.
const props = defineProps({
  event: { type: Object, required: true },
});
const emit = defineEmits(['updated']);

const uid = useId();
const past = ref([]);
const choice = ref('');
const sending = ref(false);
const loaded = ref(false);

onMounted(async () => {
  try {
    const { organizing = [] } = await api('/events/mine');
    // Exchanges that got as far as having a group of people
    past.value = organizing.filter(
      (e) => e.id !== props.event.id && ['matching', 'active', 'completed'].includes(e.status) && !e.cancelledAt
    );
  } catch {
    past.value = [];
  } finally {
    loaded.value = true;
  }
});

const invited = computed(() => new Set(props.event.invitedFrom || []));
const options = computed(() => past.value.filter((e) => !invited.value.has(e.id)));
const invitedNames = computed(() => past.value.filter((e) => invited.value.has(e.id)).map((e) => e.name));

async function send() {
  if (!choice.value || sending.value) return;
  sending.value = true;
  try {
    const { sent } = await api(`/events/${props.event.id}/invite-from`, { method: 'POST', body: { fromEventId: choice.value } });
    toast.success(sent ? `Invited ${pluralize(sent, 'person', 'people')}.` : 'Everyone from that exchange is already here.');
    emit('updated', { ...props.event, invitedFrom: [...(props.event.invitedFrom || []), choice.value] });
    choice.value = '';
  } catch (e) {
    toast.error(e.message);
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <section v-if="loaded && (options.length || invitedNames.length)" class="card p-5 sm:p-6" :aria-labelledby="`${uid}-title`">
    <h2 :id="`${uid}-title`" class="title"><MailPlus :size="20" aria-hidden="true" /> Invite people back</h2>
    <p class="hint m-0 mt-1">
      Everyone who took part in one of your earlier exchanges gets a notification with a link to sign up here.
    </p>
    <form v-if="options.length" class="row" @submit.prevent="send">
      <label :for="`${uid}-from`" class="sr-only">Exchange to invite people from</label>
      <div class="input-wrap grow">
        <select :id="`${uid}-from`" v-model="choice" class="select">
          <option value="" disabled>Pick an earlier exchange</option>
          <option v-for="e in options" :key="e.id" :value="e.id">
            {{ e.name }}{{ e.participantCount ? ` (${pluralize(e.participantCount, 'person', 'people')})` : '' }}
          </option>
        </select>
      </div>
      <button type="submit" class="btn btn-primary btn-sm" :disabled="!choice || sending">
        <Loader2 v-if="sending" :size="16" class="spin" aria-hidden="true" />
        <MailPlus v-else :size="16" aria-hidden="true" />
        Send invites
      </button>
    </form>
    <p v-if="invitedNames.length" class="done">
      <Check :size="15" aria-hidden="true" /> Already invited: {{ invitedNames.join(', ') }}
    </p>
  </section>
</template>

<style scoped>
.title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-body);
  font-size: 1.1rem;
  font-weight: 700;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}
.grow {
  flex: 1 1 240px;
  min-width: 0;
  padding: 0 12px;
}
.grow .select {
  padding: 9px 0;
}
.done {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 12px 0 0;
  font-size: 0.9rem;
  color: var(--success);
}
</style>
