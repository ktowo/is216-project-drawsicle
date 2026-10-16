<script setup>
import { ref, computed, watch, useId } from 'vue';
import {
  ArrowRight,
  Eye,
  Send,
  Gift,
  Inbox,
  Download,
  LayoutGrid,
  List,
  CheckCheck,
  Loader2,
  Images,
  LifeBuoy,
  Brush,
} from 'lucide-vue-next';
import TabNav from '@/components/ui/TabNav.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import DeadlineChip from '@/components/ui/DeadlineChip.vue';
import PersonLink from '@/components/events/PersonLink.vue';
import StatTile from './StatTile.vue';
import ReminderModal from './ReminderModal.vue';
import SubmissionViewModal from './SubmissionViewModal.vue';
import FindBackupModal from './FindBackupModal.vue';
import { PROGRESS_STAGES } from '@shared/constants.mjs';
import { api, assetUrl } from '@/api';
import { toast } from '@/stores/toast';
import { formatDate, formatDateTime, pluralize, timeAgo } from '@/utils/format';
import { personName, submissionState, downloadCsv, fileSlug } from './helpers';

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
const backupFor = ref(null); // the row whose gift needs a backup artist

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

// The artist's own "how's it going?" check-in
const STAGE_LABELS = Object.fromEntries(PROGRESS_STAGES.map((s) => [s.value, s.label]));
function progressText(match) {
  return match?.progress?.stage ? STAGE_LABELS[match.progress.stage] || '' : '';
}
// Who is making the gift now: the backup artist if one took over
function makerName(match) {
  return personName(match?.backupGiver || match?.giver);
}

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

// quiet: leave errors to the caller (bulk verify sums them up)
async function setVerified(row, verified, { quiet = false } = {}) {
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
    return true;
  } catch (e) {
    if (!quiet) toast.error(e.message);
    return false;
  } finally {
    savingId.value = null;
  }
}

// ---- Verify every gift shown at once ----
const verifying = ref(false);
const toVerify = computed(() => visible.value.filter((r) => r.submission && !r.submission.verified));

async function verifyShown() {
  const list = [...toVerify.value];
  if (!list.length || verifying.value) return;
  verifying.value = true;
  let ok = 0;
  for (const row of list) {
    if (await setVerified(row, true, { quiet: true })) ok++;
  }
  verifying.value = false;
  if (ok) toast.success(`Verified ${pluralize(ok, 'gift')}.`);
  if (ok < list.length) toast.error(`${pluralize(list.length - ok, 'gift')} couldn't be verified. Try again.`);
}

// ---- List or gallery ----
const view = ref('list');

// ---- Export ----
const CSV_HEADER = [
  'Artist',
  'Recipient',
  'Backup artist',
  'Progress',
  'Status',
  'Submitted',
  'Late',
  'Verified',
  'Title',
  'Type',
  'Images',
  'Links',
];
const STATUS_TEXT = { on_time: 'Submitted', late: 'Submitted late', overdue: 'Overdue', missing: 'Not submitted' };

function exportCsv() {
  const rowsOut = visible.value.map((r) => {
    const sub = r.submission;
    return [
      personName(r.match.giver),
      personName(r.match.recipient),
      r.match.backupGiver ? personName(r.match.backupGiver) : '',
      sub ? '' : progressText(r.match),
      STATUS_TEXT[submissionState(sub, r.overdue)],
      sub ? formatDateTime(sub.submittedAt) : '',
      sub ? (sub.late ? 'Yes' : 'No') : '',
      sub ? (sub.verified ? 'Yes' : 'No') : '',
      sub?.title || '',
      sub?.type || '',
      (sub?.images || []).length,
      (sub?.links || []).map((l) => l.url).join(' '),
    ];
  });
  const suffix = filter.value === 'all' ? 'gifts' : `${filter.value}-gifts`;
  downloadCsv(`${fileSlug(props.event.name)}-${suffix}.csv`, [CSV_HEADER, ...rowsOut]);
  toast.success(`Exported ${pluralize(rowsOut.length, 'row')}.`);
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

        <div v-if="visible.length" class="toolbar">
          <div class="view-toggle" role="group" aria-label="Show gifts as">
            <button
              type="button"
              class="btn btn-ghost btn-xs"
              :class="{ on: view === 'list' }"
              :aria-pressed="view === 'list' ? 'true' : 'false'"
              @click="view = 'list'"
            >
              <List :size="15" aria-hidden="true" /> List
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-xs"
              :class="{ on: view === 'gallery' }"
              :aria-pressed="view === 'gallery' ? 'true' : 'false'"
              @click="view = 'gallery'"
            >
              <LayoutGrid :size="15" aria-hidden="true" /> Gallery
            </button>
          </div>
          <div class="toolbar-actions">
            <button
              v-if="toVerify.length"
              type="button"
              class="btn btn-outline btn-xs"
              :disabled="verifying"
              @click="verifyShown"
            >
              <Loader2 v-if="verifying" :size="15" class="spin" aria-hidden="true" />
              <CheckCheck v-else :size="15" aria-hidden="true" />
              Verify {{ toVerify.length === 1 ? 'this gift' : `all ${toVerify.length} shown` }}
            </button>
            <button type="button" class="btn btn-outline btn-xs" @click="exportCsv">
              <Download :size="15" aria-hidden="true" /> Export CSV
            </button>
          </div>
        </div>

        <p v-if="!visible.length" class="card p-6 text-center text-cocoa m-0">Nothing here.</p>

        <ul v-else-if="view === 'gallery'" class="gift-grid" aria-label="Gifts">
          <li v-for="r in visible" :key="r.match.id" class="gift card" :class="{ missing: !r.submission }">
            <button
              v-if="r.submission"
              type="button"
              class="gift-cover"
              :aria-label="`View the gift from ${personName(r.match.giver)}`"
              @click="viewing = r"
            >
              <img v-if="r.submission.images?.length" :src="assetUrl(r.submission.images[0])" alt="" loading="lazy" />
              <Gift v-else :size="30" aria-hidden="true" />
              <span v-if="(r.submission.images?.length || 0) > 1" class="gift-count">
                <Images :size="13" aria-hidden="true" /> {{ r.submission.images.length }}
              </span>
            </button>
            <div v-else class="gift-cover empty" aria-hidden="true"><Inbox :size="30" /></div>
            <div class="gift-body">
              <p class="gift-pair">
                <span class="truncate font-semibold">{{ personName(r.match.giver) }}</span>
                <ArrowRight :size="14" class="text-brand shrink-0" aria-hidden="true" />
                <span class="sr-only">for</span>
                <span class="truncate">{{ personName(r.match.recipient) }}</span>
              </p>
              <div class="gift-meta">
                <StatusBadge :status="submissionState(r.submission, r.overdue)" kind="submission" />
                <span v-if="r.submission?.verified" class="badge badge-success">Verified</span>
                <span v-if="r.match.backupGiver" class="badge badge-info">
                  <LifeBuoy :size="12" aria-hidden="true" /> {{ personName(r.match.backupGiver) }}
                </span>
                <span v-if="!r.submission && progressText(r.match)" class="badge badge-muted">
                  {{ progressText(r.match) }}
                </span>
              </div>
            </div>
          </li>
        </ul>

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
              <div class="min-w-0">
                <div class="people">
                  <PersonLink :user="r.match.giver" :size="32" class="person" :class="{ replaced: r.match.backupGiver }" />
                  <ArrowRight :size="16" class="text-brand shrink-0" aria-hidden="true" />
                  <span class="sr-only">makes a gift for</span>
                  <PersonLink :user="r.match.recipient" :size="32" class="person" />
                </div>
                <p v-if="r.match.backupGiver || (!r.submission && r.match.progress)" class="extra">
                  <span v-if="r.match.backupGiver" class="extra-item backup">
                    <LifeBuoy :size="14" aria-hidden="true" /> Backup: {{ personName(r.match.backupGiver) }}
                  </span>
                  <span
                    v-if="!r.submission && r.match.progress"
                    class="extra-item"
                    :title="r.match.progress.note || undefined"
                  >
                    <Brush :size="14" aria-hidden="true" />
                    {{ progressText(r.match) }} · {{ timeAgo(r.match.progress.at) }}
                    <template v-if="r.match.progress.note">: “{{ r.match.progress.note }}”</template>
                  </span>
                </p>
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
                <button
                  v-else-if="status === 'active'"
                  type="button"
                  class="btn btn-ghost btn-xs"
                  :aria-label="`Find a backup artist for ${makerName(r.match)}'s gift`"
                  @click="backupFor = r"
                >
                  <LifeBuoy :size="15" aria-hidden="true" /> Backup
                </button>
              </div>
            </li>
          </ul>
        </div>
      </template>
    </template>

    <SubmissionViewModal :open="Boolean(viewing)" :row="viewing" @close="viewing = null" />

    <FindBackupModal
      :open="Boolean(backupFor)"
      :event-id="event.id"
      :row="backupFor"
      @close="backupFor = null"
      @changed="load"
    />

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
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.view-toggle {
  display: flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: 12px;
}
.view-toggle .on {
  background: var(--pink-soft);
  color: var(--pink-dark);
}
.toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.gift-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 190px), 1fr));
}
.gift {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}
.gift.missing {
  border-style: dashed;
}
.gift-cover {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 4 / 3;
  width: 100%;
  padding: 0;
  border: 0;
  background: var(--chip);
  color: var(--muted);
  cursor: pointer;
  overflow: hidden;
}
.gift-cover.empty {
  cursor: default;
}
.gift-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.gift-cover:focus-visible {
  outline: 3px solid var(--pink);
  outline-offset: -3px;
}
.gift-count {
  position: absolute;
  right: 8px;
  bottom: 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 600;
}
.gift-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
}
.gift-pair {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  min-width: 0;
  font-size: 0.92rem;
}
.gift-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
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
.person.replaced {
  opacity: 0.6;
}
.extra {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 6px 0 0;
  font-size: 0.82rem;
  color: var(--muted);
}
.extra-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.extra-item.backup {
  color: var(--info);
  font-weight: 600;
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
