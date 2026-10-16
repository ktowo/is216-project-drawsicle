<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import {
  CalendarSearch,
  Copy,
  EyeOff,
  Gift,
  Heart,
  Ban,
  Send,
  PencilLine,
  Sparkles,
  PartyPopper,
  UsersRound,
  TriangleAlert,
  CircleCheck,
  Hourglass,
  Printer,
  Link as LinkIcon,
  CalendarPlus,
  LifeBuoy,
  HandHeart,
} from 'lucide-vue-next';
import PageHeader from '@/components/ui/PageHeader.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import DeadlineChip from '@/components/ui/DeadlineChip.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import UserAvatar from '@/components/UserAvatar.vue';
import PersonLink from '@/components/events/PersonLink.vue';
import CharacterCard from '@/components/characters/CharacterCard.vue';
import { api, qs } from '@/api';
import { toast } from '@/stores/toast';
import { formatDateTime } from '@/utils/format';
import { eventCalendarEntries, downloadIcs } from '@/utils/calendar';
import ProgressPicker from '@/components/events/ProgressPicker.vue';
import {
  eventLink,
  inviteFrom,
  isPast,
  matchUnavailable,
  platformLabel,
  typeLabel,
  copyText,
} from '@/utils/events';

const route = useRoute();
const router = useRouter();

const event = ref(null);
const match = ref(null);
const loading = ref(true);
const error = ref('');
const notFound = ref(false);
const unavailable = ref(null); // { title, message } when there's no match to show

const invite = computed(() => inviteFrom(route));
// ?backup=<matchId>: a gift taken over as a backup artist
const backupId = computed(() => {
  const value = route.query.backup;
  return typeof value === 'string' && /^[a-f0-9]{24}$/.test(value) ? value : '';
});
const backups = ref([]); // other gifts I'm making as a backup in this event
const submitLink = computed(() =>
  backupId.value ? { path: eventLink(route.params.id, '/submit'), query: { backup: backupId.value } } : eventLink(route.params.id, '/submit')
);
const progressUrl = computed(() =>
  backupId.value ? `/events/${route.params.id}/backups/${backupId.value}/progress` : `/events/${route.params.id}/my-match/progress`
);
const backTo = computed(() =>
  invite.value ? { path: eventLink(route.params.id), query: { invite: invite.value } } : eventLink(route.params.id)
);

let requestId = 0;
async function load() {
  const id = ++requestId;
  const eventId = route.params.id;
  loading.value = true;
  error.value = '';
  notFound.value = false;
  unavailable.value = null;

  const [eventRes, matchRes, backupsRes] = await Promise.allSettled([
    api(`/events/${eventId}${qs({ invite: invite.value })}`),
    api(backupId.value ? `/events/${eventId}/backups/${backupId.value}` : `/events/${eventId}/my-match`),
    backupId.value ? Promise.resolve({ backups: [] }) : api(`/events/${eventId}/backups/mine`),
  ]);
  backups.value = backupsRes.status === 'fulfilled' ? backupsRes.value.backups || [] : [];
  if (id !== requestId) return;

  const failed = [eventRes, matchRes].find((r) => r.status === 'rejected');
  if (failed?.reason?.status === 401) {
    router.replace({ name: 'login', query: { redirect: route.fullPath } });
    return;
  }

  if (eventRes.status === 'rejected') {
    if (eventRes.reason.status === 404) notFound.value = true;
    else error.value = eventRes.reason.message;
    event.value = null;
  } else {
    event.value = eventRes.value.event;
    document.title = `${backupId.value ? 'Your backup gift' : 'Your match'}: ${event.value.name} · Drawsicle`;
    if (matchRes.status === 'fulfilled') {
      match.value = matchRes.value.match;
    } else {
      const reason = matchRes.reason;
      match.value = null;
      if (reason.status === 403 || reason.status === 404) unavailable.value = matchUnavailable(event.value, reason);
      else error.value = reason.message;
    }
  }
  loading.value = false;
}

watch(
  () => [route.params.id, route.query.backup],
  () => {
    if (route.name === 'event-matches') load();
  },
  { immediate: true }
);

const recipient = computed(() => match.value?.recipient || null);
const recipientName = computed(() => recipient.value?.displayName || 'your recipient');
const submission = computed(() => match.value?.submission || null);
const deadline = computed(() => match.value?.submissionDeadline || event.value?.submissionDeadline);
const isActive = computed(() => event.value?.status === 'active');
const isCompleted = computed(() => event.value?.status === 'completed');
const overdue = computed(() => isActive.value && !submission.value && isPast(deadline.value));

const community = computed(() => {
  if (!event.value) return '';
  return event.value.platform === 'other' ? event.value.platformName || 'the community' : platformLabel(event.value.platform);
});

// Characters were offered for this event, so an "archived" flag from the owner's library means nothing here
const characters = computed(() => (recipient.value?.characters || []).map((c) => ({ ...c, archived: false })));

// Every reference link of every character, one per line, for pasting into notes or a moodboard
const referenceLines = computed(() =>
  characters.value.flatMap((c) =>
    (c.referenceLinks || [])
      .filter((l) => /^https?:\/\//i.test(String(l.url || '')))
      .map((l) => `${c.name}${l.label ? ` (${l.label})` : ''}: ${l.url}`)
  )
);

async function copyReferences() {
  const ok = await copyText(referenceLines.value.join('\n'));
  if (ok) toast.success(`Copied ${referenceLines.value.length === 1 ? 'the link' : `${referenceLines.value.length} links`}.`);
  else toast.error("Couldn't copy them. You can open each character's links instead.");
}

const calendarEntries = computed(() =>
  isActive.value && event.value ? eventCalendarEntries(event.value, { kinds: ['submission'] }) : []
);

function addToCalendar() {
  if (!downloadIcs(`${event.value.name} gift deadline`, calendarEntries.value)) {
    toast.error("Couldn't create the calendar file.");
  }
}

function printSheet() {
  window.print();
}

async function copyUsername() {
  const ok = await copyText(recipient.value.communityUsername);
  if (ok) toast.success('Username copied.');
  else toast.error("Couldn't copy it. You can select the name and copy it yourself.");
}
</script>

<template>
  <main class="page">
    <LoadingBlock v-if="loading" label="Loading your match…" />

    <EmptyState
      v-else-if="notFound"
      :icon="CalendarSearch"
      title="Event not found"
      message="It may have been deleted, or it's a private event that needs an invite link."
    >
      <RouterLink to="/events" class="btn btn-primary">Browse events</RouterLink>
    </EmptyState>

    <template v-else-if="error">
      <PageHeader title="Your match" :back="backTo" back-label="Back to event" />
      <ErrorBlock :message="error" @retry="load" />
    </template>

    <template v-else-if="event">
      <PageHeader :title="backupId ? 'Your backup gift' : 'Your match'" :subtitle="event.name" :back="backTo" back-label="Back to event">
        <StatusBadge :status="event.status" />
      </PageHeader>

      <EmptyState v-if="unavailable" :icon="Hourglass" :title="unavailable.title" :message="unavailable.message">
        <RouterLink :to="backTo" class="btn btn-primary">Back to the event</RouterLink>
        <RouterLink v-if="event.viewer?.isOrganizer" :to="eventLink(event, '/manage')" class="btn btn-outline">
          Manage event
        </RouterLink>
      </EmptyState>

      <section v-else-if="match?.handedOver" class="card hero handed-over" aria-labelledby="handed-heading">
        <p class="eyebrow"><HandHeart :size="18" aria-hidden="true" /> Handed over</p>
        <h2 id="handed-heading" class="who-name small">A backup artist is making this gift</h2>
        <p class="muted">
          The organisers asked someone else to make the gift for {{ recipient?.displayName || 'your recipient' }}, so you
          don't need to. If that's a mistake, get in touch with them.
        </p>
      </section>

      <template v-else-if="match && recipient">
        <p v-if="match.asBackup" class="alert alert-info backup-note">
          <LifeBuoy :size="18" aria-hidden="true" />
          <span>
            Thank you for stepping in! You're making this gift in place of an artist who couldn't finish. It's a secret,
            just like your own.
          </span>
        </p>
        <p class="print-only print-head">
          {{ event.name }} · Gift for {{ recipient.displayName }} · Due {{ formatDateTime(deadline) }}
        </p>
        <section class="card hero" aria-labelledby="recipient-heading">
          <p class="eyebrow">
            <Gift :size="18" aria-hidden="true" /> {{ isCompleted ? 'You made a gift for' : "You're making a gift for" }}
          </p>
          <div class="who">
            <UserAvatar :user="recipient" :size="76" class="who-avatar" />
            <div class="who-text">
              <h2 id="recipient-heading" class="who-name">
                <PersonLink :user="recipient" :size="0" fallback="your recipient" />
              </h2>
              <p v-if="recipient.username" class="who-handle">@{{ recipient.username }}</p>
              <div v-if="recipient.communityUsername" class="community">
                <span class="community-label">On {{ community }}:</span>
                <span class="community-name">{{ recipient.communityUsername }}</span>
                <button
                  type="button"
                  class="btn btn-ghost btn-xs"
                  :aria-label="`Copy ${recipient.communityUsername}`"
                  @click="copyUsername"
                >
                  <Copy :size="14" aria-hidden="true" /> Copy
                </button>
              </div>
            </div>
          </div>
          <p v-if="isCompleted" class="secret">
            <PartyPopper :size="18" aria-hidden="true" />
            <span>The gifts have been revealed, so {{ recipient.displayName }} now knows the gift came from you.</span>
          </p>
          <p v-else class="secret">
            <EyeOff :size="18" aria-hidden="true" />
            <span>
              Keep it secret! {{ recipient.displayName }} won't know who is making their gift until the reveal.
            </span>
          </p>
        </section>

        <div class="layout">
          <div class="main-col">
            <section class="card panel" aria-labelledby="wishes-heading">
              <h2 id="wishes-heading" class="panel-title">What they asked for</h2>

              <div class="wish">
                <h3 class="wish-label"><Sparkles :size="17" aria-hidden="true" /> They'd like to receive</h3>
                <ul v-if="recipient.wantsTypes?.length" class="type-list">
                  <li v-for="t in recipient.wantsTypes" :key="t" class="type-chip">{{ typeLabel(t) }}</li>
                </ul>
                <p v-else class="muted">Anything you can make.</p>
              </div>

              <div class="wish">
                <h3 class="wish-label"><Heart :size="17" aria-hidden="true" /> They'd love</h3>
                <p v-if="recipient.likes" class="prose">{{ recipient.likes }}</p>
                <p v-else class="muted">They didn't say. Surprise them!</p>
              </div>

              <div class="wish">
                <h3 class="wish-label"><Ban :size="17" aria-hidden="true" /> Please avoid</h3>
                <p v-if="recipient.avoid" class="prose">{{ recipient.avoid }}</p>
                <p v-else class="muted">Nothing in particular.</p>
              </div>
            </section>

            <section class="card panel" aria-labelledby="chars-heading">
              <h2 id="chars-heading" class="panel-title">Their characters</h2>
              <p class="muted intro">Make something featuring one or more of these. Check the reference links and notes before you start.</p>
              <div v-if="characters.length" class="characters">
                <CharacterCard v-for="c in characters" :key="c.id" :character="c" show-links />
              </div>
              <EmptyState
                v-else
                :icon="UsersRound"
                title="No characters to show"
                message="Their characters aren't available any more. You could ask the organisers, or make something inspired by their wishes."
              />
            </section>
          </div>

          <aside class="side-col">
            <section class="card panel status-panel" aria-labelledby="gift-heading">
              <h2 id="gift-heading" class="panel-title small-title">Your gift</h2>

              <div class="status-row">
                <span class="muted">Status</span>
                <StatusBadge kind="match" :status="submission ? 'submitted' : 'assigned'" />
              </div>
              <div v-if="submission?.late" class="status-row">
                <span class="muted">Timing</span>
                <StatusBadge kind="submission" status="late" />
              </div>

              <dl class="dates">
                <div>
                  <dt>Due</dt>
                  <dd>
                    <span class="date">{{ formatDateTime(deadline) }}</span>
                    <DeadlineChip v-if="isActive" :at="deadline" label="Gifts due" past-label="Was due" />
                  </dd>
                </div>
                <div v-if="submission?.submittedAt">
                  <dt>Submitted</dt>
                  <dd><span class="date">{{ formatDateTime(submission.submittedAt) }}</span></dd>
                </div>
              </dl>

              <p v-if="overdue" class="alert alert-warning note">
                <TriangleAlert :size="18" aria-hidden="true" />
                <span>The deadline has passed. You can still send your gift, but it will be marked late.</span>
              </p>
              <p v-else-if="submission && isActive" class="alert alert-success note">
                <CircleCheck :size="18" aria-hidden="true" />
                <span>Your gift is in. You can still change it until the organisers close the event.</span>
              </p>

              <div class="actions">
                <RouterLink
                  v-if="isActive"
                  :to="submitLink"
                  class="btn btn-block"
                  :class="submission ? 'btn-outline' : 'btn-primary'"
                >
                  <PencilLine v-if="submission" :size="18" aria-hidden="true" />
                  <Send v-else :size="18" aria-hidden="true" />
                  {{ submission ? 'Edit your submission' : 'Submit your gift' }}
                </RouterLink>
                <RouterLink v-if="isCompleted" :to="eventLink(event, '/results')" class="btn btn-primary btn-block">
                  See the reveal
                </RouterLink>
              </div>
              <p v-if="isCompleted" class="muted small">This event has finished, so gifts can no longer be changed.</p>
            </section>

            <ProgressPicker
              v-if="isActive && !submission"
              :url="progressUrl"
              :progress="match.progress"
              @saved="match.progress = $event"
            />

            <section v-if="backups.length" class="card panel tools" aria-labelledby="backups-heading">
              <h2 id="backups-heading" class="panel-title small-title"><LifeBuoy :size="18" aria-hidden="true" /> Backup gifts</h2>
              <p class="muted small">You're also making a gift as a backup artist:</p>
              <RouterLink
                v-for="b in backups"
                :key="b.id"
                :to="{ path: eventLink(event, '/matches'), query: { backup: b.id } }"
                class="btn btn-outline btn-sm btn-block"
              >
                For {{ b.recipient.displayName }}{{ b.submission ? ' (submitted)' : '' }}
              </RouterLink>
            </section>

            <section class="card panel tools" aria-labelledby="tools-heading">
              <h2 id="tools-heading" class="panel-title small-title">Keep it handy</h2>
              <button type="button" class="btn btn-outline btn-sm btn-block" @click="printSheet">
                <Printer :size="16" aria-hidden="true" /> Print or save as PDF
              </button>
              <button
                type="button"
                class="btn btn-outline btn-sm btn-block"
                :disabled="!referenceLines.length"
                @click="copyReferences"
              >
                <LinkIcon :size="16" aria-hidden="true" /> Copy all reference links
              </button>
              <button
                v-if="calendarEntries.length"
                type="button"
                class="btn btn-outline btn-sm btn-block"
                @click="addToCalendar"
              >
                <CalendarPlus :size="16" aria-hidden="true" /> Add the deadline to your calendar
              </button>
              <p class="muted small">
                The printout is a one-page reference sheet: their wishes, characters and links, without the site around
                it.
              </p>
            </section>
          </aside>
        </div>
      </template>
    </template>
  </main>
</template>

<style scoped>
.hero {
  padding: 28px 32px;
  background: linear-gradient(135deg, var(--surface) 55%, var(--pink-soft));
}
.eyebrow {
  margin: 0 0 16px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--pink-dark);
  font-weight: 700;
}
.who {
  display: flex;
  align-items: center;
  gap: 20px;
  min-width: 0;
}
.who-avatar {
  flex-shrink: 0;
}
.who-text {
  min-width: 0;
}
.who-name {
  font-size: clamp(1.7rem, 4vw, 2.3rem);
  font-weight: 800;
  overflow-wrap: anywhere;
}
.who-handle {
  margin: 2px 0 0;
  color: var(--muted);
  font-weight: 600;
}
.community {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin-top: 10px;
}
.community-label {
  color: var(--muted);
}
.community-name {
  font-weight: 700;
  overflow-wrap: anywhere;
}
.secret {
  margin: 22px 0 0;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface) 85%, transparent);
  border: 1px dashed var(--pink);
  color: var(--text);
  font-weight: 500;
}
.secret svg {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--pink-dark);
}
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 24px;
  margin-top: 24px;
  align-items: start;
}
.main-col,
.side-col {
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
}
.side-col {
  position: sticky;
  top: 96px;
}
.panel {
  padding: 26px 28px;
}
.panel-title {
  font-size: 1.35rem;
  font-weight: 700;
  margin-bottom: 16px;
}
.small-title {
  font-size: 1.15rem;
}
.muted {
  margin: 0;
  color: var(--muted);
}
.small {
  font-size: 0.9rem;
}
.intro {
  margin: -6px 0 18px;
}
.wish + .wish {
  margin-top: 20px;
  padding-top: 18px;
  border-top: 1px solid var(--border);
}
.wish-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  font-family: var(--font-body);
  font-size: 1rem;
  font-weight: 700;
}
.wish-label svg {
  color: var(--pink-dark);
}
.prose {
  margin: 0;
  white-space: pre-line;
  overflow-wrap: anywhere;
  line-height: 1.6;
}
.type-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.type-chip {
  padding: 4px 14px;
  border-radius: 999px;
  background: var(--pink-soft);
  color: var(--pink-dark);
  font-weight: 600;
  font-size: 0.9rem;
}
.characters {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
}
.status-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.status-panel .panel-title {
  margin-bottom: 2px;
}
.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.dates {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dates dt {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--muted);
}
.dates dd {
  margin: 4px 0 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}
.date {
  font-weight: 600;
}
.note {
  margin: 0;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.note svg {
  flex-shrink: 0;
  margin-top: 2px;
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.handed-over .who-name.small {
  font-size: 1.5rem;
}
.handed-over .muted {
  margin-top: 8px;
  max-width: 60ch;
}
.backup-note {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 0 0 16px;
}
.tools {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.tools .panel-title {
  margin-bottom: 2px;
}
.print-only {
  display: none;
}

/* The reference sheet: just the recipient, their wishes and characters, with link addresses written out */
@media print {
  .print-only {
    display: block;
  }
  .print-head {
    margin: 0 0 12px;
    font-weight: 700;
    color: #000;
  }
  :deep(.page-header),
  .tools,
  .actions,
  .community .btn,
  .status-panel .alert {
    display: none !important;
  }
  .hero {
    background: none;
    padding: 0 0 12px;
    border: 0;
  }
  .layout {
    display: block;
    margin-top: 12px;
  }
  .side-col {
    position: static;
  }
  .panel {
    padding: 12px 0;
    border: 0;
    break-inside: avoid;
  }
  .characters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .characters :deep(.character-card) {
    break-inside: avoid;
  }
  .characters :deep(.ref-link)::after {
    content: ' ' attr(href);
    font-weight: 400;
    word-break: break-all;
  }
  .characters :deep(.ref-link span:not(.sr-only)) {
    max-width: none;
  }
}

@media (max-width: 960px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .side-col {
    position: static;
    order: -1;
  }
}
@media (max-width: 640px) {
  .hero {
    padding: 22px 18px;
  }
  .who {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  .panel {
    padding: 20px 18px;
  }
  .layout,
  .main-col,
  .side-col {
    gap: 16px;
  }
  .layout {
    margin-top: 16px;
  }
  .characters {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
