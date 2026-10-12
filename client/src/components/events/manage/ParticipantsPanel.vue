<script setup>
import { ref, reactive, computed, watch, useId } from 'vue';
import { Check, X, UserMinus, Download, Search, Users, Eye } from 'lucide-vue-next';
import TabNav from '@/components/ui/TabNav.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import UserAvatar from '@/components/UserAvatar.vue';
import ApplicationDetailsModal from './ApplicationDetailsModal.vue';
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS } from '@shared/constants.mjs';
import { api } from '@/api';
import { toast } from '@/stores/toast';
import { formatDate, formatDateTime, pluralize } from '@/utils/format';
import {
  REVIEW_STATUSES,
  typeList,
  personName,
  downloadCsv,
  fileSlug,
  APPLICATION_CSV_HEADER,
  applicationCsvRow,
} from './helpers';

const props = defineProps({
  event: { type: Object, required: true },
});
// reload: the accepted count changed, so the page should refresh the event
const emit = defineEmits(['reload']);

const uid = useId();
const applications = ref([]);
const counts = ref({ pending: 0, accepted: 0, rejected: 0, withdrawn: 0 });
const loading = ref(true);
const error = ref('');
const filter = ref('all');
const search = ref('');
const busyId = ref(null);
const selectedId = ref(null);
let firstLoad = true;

const canReview = computed(() => REVIEW_STATUSES.includes(props.event.status));

let loadToken = 0;
async function load() {
  const token = ++loadToken;
  loading.value = true;
  error.value = '';
  try {
    const data = await api(`/events/${props.event.id}/applications`);
    if (token !== loadToken) return;
    applications.value = [...(data.applications || [])].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    counts.value = { pending: 0, accepted: 0, rejected: 0, withdrawn: 0, ...(data.counts || {}) };
    // Open on the review queue when there is one
    if (firstLoad && counts.value.pending > 0 && canReview.value) filter.value = 'pending';
    firstLoad = false;
  } catch (e) {
    if (token === loadToken) error.value = e.message;
  } finally {
    if (token === loadToken) loading.value = false;
  }
}

watch(() => [props.event.id, props.event.status], load, { immediate: true });

const total = computed(() => APPLICATION_STATUSES.reduce((sum, s) => sum + (counts.value[s] || 0), 0));
const tabs = computed(() => [
  { key: 'all', label: 'All', count: total.value },
  { key: 'pending', label: 'Pending', count: counts.value.pending },
  { key: 'accepted', label: 'Accepted', count: counts.value.accepted },
  { key: 'rejected', label: 'Rejected', count: counts.value.rejected },
  { key: 'withdrawn', label: 'Withdrawn', count: counts.value.withdrawn },
]);

const visible = computed(() => {
  const q = search.value.trim().toLowerCase();
  return applications.value.filter((app) => {
    if (filter.value !== 'all' && app.status !== filter.value) return false;
    if (!q) return true;
    return [app.user?.displayName, app.user?.username, app.communityUsername]
      .filter(Boolean)
      .some((text) => text.toLowerCase().includes(q));
  });
});

const selected = computed(() => applications.value.find((a) => a.id === selectedId.value) || null);

function characterCount(app) {
  return Array.isArray(app.offeredCharacters) ? app.offeredCharacters.length : (app.offeredCharacterIds || []).length;
}

// ---- Accept / reject / remove ----
const confirm = reactive({ open: false, app: null, loading: false, error: '' });

const confirmText = computed(() => {
  const app = confirm.app;
  if (!app) return { title: '', message: '', label: '' };
  const name = personName(app.user);
  if (app.status === 'accepted') {
    return {
      title: `Remove ${name}?`,
      message: `${name} loses their place in this event and is told their sign-up is no longer accepted. They can't sign up again.`,
      label: 'Remove',
      note:
        props.event.status === 'matching'
          ? 'Any draft matches will be cleared, so you will need to generate them again.'
          : '',
    };
  }
  return {
    title: `Reject ${name}'s sign-up?`,
    message: `${name} is told their sign-up wasn't accepted, and they can't sign up again for this event.`,
    label: 'Reject',
    note: '',
  };
});

function review(app, status) {
  if (status === 'accepted') {
    setStatus(app, 'accepted');
    return;
  }
  confirm.app = app;
  confirm.error = '';
  confirm.open = true;
}

// Rejecting from the details modal closes it first, so only one dialog is open at a time
function reviewFromDetails(status) {
  const app = selected.value;
  if (!app) return;
  if (status !== 'accepted') selectedId.value = null;
  review(app, status);
}

async function confirmReject() {
  confirm.loading = true;
  confirm.error = '';
  const ok = await setStatus(confirm.app, 'rejected', (msg) => (confirm.error = msg));
  confirm.loading = false;
  if (ok) confirm.open = false;
}

async function setStatus(app, status, onError) {
  const name = personName(app.user);
  const previous = app.status;
  busyId.value = app.id;
  try {
    const res = await api(`/events/${props.event.id}/applications/${app.id}`, {
      method: 'PATCH',
      body: { status },
    });
    const updated = res.application || { ...app, status };
    applications.value = applications.value.map((a) =>
      a.id === app.id
        ? {
            ...a,
            ...updated,
            user: updated.user || a.user,
            offeredCharacters: updated.offeredCharacters || a.offeredCharacters,
          }
        : a
    );
    if (previous !== updated.status) {
      counts.value = {
        ...counts.value,
        [previous]: Math.max(0, (counts.value[previous] || 0) - 1),
        [updated.status]: (counts.value[updated.status] || 0) + 1,
      };
    }
    if (status === 'accepted') toast.success(`${name} is in!`);
    else if (previous === 'accepted') toast.success(`${name} was removed from the event.`);
    else toast.success(`${name}'s sign-up was rejected.`);
    if (res.matchesCleared) {
      toast.info('Draft matches were cleared because the participant list changed. Generate them again on the Matching tab.', {
        duration: 7000,
      });
    }
    emit('reload');
    return true;
  } catch (e) {
    if (onError) onError(e.message);
    else toast.error(e.message);
    return false;
  } finally {
    busyId.value = null;
  }
}

// ---- Export ----
function exportCsv() {
  const rows = [APPLICATION_CSV_HEADER, ...visible.value.map((a) => applicationCsvRow(a, APPLICATION_STATUS_LABELS))];
  const suffix = filter.value === 'all' ? 'sign-ups' : `${filter.value}-sign-ups`;
  downloadCsv(`${fileSlug(props.event.name)}-${suffix}.csv`, rows);
  toast.success(`Exported ${pluralize(visible.value.length, 'sign-up')}.`);
}
</script>

<template>
  <section class="flex flex-col gap-4" :aria-labelledby="`${uid}-title`">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 :id="`${uid}-title`" class="section-title">Sign-ups</h2>
        <p class="section-sub text-sm">
          <template v-if="canReview && event.requireApproval">New sign-ups wait here until you accept them.</template>
          <template v-else-if="canReview">Everyone who signs up is accepted straight away. You can still remove people.</template>
          <template v-else-if="event.status === 'draft'">Sign-ups appear here once you open them.</template>
          <template v-else>The participant list is locked now that matches are published.</template>
        </p>
      </div>
      <button
        type="button"
        class="btn btn-outline btn-sm"
        :disabled="loading || !visible.length"
        title="Download the sign-ups shown below as a spreadsheet"
        @click="exportCsv"
      >
        <Download :size="16" aria-hidden="true" /> Export CSV
      </button>
    </div>

    <LoadingBlock v-if="loading && !applications.length" label="Loading sign-ups…" />
    <ErrorBlock v-else-if="error" :message="error" @retry="load" />

    <EmptyState
      v-else-if="!total"
      :icon="Users"
      title="No sign-ups yet"
      :message="
        event.status === 'draft'
          ? 'Open sign-ups from the Overview tab, then share the link with your community.'
          : 'Share the event link with your community. New sign-ups will show up here.'
      "
    />

    <template v-else>
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <TabNav v-model="filter" :tabs="tabs" class="min-w-0" />
        <div class="input-wrap search md:w-72">
          <Search :size="16" class="input-icon" aria-hidden="true" />
          <label :for="`${uid}-search`" class="sr-only">Search sign-ups</label>
          <input
            :id="`${uid}-search`"
            v-model="search"
            type="search"
            class="input"
            placeholder="Search by name or username"
          />
        </div>
      </div>

      <p v-if="!visible.length" class="card p-6 text-center text-cocoa m-0">
        {{ search ? 'Nobody matches that search.' : `No ${filter === 'all' ? '' : filter + ' '}sign-ups.` }}
      </p>

      <div v-else class="card overflow-hidden">
        <div class="row head" aria-hidden="true">
          <span>Artist</span>
          <span>Community username</span>
          <span>Can make</span>
          <span>Characters</span>
          <span>Status</span>
          <span>Signed up</span>
          <span class="text-right">Actions</span>
        </div>
        <ul class="m-0 p-0 list-none">
          <li v-for="app in visible" :key="app.id" class="row" :class="{ 'is-busy': busyId === app.id }">
            <div class="cell-artist">
              <UserAvatar :user="app.user" :size="40" />
              <div class="min-w-0">
                <button type="button" class="name-btn" @click="selectedId = app.id">
                  {{ personName(app.user) }}
                </button>
                <p v-if="app.user?.username" class="m-0 text-sm text-cocoa truncate">@{{ app.user.username }}</p>
              </div>
            </div>
            <div class="cell">
              <span class="cell-label">Community</span>
              <span class="truncate">{{ app.communityUsername || '–' }}</span>
            </div>
            <div class="cell">
              <span class="cell-label">Can make</span>
              <span>{{ typeList(app.canCreate) || '–' }}</span>
            </div>
            <div class="cell">
              <span class="cell-label">Characters</span>
              <span>{{ characterCount(app) }}</span>
            </div>
            <div class="cell">
              <span class="cell-label">Status</span>
              <StatusBadge :status="app.status" kind="application" />
            </div>
            <div class="cell">
              <span class="cell-label">Signed up</span>
              <span :title="formatDateTime(app.createdAt)">{{ formatDate(app.createdAt) }}</span>
            </div>
            <div class="cell-actions">
              <button
                type="button"
                class="btn btn-ghost btn-xs"
                :aria-label="`View ${personName(app.user)}'s sign-up`"
                @click="selectedId = app.id"
              >
                <Eye :size="15" aria-hidden="true" /> Details
              </button>
              <template v-if="canReview">
                <template v-if="app.status === 'pending'">
                  <button
                    type="button"
                    class="btn btn-primary btn-xs"
                    :disabled="busyId === app.id"
                    :aria-label="`Accept ${personName(app.user)}`"
                    @click="review(app, 'accepted')"
                  >
                    <Check :size="15" aria-hidden="true" /> Accept
                  </button>
                  <button
                    type="button"
                    class="btn btn-outline btn-xs btn-danger-text"
                    :disabled="busyId === app.id"
                    :aria-label="`Reject ${personName(app.user)}`"
                    @click="review(app, 'rejected')"
                  >
                    <X :size="15" aria-hidden="true" /> Reject
                  </button>
                </template>
                <button
                  v-else-if="app.status === 'accepted'"
                  type="button"
                  class="btn btn-ghost btn-xs btn-danger-text"
                  :disabled="busyId === app.id"
                  :aria-label="`Remove ${personName(app.user)} from the event`"
                  @click="review(app, 'rejected')"
                >
                  <UserMinus :size="15" aria-hidden="true" /> Remove
                </button>
              </template>
            </div>
          </li>
        </ul>
      </div>
      <p class="hint m-0">
        Showing {{ pluralize(visible.length, 'sign-up') }}. Export CSV downloads the sign-ups shown.
      </p>
    </template>

    <ApplicationDetailsModal
      :open="Boolean(selected)"
      :application="selected"
      :can-review="canReview"
      :busy="Boolean(selected) && busyId === selected.id"
      @close="selectedId = null"
      @review="reviewFromDetails"
    />

    <ConfirmDialog
      :open="confirm.open"
      :title="confirmText.title"
      :message="confirmText.message"
      :confirm-label="confirmText.label"
      danger
      :loading="confirm.loading"
      @confirm="confirmReject"
      @cancel="confirm.open = false"
    >
      <div v-if="confirmText.note || confirm.error" class="flex flex-col gap-2.5">
        <p v-if="confirmText.note" class="alert alert-warning m-0">{{ confirmText.note }}</p>
        <p v-if="confirm.error" class="alert alert-error m-0" role="alert">{{ confirm.error }}</p>
      </div>
    </ConfirmDialog>
  </section>
</template>

<style scoped>
.search .input {
  padding: 10px 0;
}
.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px 14px;
  padding: 16px 18px;
  border-top: 1px solid var(--border);
  align-items: center;
}
li.row:first-child {
  border-top: 0;
}
.row.head {
  display: none;
}
.row.is-busy {
  opacity: 0.6;
}
.cell-artist {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.name-btn {
  border: 0;
  background: none;
  padding: 0;
  font-weight: 700;
  color: var(--text);
  cursor: pointer;
  text-align: left;
  overflow-wrap: anywhere;
}
.name-btn:hover {
  color: var(--pink-dark);
  text-decoration: underline;
}
.cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  grid-column: 1 / -1;
  min-width: 0;
  font-size: 0.95rem;
}
.cell-label {
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 600;
  flex-shrink: 0;
}
.cell-actions {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 4px;
}

@media (min-width: 1024px) {
  .row,
  .row.head {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1.3fr) minmax(0, 1.2fr) 90px 150px 110px minmax(180px, auto);
    gap: 14px;
  }
  .row.head {
    padding: 12px 18px;
    background: #fbf6ec;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .cell-artist,
  .cell,
  .cell-actions {
    grid-column: auto;
  }
  .cell {
    justify-content: flex-start;
  }
  .cell-label {
    display: none;
  }
  .cell-actions {
    justify-content: flex-end;
    padding-top: 0;
  }
}
</style>
