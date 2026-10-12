<script setup>
import { ref, reactive, computed, watch } from 'vue';
import { RouterLink } from 'vue-router';
import {
  Users,
  Hourglass,
  Shuffle,
  Gift,
  AlarmClock,
  Rocket,
  Lock,
  Undo2,
  ArrowRight,
  Send,
  PartyPopper,
  Pencil,
  CalendarClock,
} from 'lucide-vue-next';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import DeadlineChip from '@/components/ui/DeadlineChip.vue';
import StatTile from './StatTile.vue';
import ShareLinkBox from './ShareLinkBox.vue';
import ReminderModal from './ReminderModal.vue';
import { api } from '@/api';
import { toast } from '@/stores/toast';
import { formatDate, formatDateTime, timeUntil, pluralize } from '@/utils/format';
import { eventLink, isPast } from '@/utils/events';

const props = defineProps({
  event: { type: Object, required: true },
});
const emit = defineEmits(['updated', 'go']);

// ---- Numbers for the stat tiles ----
const loading = ref(true);
const loadError = ref('');
const appCounts = ref(null); // { pending, accepted, rejected, withdrawn }
const matchCount = ref(null);
const subCounts = ref(null); // { total, submitted, missing, late, verified }
const overdueCount = ref(0);
let loadToken = 0;

async function loadStats() {
  const { id, status } = props.event;
  const token = ++loadToken;
  loading.value = true;
  loadError.value = '';
  try {
    const wantsMatches = ['matching', 'active', 'completed'].includes(status);
    const wantsSubmissions = ['active', 'completed'].includes(status);
    const [apps, matches, subs] = await Promise.all([
      api(`/events/${id}/applications`),
      wantsMatches ? api(`/events/${id}/matches`) : null,
      wantsSubmissions ? api(`/events/${id}/submissions`) : null,
    ]);
    if (token !== loadToken) return;
    appCounts.value = apps.counts || { pending: 0, accepted: 0, rejected: 0, withdrawn: 0 };
    matchCount.value = matches ? (matches.matches || []).length : null;
    subCounts.value = subs ? subs.counts : null;
    overdueCount.value = subs ? (subs.rows || []).filter((r) => r.overdue).length : 0;
  } catch (e) {
    if (token === loadToken) loadError.value = e.message;
  } finally {
    if (token === loadToken) loading.value = false;
  }
}

watch(() => [props.event.id, props.event.status], loadStats, { immediate: true });

const status = computed(() => props.event.status);
const accepted = computed(() => props.event.participantCount || 0);
const pending = computed(() => appCounts.value?.pending || 0);
// The server only lets an event go back to draft when nobody has a live application (withdrawn ones don't count)
const liveApplications = computed(() => {
  const c = appCounts.value;
  return c ? (c.pending || 0) + (c.accepted || 0) + (c.rejected || 0) : null;
});
// Matching needs at least two people even if the event's minimum is lower
const minNeeded = computed(() => Math.max(props.event.minParticipants || 2, 2));
const belowMinimum = computed(() => accepted.value < minNeeded.value);
const signupPassed = computed(() => isPast(props.event.signupDeadline));
const submissionPassed = computed(() => isPast(props.event.submissionDeadline));
const missing = computed(() => subCounts.value?.missing ?? null);

const tiles = computed(() => {
  const s = status.value;
  const subs = subCounts.value;
  const beforeMatching = s === 'draft' || s === 'open';
  return [
    {
      key: 'accepted',
      label: 'Accepted',
      icon: Users,
      value: `${accepted.value} / ${props.event.maxParticipants}`,
      sub: `Minimum ${props.event.minParticipants}`,
      tone: (s === 'open' || s === 'matching') && belowMinimum.value ? 'warning' : 'default',
    },
    {
      key: 'pending',
      label: 'Pending review',
      icon: Hourglass,
      value: loading.value ? '…' : pending.value,
      sub: props.event.requireApproval ? 'Waiting for your decision' : 'Approval is turned off',
      tone: pending.value > 0 ? 'warning' : 'default',
    },
    {
      key: 'matched',
      label: 'Matched',
      icon: Shuffle,
      value: beforeMatching ? '–' : loading.value ? '…' : matchCount.value ?? '–',
      sub: beforeMatching
        ? 'After sign-ups close'
        : s === 'matching'
          ? matchCount.value
            ? 'Draft, not published yet'
            : 'Not generated yet'
          : 'Published',
      tone: 'default',
    },
    {
      key: 'submitted',
      label: 'Submitted',
      icon: Gift,
      value: subs ? `${subs.submitted} / ${subs.total}` : s === 'active' || s === 'completed' ? '…' : '–',
      sub: subs ? `${pluralize(subs.missing, 'gift')} missing` : 'Once the event is active',
      tone: subs && subs.total > 0 && subs.missing === 0 ? 'success' : 'default',
    },
    {
      key: 'overdue',
      label: 'Overdue',
      icon: AlarmClock,
      value: subs ? overdueCount.value : '–',
      sub: subs ? 'Past the deadline, no gift yet' : 'Once the event is active',
      tone: overdueCount.value > 0 ? 'danger' : 'default',
    },
  ];
});

// ---- Status changes ----
const dialog = reactive({ open: false, kind: '', loading: false, error: '' });

const dialogContent = computed(() => {
  const ev = props.event;
  switch (dialog.kind) {
    case 'open':
      return {
        title: 'Open sign-ups?',
        message:
          ev.publicity === 'private'
            ? `People with your invite link can sign up until ${formatDateTime(ev.signupDeadline)}.`
            : `The event appears on Browse events and anyone can sign up until ${formatDateTime(ev.signupDeadline)}.`,
        notes: ev.requireApproval ? [{ tone: 'info', text: 'You will review each sign-up before it is accepted.' }] : [],
        confirmLabel: 'Open sign-ups',
        status: 'open',
        success: 'Sign-ups are open.',
      };
    case 'close': {
      const notes = [];
      if (belowMinimum.value) {
        notes.push({
          tone: 'warning',
          text: `You need at least ${minNeeded.value} accepted participants to generate matches, and you have ${accepted.value}. You can reopen sign-ups later.`,
        });
      }
      if (pending.value > 0) {
        notes.push({
          tone: 'info',
          text: `${pluralize(pending.value, 'sign-up')} still ${pending.value === 1 ? 'needs' : 'need'} a decision. You can still accept or reject them while matching.`,
        });
      }
      return {
        title: 'Close sign-ups now?',
        message: `Nobody else can sign up, and you can start matching your ${pluralize(accepted.value, 'accepted artist')}.`,
        notes,
        confirmLabel: 'Close sign-ups',
        status: 'matching',
        success: 'Sign-ups closed. Time to make matches!',
      };
    }
    case 'draft':
      return {
        title: 'Move back to draft?',
        message: 'The event will be hidden from everyone except organisers until you open sign-ups again.',
        notes: [],
        confirmLabel: 'Back to draft',
        status: 'draft',
        success: 'The event is a draft again.',
      };
    case 'reopen': {
      const notes = [];
      if (matchCount.value) {
        notes.push({
          tone: 'warning',
          text: `The ${pluralize(matchCount.value, 'draft match', 'draft matches')} you generated will be discarded.`,
        });
      }
      if (signupPassed.value) {
        notes.push({
          tone: 'warning',
          text: `The sign-up deadline (${formatDateTime(ev.signupDeadline)}) has passed, so sign-ups will close again automatically within the hour. Set a later deadline in Edit details first.`,
        });
      }
      return {
        title: 'Reopen sign-ups?',
        message: 'People can sign up, change their answers or withdraw again.',
        notes,
        confirmLabel: 'Reopen sign-ups',
        danger: Boolean(matchCount.value),
        status: 'open',
        success: 'Sign-ups are open again.',
      };
    }
    case 'complete': {
      const subs = subCounts.value;
      let message = 'Completing the event reveals every submitted gift to its recipient and lets all participants know.';
      if (subs) {
        message =
          subs.missing > 0
            ? `${subs.missing} of ${pluralize(subs.total, 'gift')} ${subs.missing === 1 ? 'is' : 'are'} still missing. ${message}`
            : `All ${pluralize(subs.total, 'gift')} are in. ${message}`;
      }
      return {
        title: 'Complete the event and reveal gifts?',
        message,
        notes: [{ tone: 'info', text: "This can't be undone. Missing gifts can't be submitted afterwards." }],
        confirmLabel: 'Complete & reveal',
        danger: Boolean(subs?.missing),
        status: 'completed',
        success: 'Event completed. The gifts are revealed!',
      };
    }
    default:
      return { title: '', message: '', notes: [], confirmLabel: 'Confirm', status: '' };
  }
});

function ask(kind) {
  dialog.kind = kind;
  dialog.error = '';
  dialog.open = true;
}

function closeDialog() {
  if (!dialog.loading) dialog.open = false;
}

async function confirmDialog() {
  const content = dialogContent.value;
  if (!content.status) return;
  dialog.loading = true;
  dialog.error = '';
  try {
    const { event } = await api(`/events/${props.event.id}/status`, {
      method: 'POST',
      body: { status: content.status },
    });
    dialog.open = false;
    toast.success(content.success);
    emit('updated', event);
  } catch (e) {
    dialog.error = e.message;
  } finally {
    dialog.loading = false;
  }
}

// ---- Reminders ----
const reminderOpen = ref(false);
</script>

<template>
  <div class="flex flex-col gap-5">
    <p v-if="loadError" class="alert alert-error m-0 flex flex-wrap items-center justify-between gap-2" role="alert">
      <span>Some numbers couldn't load: {{ loadError }}</span>
      <button type="button" class="btn btn-outline btn-xs" @click="loadStats">Try again</button>
    </p>

    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatTile
        v-for="tile in tiles"
        :key="tile.key"
        :label="tile.label"
        :value="tile.value"
        :sub="tile.sub"
        :tone="tile.tone"
        :icon="tile.icon"
      >
        <button
          v-if="tile.key === 'pending' && pending > 0"
          type="button"
          class="btn btn-ghost btn-xs px-0 text-brand"
          @click="emit('go', 'participants')"
        >
          Review <ArrowRight :size="14" aria-hidden="true" />
        </button>
        <button
          v-else-if="tile.key === 'overdue' && overdueCount > 0"
          type="button"
          class="btn btn-ghost btn-xs px-0 text-danger"
          @click="emit('go', 'submissions')"
        >
          See who <ArrowRight :size="14" aria-hidden="true" />
        </button>
      </StatTile>
    </div>

    <div class="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <!-- What to do next -->
      <section class="card next-step p-5 sm:p-7" aria-labelledby="next-step-title">
        <p class="eyebrow">Next step</p>

        <template v-if="status === 'draft'">
          <h2 id="next-step-title" class="font-display text-2xl font-bold">Ready to open sign-ups?</h2>
          <p class="text-cocoa mt-2 mb-0">
            Only organisers can see this draft. Check the details, then open sign-ups.
            {{
              event.publicity === 'private'
                ? 'Share your invite link once it is open.'
                : 'The event will show up on Browse events.'
            }}
          </p>
          <p v-if="signupPassed" class="alert alert-warning mt-4 mb-0">
            The sign-up deadline has passed. Set a new one in Edit details before opening sign-ups.
          </p>
          <div class="actions">
            <button type="button" class="btn btn-primary" :disabled="signupPassed" @click="ask('open')">
              <Rocket :size="18" aria-hidden="true" /> Open sign-ups
            </button>
            <RouterLink :to="eventLink(event, '/edit')" class="btn btn-outline">
              <Pencil :size="16" aria-hidden="true" /> Edit details
            </RouterLink>
          </div>
        </template>

        <template v-else-if="status === 'open'">
          <h2 id="next-step-title" class="font-display text-2xl font-bold">Sign-ups are open</h2>
          <p class="text-cocoa mt-2 mb-0">
            <template v-if="signupPassed">
              The sign-up deadline has passed. Sign-ups close automatically within the hour, or you can close them now.
            </template>
            <template v-else>
              Sign-ups close automatically {{ timeUntil(event.signupDeadline) }} ({{ formatDateTime(event.signupDeadline) }}).
              You can also close them early once you have enough artists.
            </template>
          </p>
          <p v-if="belowMinimum" class="alert alert-warning mt-4 mb-0">
            {{ accepted }} of the {{ minNeeded }} accepted participants needed for matching so far.
          </p>
          <div class="actions">
            <button type="button" class="btn btn-primary" @click="ask('close')">
              <Lock :size="18" aria-hidden="true" /> Close sign-ups now
            </button>
            <button v-if="pending > 0" type="button" class="btn btn-outline" @click="emit('go', 'participants')">
              Review {{ pluralize(pending, 'sign-up') }}
            </button>
            <button v-if="liveApplications === 0" type="button" class="btn btn-ghost" @click="ask('draft')">
              <Undo2 :size="16" aria-hidden="true" /> Back to draft
            </button>
          </div>
        </template>

        <template v-else-if="status === 'matching'">
          <h2 id="next-step-title" class="font-display text-2xl font-bold">Time to make matches</h2>
          <p class="text-cocoa mt-2 mb-0">
            <template v-if="matchCount">
              You have {{ pluralize(matchCount, 'draft match', 'draft matches') }}. Check them, then publish to start the
              event.
            </template>
            <template v-else>
              Sign-ups are closed. Generate matches, look them over, then publish them to start the event.
            </template>
          </p>
          <div class="actions">
            <button type="button" class="btn btn-primary" @click="emit('go', 'matching')">
              <Shuffle :size="18" aria-hidden="true" /> Go to matching
            </button>
            <button type="button" class="btn btn-outline" @click="ask('reopen')">
              <Undo2 :size="16" aria-hidden="true" /> Reopen sign-ups
            </button>
          </div>
        </template>

        <template v-else-if="status === 'active'">
          <h2 id="next-step-title" class="font-display text-2xl font-bold">Artists are making gifts</h2>
          <p class="text-cocoa mt-2 mb-0">
            <template v-if="submissionPassed">
              The submission deadline has passed. Once you've checked the gifts, complete the event to reveal them.
            </template>
            <template v-else>
              Gifts are due {{ timeUntil(event.submissionDeadline) }} ({{ formatDateTime(event.submissionDeadline) }}).
            </template>
            <template v-if="subCounts"> {{ subCounts.submitted }} of {{ subCounts.total }} submitted so far.</template>
          </p>
          <div class="actions">
            <button type="button" class="btn btn-primary" @click="ask('complete')">
              <PartyPopper :size="18" aria-hidden="true" /> Complete event &amp; reveal gifts
            </button>
            <button type="button" class="btn btn-outline" @click="reminderOpen = true">
              <Send :size="16" aria-hidden="true" /> Send a reminder
            </button>
          </div>
        </template>

        <template v-else-if="status === 'completed'">
          <h2 id="next-step-title" class="font-display text-2xl font-bold">This exchange is complete</h2>
          <p class="text-cocoa mt-2 mb-0">
            Gifts were revealed{{ event.completedAt ? ` on ${formatDate(event.completedAt)}` : '' }}. The event page stays up
            so everyone can look back at what was made.
          </p>
          <div class="actions">
            <RouterLink :to="eventLink(event, '/results')" class="btn btn-primary">
              <PartyPopper :size="18" aria-hidden="true" /> View the reveal
            </RouterLink>
          </div>
        </template>
      </section>

      <!-- Key dates -->
      <section class="card p-5 sm:p-6" aria-labelledby="dates-title">
        <h2 id="dates-title" class="section-title flex items-center gap-2">
          <CalendarClock :size="20" aria-hidden="true" /> Key dates
        </h2>
        <dl class="dates">
          <div>
            <dt>Sign-ups close</dt>
            <dd>
              <span class="date">{{ formatDateTime(event.signupDeadline) }}</span>
              <DeadlineChip v-if="status === 'draft' || status === 'open'" :at="event.signupDeadline" label="Sign-ups close" />
            </dd>
          </div>
          <div>
            <dt>Submissions close</dt>
            <dd>
              <span class="date">{{ formatDateTime(event.submissionDeadline) }}</span>
              <DeadlineChip v-if="status !== 'completed'" :at="event.submissionDeadline" label="Submissions close" />
            </dd>
          </div>
          <div v-if="event.publishedAt">
            <dt>Matches published</dt>
            <dd><span class="date">{{ formatDateTime(event.publishedAt) }}</span></dd>
          </div>
          <div v-if="event.completedAt">
            <dt>Gifts revealed</dt>
            <dd><span class="date">{{ formatDateTime(event.completedAt) }}</span></dd>
          </div>
        </dl>
      </section>
    </div>

    <ShareLinkBox :event="event" @updated="emit('updated', $event)" />

    <ConfirmDialog
      :open="dialog.open"
      :title="dialogContent.title"
      :message="dialogContent.message"
      :confirm-label="dialogContent.confirmLabel"
      :danger="Boolean(dialogContent.danger)"
      :loading="dialog.loading"
      @confirm="confirmDialog"
      @cancel="closeDialog"
    >
      <div v-if="dialogContent.notes.length || dialog.error" class="flex flex-col gap-2.5">
        <p v-for="note in dialogContent.notes" :key="note.text" class="alert m-0" :class="`alert-${note.tone}`">
          {{ note.text }}
        </p>
        <p v-if="dialog.error" class="alert alert-error m-0" role="alert">{{ dialog.error }}</p>
      </div>
    </ConfirmDialog>

    <ReminderModal
      :open="reminderOpen"
      :event-id="event.id"
      :missing-count="missing"
      :participant-count="subCounts ? subCounts.total : accepted"
      @close="reminderOpen = false"
    />
  </div>
</template>

<style scoped>
.next-step {
  background: linear-gradient(135deg, #fffdfa 0%, #fff4f7 100%);
}
.eyebrow {
  margin: 0 0 6px;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--pink-dark);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 20px;
}
@media (max-width: 480px) {
  .actions > * {
    flex: 1 1 100%;
  }
}
.dates {
  margin: 14px 0 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.dates > div {
  padding-top: 14px;
  border-top: 1px solid var(--border);
}
.dates > div:first-child {
  padding-top: 0;
  border-top: 0;
}
.dates dt {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--muted);
}
.dates dd {
  margin: 4px 0 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.date {
  font-weight: 600;
}
</style>
