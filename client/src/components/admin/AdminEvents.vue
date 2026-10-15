<script setup>
import { ref, reactive, watch, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import PersonLink from '@/components/events/PersonLink.vue';
import { Search, EyeOff, Eye, CircleSlash, Undo2, Trash2, CalendarHeart, Lock } from 'lucide-vue-next';
import { api, qs } from '@/api';
import { toast } from '@/stores/toast';
import { ALL_EVENT_STATUSES, EVENT_STATUS_LABELS } from '@shared/constants.mjs';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ReasonDialog from './ReasonDialog.vue';
import { formatDate } from '@/utils/format';

const filters = reactive({ q: '', status: '', moderation: '' });
const page = ref(1);
const data = ref(null);
const loading = ref(false);
const error = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    data.value = await api(`/admin/events${qs({ ...filters, page: page.value })}`);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

let searchTimer = null;
watch(() => filters.q, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { page.value = 1; load(); }, 300);
});
watch(() => [filters.status, filters.moderation], () => { page.value = 1; load(); });
watch(page, load);
onMounted(load);

const DIALOGS = {
  disable: (e) => ({ title: `Disable ${e.name}?`, message: 'It disappears for everyone except its organisers, and nothing in it can change until you turn it back on.', confirmLabel: 'Disable event', danger: true, required: true }),
  enable: (e) => ({ title: `Turn ${e.name} back on?`, message: 'Everyone who could see it before can see it again.', confirmLabel: 'Turn back on', required: false }),
  cancel: (e) => ({ title: `Cancel ${e.name}?`, message: 'The event page stays up with a cancelled notice and your reason. Organisers and participants are told, and nothing more can happen in it.', confirmLabel: 'Cancel event', danger: true, required: true }),
  restore: (e) => ({ title: `Restore ${e.name}?`, message: 'It goes back to the stage it was at when it was cancelled.', confirmLabel: 'Restore', required: false }),
  delete: (e) => ({ title: `Delete ${e.name}?`, message: "This removes the event with all its sign-ups, matches and gifts. It can't be undone.", confirmLabel: 'Delete event', danger: true, required: false }),
};

const pending = ref(null);
const working = ref(false);

function ask(kind, event) {
  pending.value = { kind, event, ...DIALOGS[kind](event) };
}

const DONE = {
  disable: 'Event disabled.',
  enable: 'Event is visible again.',
  cancel: 'Event cancelled.',
  restore: 'Event restored.',
  delete: 'Event deleted.',
};

async function run(reason) {
  const { kind, event } = pending.value;
  working.value = true;
  try {
    const base = `/admin/events/${event.id}`;
    if (kind === 'delete') await api(base, { method: 'DELETE', body: { reason } });
    else await api(`${base}/${kind}`, { method: 'POST', body: { reason } });
    toast.success(DONE[kind]);
    pending.value = null;
    await load();
  } catch (e) {
    toast.error(e.message);
  } finally {
    working.value = false;
  }
}
</script>

<template>
  <div class="grid gap-5">
    <div class="filters card">
      <label class="input-wrap grow">
        <Search :size="18" class="input-icon" aria-hidden="true" />
        <input v-model="filters.q" class="input" type="search" placeholder="Search events by name or theme" aria-label="Search events" />
      </label>
      <select v-model="filters.status" class="select" aria-label="Status">
        <option value="">Any status</option>
        <option v-for="s in ALL_EVENT_STATUSES" :key="s" :value="s">{{ EVENT_STATUS_LABELS[s] }}</option>
      </select>
      <select v-model="filters.moderation" class="select" aria-label="Visibility">
        <option value="">Disabled or not</option>
        <option value="disabled">Disabled only</option>
        <option value="none">Not disabled</option>
      </select>
    </div>

    <ErrorBlock v-if="error" :message="error" @retry="load" />
    <LoadingBlock v-else-if="!data" label="Loading events…" />
    <EmptyState v-else-if="!data.events.length" :icon="CalendarHeart" title="No events match" message="Try a different search or filter." />
    <template v-else>
      <p class="hint" aria-live="polite">{{ data.total }} event{{ data.total === 1 ? '' : 's' }}, including drafts and private ones</p>
      <ul class="rows" :class="{ dim: loading }">
        <li v-for="e in data.events" :key="e.id" class="card row">
          <div class="min-w-0 info">
            <div class="flex items-center gap-2 flex-wrap">
              <RouterLink :to="`/events/${e.id}`" class="font-semibold">{{ e.name }}</RouterLink>
              <StatusBadge :status="e.status" />
              <span v-if="e.disabled" class="chip chip-danger"><EyeOff :size="13" aria-hidden="true" /> Disabled</span>
              <span v-if="e.publicity === 'private'" class="chip"><Lock :size="13" aria-hidden="true" /> Private</span>
            </div>
            <div class="hint">
              by <PersonLink :user="e.createdBy" :size="0" fallback="Unknown" class="creator" /> · created {{ formatDate(e.createdAt) }}
              · {{ e.participantCount }} / {{ e.maxParticipants }} artists
            </div>
            <div v-if="e.disabled && e.disabledReason" class="note">Disabled: {{ e.disabledReason }}</div>
            <div v-if="e.status === 'cancelled' && e.cancelReason" class="note">Cancelled: {{ e.cancelReason }}</div>
          </div>
          <div class="actions">
            <button v-if="e.disabled" class="btn btn-outline btn-sm" @click="ask('enable', e)"><Eye :size="16" aria-hidden="true" /> Turn back on</button>
            <button v-else class="btn btn-outline btn-sm danger" @click="ask('disable', e)"><EyeOff :size="16" aria-hidden="true" /> Disable</button>
            <button v-if="e.status === 'cancelled'" class="btn btn-outline btn-sm" @click="ask('restore', e)"><Undo2 :size="16" aria-hidden="true" /> Restore</button>
            <button v-else class="btn btn-outline btn-sm danger" @click="ask('cancel', e)"><CircleSlash :size="16" aria-hidden="true" /> Cancel</button>
            <button class="btn btn-ghost btn-sm danger" @click="ask('delete', e)"><Trash2 :size="16" aria-hidden="true" /> Delete</button>
          </div>
        </li>
      </ul>
      <nav v-if="data.pages > 1" class="pager" aria-label="Pages">
        <button class="btn btn-outline btn-sm" :disabled="page <= 1" @click="page--">Previous</button>
        <span class="hint">Page {{ data.page }} of {{ data.pages }}</span>
        <button class="btn btn-outline btn-sm" :disabled="page >= data.pages" @click="page++">Next</button>
      </nav>
    </template>

    <ReasonDialog
      v-if="pending"
      :open="true"
      :title="pending.title"
      :message="pending.message"
      :confirm-label="pending.confirmLabel"
      :danger="pending.danger"
      :required="pending.required"
      :loading="working"
      @confirm="run"
      @cancel="pending = null"
    />
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 14px;
}
.grow {
  flex: 1 1 260px;
}
.select {
  font: inherit;
  color: var(--text);
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 12px;
}
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
  transition: opacity 0.15s;
}
.rows.dim {
  opacity: 0.6;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
}
.info {
  flex: 1 1 320px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.danger {
  color: var(--danger);
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  background: var(--chip);
  color: var(--muted);
}
.chip-danger {
  background: var(--danger-soft);
  color: var(--danger);
}
.note {
  margin-top: 4px;
  font-size: 0.85rem;
  color: var(--danger);
}
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
</style>
