<script setup>
import { ref, watch } from 'vue';
import { LifeBuoy, Loader2, Undo2 } from 'lucide-vue-next';
import BaseModal from '@/components/ui/BaseModal.vue';
import PersonLink from '@/components/events/PersonLink.vue';
import { api } from '@/api';
import { toast } from '@/stores/toast';
import { pluralize } from '@/utils/format';
import { personName } from './helpers';

// Hand a gift whose artist dropped out to a volunteer ("I can be a backup" at sign-up).
// row: a submissions row { match: MatchAdmin, submission }
const props = defineProps({
  open: { type: Boolean, default: false },
  eventId: { type: String, required: true },
  row: { type: Object, default: null },
});
const emit = defineEmits(['close', 'changed']);

const volunteers = ref([]);
const loading = ref(false);
const error = ref('');
const busyId = ref('');

watch(
  () => [props.open, props.row?.match?.id],
  async ([open]) => {
    if (!open || !props.row) return;
    loading.value = true;
    error.value = '';
    try {
      volunteers.value = (await api(`/events/${props.eventId}/backups/volunteers/${props.row.match.id}`)).volunteers || [];
    } catch (e) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }
);

async function assign(person) {
  busyId.value = person.user.id;
  try {
    const { matches } = await api(`/events/${props.eventId}/matches/${props.row.match.id}/backup`, {
      method: 'PUT',
      body: { userId: person.user.id },
    });
    toast.success(`${person.user.displayName} is making this gift now. Both artists have been told.`);
    emit('changed', matches);
    emit('close');
  } catch (e) {
    toast.error(e.message);
  } finally {
    busyId.value = '';
  }
}

async function handBack() {
  busyId.value = 'back';
  try {
    const { matches } = await api(`/events/${props.eventId}/matches/${props.row.match.id}/backup`, { method: 'DELETE' });
    toast.success('The gift is back with the original artist.');
    emit('changed', matches);
    emit('close');
  } catch (e) {
    toast.error(e.message);
  } finally {
    busyId.value = '';
  }
}
</script>

<template>
  <BaseModal :open="open && Boolean(row)" title="Find a backup artist" size="md" @close="emit('close')">
    <div v-if="row" class="flex flex-col gap-4">
      <p class="m-0">
        The gift from <strong>{{ personName(row.match.giver) }}</strong> for
        <strong>{{ personName(row.match.recipient) }}</strong> hasn't arrived. Pick a volunteer to make it instead. They'll
        see the recipient's wishes and characters, and {{ personName(row.match.giver) }} is told they no longer need to.
      </p>

      <div v-if="row.match.backupGiver" class="current">
        <p class="m-0">
          <LifeBuoy :size="16" aria-hidden="true" /> {{ personName(row.match.backupGiver) }} is making it at the moment.
        </p>
        <button type="button" class="btn btn-ghost btn-xs" :disabled="Boolean(busyId)" @click="handBack">
          <Undo2 :size="14" aria-hidden="true" /> Hand it back to {{ personName(row.match.giver) }}
        </button>
      </div>

      <p v-if="loading" class="hint m-0">Loading volunteers…</p>
      <p v-else-if="error" class="alert alert-error m-0" role="alert">{{ error }}</p>
      <p v-else-if="!volunteers.length" class="hint m-0">
        Nobody in this event volunteered as a backup. You could ask in your community, then have them sign up next time
        with "I can be a backup artist" ticked.
      </p>
      <ul v-else class="list">
        <li v-for="v in volunteers" :key="v.user.id" class="item">
          <div class="min-w-0">
            <PersonLink :user="v.user" :size="32" show-handle />
            <p class="meta">
              {{ v.submittedOwn ? 'Already sent their own gift' : 'Still making their own gift' }}
              <template v-if="v.backingUp"> · already making {{ pluralize(v.backingUp, 'backup gift') }}</template>
            </p>
          </div>
          <button
            type="button"
            class="btn btn-outline btn-xs"
            :disabled="Boolean(busyId) || row.match.backupGiver?.id === v.user.id"
            @click="assign(v)"
          >
            <Loader2 v-if="busyId === v.user.id" :size="14" class="spin" aria-hidden="true" />
            {{ row.match.backupGiver?.id === v.user.id ? 'Making it' : 'Ask them' }}
          </button>
        </li>
      </ul>
    </div>
  </BaseModal>
</template>

<style scoped>
.current {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--info-soft);
  color: var(--info);
  font-weight: 600;
}
.current p {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 0;
  border-top: 1px solid var(--border);
}
.item:first-child {
  border-top: 0;
}
.meta {
  margin: 2px 0 0 40px;
  font-size: 0.82rem;
  color: var(--muted);
}
</style>
