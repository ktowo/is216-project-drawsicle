<script setup>
import { ref, computed, watch, useId } from 'vue';
import { ArrowRight, Eye, Send, Gift, Inbox } from 'lucide-vue-next';
import TabNav from '@/components/ui/TabNav.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import DeadlineChip from '@/components/ui/DeadlineChip.vue';
import UserAvatar from '@/components/UserAvatar.vue';
import StatTile from './StatTile.vue';
import ReminderModal from './ReminderModal.vue';
import SubmissionViewModal from './SubmissionViewModal.vue';
import { api } from '@/api';
import { toast } from '@/stores/toast';
import { formatDate, formatDateTime } from '@/utils/format';
import { personName, submissionState } from './helpers';

const props = defineProps({
  event: { type: Object, required: true },
});

const uid = useId();
const rows = ref([]);
const counts = ref({ total: 0, submitted: 0, missing: 0, late: 0, verified: 0 });
const loading = ref(false);
const error = ref('');
const filter = ref('all');
const savingId = ref(null);
const viewing = ref(null);
const reminderOpen = ref(false);

const status = computed(() => props.event.status);
const started = computed(() => status.value === 'active' || status.value === 'completed');

let loadToken = 0;
async function load() {
  const token = ++loadToken;
  error.value = '';
  if (!started.value) {
    rows.value = [];
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const data = await api(`/events/${props.event.id}/submissions`);
    if (token !== loadToken) return;
    rows.value = data.rows || [];
    counts.value = { total: 0, submitted: 0, missing: 0, late: 0, verified: 0, ...(data.counts || {}) };
  } catch (e) {
    if (token === loadToken) error.value = e.message;
  } finally {
    if (token === loadToken) loading.value = false;
  }
}

watch(() => [props.event.id, props.event.status], load, { immediate: true });

const overdueCount = computed(() => rows.value.filter((r) => !r.submission && r.overdue).length);
const unverifiedCount = computed(() => rows.value.filter((r) => r.submission && !r.submission.verified).length);

const tabs = computed(() => [
  { key: 'all', label: 'All', count: counts.value.total },
  { key: 'missing', label: 'Missing', count: counts.value.missing },
  { key: 'submitted', label: 'Submitted', count: counts.value.submitted },
  { key: 'unverified', label: 'To verify', count: unverifiedCount.value },
  { key: 'late', label: 'Late', count: counts.value.late },
]);

// Missing gifts first (overdue at the top), then the newest submissions
const sorted = computed(() =>
  [...rows.value].sort((a, b) => {
    const rank = (r) => (r.submission ? 2 : r.overdue ? 0 : 1);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.submission && b.submission) return new Date(b.submission.submittedAt) - new Date(a.submission.submittedAt);
    return personName(a.match?.giver).localeCompare(personName(b.match?.giver));
  })
);

const visible = computed(() =>
  sorted.value.filter((r) => {
    switch (filter.value) {
      case 'missing':
        return !r.submission;
      case 'submitted':
        return Boolean(r.submission);
      case 'unverified':
        return r.submission && !r.submission.verified;
      case 'late':
        return r.submission?.late;
      default:
        return true;
    }
  })
);

async function setVerified(row, verified) {
  const sub = row.submission;
  if (!sub) return;
  savingId.value = sub.id;
  try {
    const { submission } = await api(`/events/${props.event.id}/submissions/${sub.id}`, {
      method: 'PATCH',
      body: { verified },
    });
    const next = submission || { ...sub, verified };
    rows.value = rows.value.map((r) => (r.submission?.id === sub.id ? { ...r, submission: { ...r.submission, ...next } } : r));
    counts.value = { ...counts.value, verified: Math.max(0, counts.value.verified + (verified ? 1 : -1)) };
    if (viewing.value?.submission?.id === sub.id) {
      viewing.value = rows.value.find((r) => r.submission?.id === sub.id) || null;
    }
  } catch (e) {
    toast.error(e.message);
  } finally {
    savingId.value = null;
  }
}
</script>

<template>
  <section class="flex flex-col gap-5" :aria-labelledby="`${uid}-title`">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 :id="`${uid}-title`" class="section-title">Submissions</h2>
        <p class="section-sub text-sm flex flex-wrap items-center gap-2">
          <template v-if="started">
            <span>Gifts are due {{ formatDateTime(event.submissionDeadline) }}.</span>
            <DeadlineChip v-if="status === 'active'" :at="event.submissionDeadline" label="Submissions close" />
          </template>
          <template v-else>Gifts show up here once matches are published.</template>
        </p>
      </div>
      <button
        v-if="status === 'active'"
        type="button"
        class="btn btn-primary btn-sm"
        :disabled="loading"
        @click="reminderOpen = true"
      >
        <Send :size="16" aria-hidden="true" /> Send reminder
      </button>
    </div>

    <EmptyState
      v-if="!started"
      :icon="Inbox"
      title="No submissions yet"
      message="Once you publish matches, every artist's gift and its status will be listed here so you can follow up and verify them."
    />

    <LoadingBlock v-else-if="loading && !rows.length" label="Loading submissions…" />
    <ErrorBlock v-else-if="error" :message="error" @retry="load" />

    <template v-else>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          label="Submitted"
          :value="`${counts.submitted} / ${counts.total}`"
          :tone="counts.total && counts.submitted === counts.total ? 'success' : 'default'"
        />
        <StatTile label="Missing" :value="counts.missing" :tone="counts.missing ? 'warning' : 'default'" />
        <StatTile label="Overdue" :value="overdueCount" :tone="overdueCount ? 'danger' : 'default'" sub="Past the deadline" />
        <StatTile label="Late" :value="counts.late" sub="Sent after the deadline" />
        <StatTile label="Verified" :value="`${counts.verified} / ${counts.submitted}`" sub="Checked by an organiser" />
      </div>

      <EmptyState v-if="!rows.length" :icon="Gift" title="No matches" message="This event has no published matches." />

      <template v-else>
        <TabNav v-model="filter" :tabs="tabs" />

        <p v-if="!visible.length" class="card p-6 text-center text-cocoa m-0">Nothing here.</p>

        <div v-else class="card overflow-hidden">
          <div class="row head" aria-hidden="true">
            <span>Artist → recipient</span>
            <span>Status</span>
            <span>Submitted</span>
            <span>Verified</span>
            <span class="text-right">Gift</span>
          </div>
          <ul class="m-0 p-0 list-none">
            <li v-for="r in visible" :key="r.match.id" class="row" :class="{ overdue: !r.submission && r.overdue }">
              <div class="people">
                <span class="person">
                  <UserAvatar :user="r.match.giver" :size="32" />
                  <span class="truncate font-semibold">{{ personName(r.match.giver) }}</span>
                </span>
                <ArrowRight :size="16" class="text-brand shrink-0" aria-hidden="true" />
                <span class="sr-only">makes a gift for</span>
                <span class="person">
                  <UserAvatar :user="r.match.recipient" :size="32" />
                  <span class="truncate">{{ personName(r.match.recipient) }}</span>
                </span>
              </div>
              <div class="cell">
                <span class="cell-label">Status</span>
                <StatusBadge :status="submissionState(r.submission, r.overdue)" kind="submission" />
              </div>
              <div class="cell">
                <span class="cell-label">Submitted</span>
                <span v-if="r.submission" :title="formatDateTime(r.submission.submittedAt)">
                  {{ formatDate(r.submission.submittedAt) }}
                </span>
                <span v-else class="text-cocoa">–</span>
              </div>
              <div class="cell">
                <span class="cell-label">Verified</span>
                <label v-if="r.submission" class="switch">
                  <input
                    type="checkbox"
                    role="switch"
                    :checked="r.submission.verified"
                    :disabled="savingId === r.submission.id"
                    @change="setVerified(r, $event.target.checked)"
                  />
                  <span class="track" aria-hidden="true"><span class="thumb" /></span>
                  <span class="text-sm">{{ r.submission.verified ? 'Verified' : 'Not yet' }}</span>
                  <span class="sr-only">for {{ personName(r.match.giver) }}'s gift</span>
                </label>
                <span v-else class="text-cocoa">–</span>
              </div>
              <div class="cell-actions">
                <button
                  v-if="r.submission"
                  type="button"
                  class="btn btn-outline btn-xs"
                  :aria-label="`View the gift from ${personName(r.match.giver)}`"
                  @click="viewing = r"
                >
                  <Eye :size="15" aria-hidden="true" /> View
                </button>
              </div>
            </li>
          </ul>
        </div>
      </template>
    </template>

    <SubmissionViewModal :open="Boolean(viewing)" :row="viewing" @close="viewing = null" />

    <ReminderModal
      :open="reminderOpen"
      :event-id="event.id"
      :missing-count="counts.missing"
      :participant-count="counts.total"
      @close="reminderOpen = false"
    />
  </section>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  padding: 14px 18px;
  border-top: 1px solid var(--border);
  align-items: center;
}
li.row:first-child {
  border-top: 0;
}
.row.head {
  display: none;
}
.row.overdue {
  background: var(--pink-tint);
  box-shadow: inset 3px 0 0 var(--danger);
}
.people {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex-wrap: wrap;
}
.person {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
}
.cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.95rem;
}
.cell-label {
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 600;
}
.cell-actions {
  display: flex;
  justify-content: flex-start;
}
.switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  position: relative;
}
.switch input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}
.track {
  width: 38px;
  height: 22px;
  border-radius: 999px;
  background: var(--border-strong);
  position: relative;
  transition: background 0.15s;
  flex-shrink: 0;
}
.thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  transition: transform 0.15s;
}
.switch input:checked + .track {
  background: var(--success);
}
.switch input:checked + .track .thumb {
  transform: translateX(16px);
}
.switch input:focus-visible + .track {
  box-shadow: var(--focus-ring, 0 0 0 3px rgba(236, 106, 147, 0.35));
}
.switch input:disabled + .track {
  opacity: 0.6;
}

@media (min-width: 900px) {
  .row,
  .row.head {
    display: grid;
    grid-template-columns: minmax(0, 2.4fr) 130px 120px 150px 90px;
    gap: 14px;
  }
  .row.head {
    padding: 12px 18px;
    background: var(--surface-2);
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .people {
    flex-wrap: nowrap;
  }
  .cell {
    justify-content: flex-start;
  }
  .cell-label {
    display: none;
  }
  .cell-actions {
    justify-content: flex-end;
  }
}
</style>
