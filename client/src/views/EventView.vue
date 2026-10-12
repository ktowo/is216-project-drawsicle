<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import {
  ArrowLeft,
  Lock,
  Globe,
  Link2,
  ExternalLink,
  CalendarSearch,
  Users,
  LogOut,
  Info,
  CircleCheck,
  TriangleAlert,
  CircleAlert,
} from 'lucide-vue-next';
import EventBanner from '@/components/events/EventBanner.vue';
import LifecycleStepper from '@/components/events/LifecycleStepper.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import DeadlineChip from '@/components/ui/DeadlineChip.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import UserAvatar from '@/components/UserAvatar.vue';
import { api, qs, assetUrl } from '@/api';
import { toast } from '@/stores/toast';
import { signupsOpen } from '@shared/constants.mjs';
import { formatDateTime, pluralize } from '@/utils/format';
import {
  viewerActions,
  viewerNote,
  seasonLabel,
  platformLabel,
  typeLabel,
  safeUrl,
  inviteFrom,
  absoluteEventUrl,
  copyText,
  hasActiveApplication,
} from '@/utils/events';

const route = useRoute();
const router = useRouter();

const event = ref(null);
const loading = ref(true);
const error = ref('');
const notFound = ref(false);

const confirmWithdraw = ref(false);
const withdrawing = ref(false);

const invite = computed(() => inviteFrom(route));

let requestId = 0;
async function load({ quiet = false } = {}) {
  const id = ++requestId;
  if (!quiet) loading.value = true;
  error.value = '';
  notFound.value = false;
  try {
    const data = await api(`/events/${route.params.id}${qs({ invite: invite.value })}`);
    if (id !== requestId) return;
    event.value = data.event;
    document.title = `${data.event.name} · Drawisicle`;
  } catch (e) {
    if (id !== requestId) return;
    if (e.status === 404 || e.code === 'INVALID_ID') notFound.value = true;
    else error.value = e.message;
    event.value = null;
  } finally {
    if (id === requestId) loading.value = false;
  }
}

watch(
  () => [route.params.id, route.query.invite],
  () => {
    if (route.name === 'event') load();
  },
  { immediate: true }
);

const actions = computed(() => viewerActions(event.value, { invite: invite.value }));
const note = computed(() => viewerNote(event.value));
const noteIcon = computed(
  () => ({ success: CircleCheck, warning: TriangleAlert, danger: CircleAlert })[note.value?.tone] || Info
);

const canWithdraw = computed(() => event.value && signupsOpen(event.value) && hasActiveApplication(event.value));
const applicationStatus = computed(() => event.value?.viewer?.applicationStatus || null);

const meta = computed(() => {
  if (!event.value) return [];
  const parts = [];
  if (event.value.season && event.value.season !== 'other') parts.push(seasonLabel(event.value.season));
  if (event.value.theme) parts.push(`Theme: ${event.value.theme}`);
  return parts;
});

const capacity = computed(() => {
  const count = event.value?.participantCount || 0;
  const max = event.value?.maxParticipants || 0;
  return {
    count,
    max,
    percent: max ? Math.min(100, Math.round((count / max) * 100)) : 0,
    left: Math.max(0, max - count),
  };
});

const platformHref = computed(() => safeUrl(event.value?.platformLink));

// Public events: anyone can share the plain link. Private events: only organisers, with the invite code.
const canCopyLink = computed(
  () => event.value && (event.value.publicity === 'public' || (event.value.viewer?.isOrganizer && event.value.inviteCode))
);

async function copyLink() {
  const isPrivate = event.value.publicity === 'private';
  const url = absoluteEventUrl(router, event.value, { invite: isPrivate ? event.value.inviteCode : undefined });
  const ok = await copyText(url);
  if (!ok) {
    toast.error("Couldn't copy the link. You can copy it from the address bar instead.");
    return;
  }
  if (event.value.status === 'draft') toast.info('Link copied. It works for others once sign-ups open.');
  else toast.success(isPrivate ? 'Invite link copied. Anyone with it can see this event.' : 'Link copied.');
}

async function withdraw() {
  withdrawing.value = true;
  try {
    await api(`/events/${event.value.id}/application${qs({ invite: invite.value })}`, { method: 'DELETE' });
    toast.success("You've withdrawn from this event.");
    confirmWithdraw.value = false;
    await load({ quiet: true });
  } catch (e) {
    toast.error(e.message);
  } finally {
    withdrawing.value = false;
  }
}

const avatarUser = (user) => ({ ...user, avatarUrl: user?.avatarUrl ? assetUrl(user.avatarUrl) : null });
</script>

<template>
  <main class="page">
    <RouterLink to="/events" class="back-link">
      <ArrowLeft :size="16" aria-hidden="true" /> All events
    </RouterLink>

    <LoadingBlock v-if="loading" label="Loading event…" />

    <EmptyState
      v-else-if="notFound"
      :icon="CalendarSearch"
      title="Event not found"
      message="It may have been deleted, or it's a private event that needs an invite link."
    >
      <RouterLink to="/events" class="btn btn-primary">Browse events</RouterLink>
    </EmptyState>

    <ErrorBlock v-else-if="error" :message="error" @retry="load" />

    <template v-else-if="event">
      <header class="card hero">
        <EventBanner :event="event" :height="220" class="hero-banner" />
        <div class="hero-body">
          <div class="badges">
            <StatusBadge :status="event.status" />
            <span class="pill" :title="event.publicity === 'private' ? 'Only people with the invite link can see it' : 'Listed publicly'">
              <component :is="event.publicity === 'private' ? Lock : Globe" :size="14" aria-hidden="true" />
              {{ event.publicity === 'private' ? 'Private, invite only' : 'Public' }}
            </span>
          </div>
          <h1 class="title">{{ event.name }}</h1>
          <p v-if="meta.length" class="meta">{{ meta.join(' · ') }}</p>
          <div v-if="event.organizers?.length" class="organisers">
            <span class="avatars" aria-hidden="true">
              <UserAvatar v-for="o in event.organizers.slice(0, 4)" :key="o.id" :user="avatarUser(o)" :size="30" />
            </span>
            <span class="org-names">
              Organised by
              <template v-for="(o, i) in event.organizers" :key="o.id">
                <strong>{{ o.displayName }}</strong><template v-if="i < event.organizers.length - 2">, </template><template v-else-if="i === event.organizers.length - 2"> and </template>
              </template>
            </span>
          </div>
        </div>
      </header>

      <div class="layout">
        <div class="main-col">
          <section class="card panel" aria-labelledby="about-heading">
            <h2 id="about-heading" class="panel-title">About this event</h2>
            <p v-if="event.description" class="prose">{{ event.description }}</p>
            <p v-else class="muted">The organisers haven't added a description yet.</p>
            <ul v-if="event.tags?.length" class="tags" aria-label="Tags">
              <li v-for="tag in event.tags" :key="tag" class="tag">#{{ tag }}</li>
            </ul>
          </section>

          <section v-if="event.rules" class="card panel" aria-labelledby="rules-heading">
            <h2 id="rules-heading" class="panel-title">Rules</h2>
            <p class="prose">{{ event.rules }}</p>
          </section>

          <section class="card panel" aria-labelledby="progress-heading">
            <h2 id="progress-heading" class="panel-title">Progress</h2>
            <LifecycleStepper :status="event.status" />
          </section>
        </div>

        <aside class="side-col">
          <section class="card panel action-panel" aria-label="Your place in this event">
            <div v-if="applicationStatus && applicationStatus !== 'withdrawn'" class="app-status">
              <span class="muted small">Your sign-up</span>
              <StatusBadge kind="application" :status="applicationStatus" />
            </div>

            <div v-if="note" class="note" :class="`tone-${note.tone}`" role="status">
              <component :is="noteIcon" :size="20" class="note-icon" aria-hidden="true" />
              <div>
                <p class="note-title">{{ note.title }}</p>
                <p class="note-text">{{ note.message }}</p>
              </div>
            </div>

            <div v-if="actions.length || canWithdraw" class="actions">
              <RouterLink
                v-for="a in actions"
                :key="a.key"
                :to="a.to"
                class="btn btn-block"
                :class="a.primary ? 'btn-primary' : 'btn-outline'"
              >
                {{ a.label }}
              </RouterLink>
              <button v-if="canWithdraw" type="button" class="btn btn-ghost btn-block withdraw" @click="confirmWithdraw = true">
                <LogOut :size="16" aria-hidden="true" /> Withdraw
              </button>
            </div>

            <button v-if="canCopyLink" type="button" class="btn btn-ghost btn-block copy" @click="copyLink">
              <Link2 :size="16" aria-hidden="true" />
              {{ event.publicity === 'private' ? 'Copy invite link' : 'Copy link' }}
            </button>
          </section>

          <section class="card panel dates-panel" aria-labelledby="dates-heading">
            <h2 id="dates-heading" class="panel-title small-title">Key dates</h2>
            <dl class="dates">
              <div class="date-row">
                <dt>Sign-ups close</dt>
                <dd>
                  <span class="date">{{ formatDateTime(event.signupDeadline) }}</span>
                  <DeadlineChip v-if="['draft', 'open'].includes(event.status)" :at="event.signupDeadline" label="Sign-ups close" />
                </dd>
              </div>
              <div class="date-row">
                <dt>Gifts due</dt>
                <dd>
                  <span class="date">{{ formatDateTime(event.submissionDeadline) }}</span>
                  <DeadlineChip v-if="event.status !== 'completed'" :at="event.submissionDeadline" label="Submissions close" />
                </dd>
              </div>
              <div v-if="event.completedAt" class="date-row">
                <dt>Revealed</dt>
                <dd><span class="date">{{ formatDateTime(event.completedAt) }}</span></dd>
              </div>
            </dl>
          </section>

          <section class="card panel" aria-labelledby="people-heading">
            <h2 id="people-heading" class="panel-title small-title">Participants</h2>
            <p class="capacity-line">
              <Users :size="18" aria-hidden="true" />
              <strong>{{ capacity.count }}</strong>
              <span class="muted">/ {{ capacity.max }} spots taken</span>
            </p>
            <div class="bar" aria-hidden="true">
              <span class="bar-fill" :style="{ width: `${capacity.percent}%` }" />
            </div>
            <p class="muted small">
              <template v-if="event.status === 'open' && capacity.left">{{ pluralize(capacity.left, 'spot') }} left. </template>
              Needs at least {{ pluralize(event.minParticipants, 'participant') }} to run.
              <template v-if="event.requireApproval"> Organisers review each sign-up.</template>
            </p>
          </section>

          <section class="card panel" aria-labelledby="types-heading">
            <h2 id="types-heading" class="panel-title small-title">What people make</h2>
            <ul class="type-list">
              <li v-for="t in event.allowedTypes" :key="t" class="type-chip">{{ typeLabel(t) }}</li>
            </ul>
          </section>

          <section class="card panel" aria-labelledby="community-heading">
            <h2 id="community-heading" class="panel-title small-title">Community</h2>
            <p class="community">
              <template v-if="event.platform === 'other'">
                <span class="platform">{{ event.platformName || 'Other community' }}</span>
              </template>
              <template v-else>
                <span class="platform">{{ platformLabel(event.platform) }}</span>
                <span v-if="event.platformName" class="muted">{{ event.platformName }}</span>
              </template>
            </p>
            <a v-if="platformHref" :href="platformHref" target="_blank" rel="noopener noreferrer" class="external">
              Visit the community <ExternalLink :size="14" aria-hidden="true" />
            </a>
          </section>
        </aside>
      </div>

      <ConfirmDialog
        :open="confirmWithdraw"
        title="Withdraw from this event?"
        :message="
          applicationStatus === 'accepted'
            ? 'You will lose your spot. You can sign up again while sign-ups are open, if there is still space.'
            : 'Your sign-up will be cancelled. You can sign up again while sign-ups are open.'
        "
        confirm-label="Withdraw"
        cancel-label="Stay signed up"
        danger
        :loading="withdrawing"
        @confirm="withdraw"
        @cancel="confirmWithdraw = false"
      />
    </template>
  </main>
</template>

<style scoped>
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: var(--muted);
  margin-bottom: 18px;
}
.back-link:hover {
  color: var(--pink-dark);
}
.hero {
  overflow: hidden;
}
.hero-body {
  padding: 24px 32px 28px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 999px;
  background: #f2eadb;
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 600;
}
.title {
  font-size: clamp(1.8rem, 4vw, 2.6rem);
  font-weight: 800;
  overflow-wrap: anywhere;
}
.meta {
  margin: 0;
  color: var(--muted);
  font-size: 1.05rem;
  font-weight: 500;
}
.organisers {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 4px;
}
.avatars {
  display: inline-flex;
}
.avatars > * + * {
  margin-left: -8px;
}
.avatars :deep(.avatar) {
  border: 2px solid var(--surface);
}
.org-names {
  color: var(--muted);
}
.org-names strong {
  color: var(--text);
  font-weight: 600;
}
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
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
.panel {
  padding: 26px 28px;
}
.panel-title {
  font-size: 1.35rem;
  font-weight: 700;
  margin-bottom: 14px;
}
.small-title {
  font-size: 1.1rem;
  margin-bottom: 12px;
}
.prose {
  margin: 0;
  white-space: pre-line;
  overflow-wrap: anywhere;
  line-height: 1.65;
}
.muted {
  color: var(--muted);
  margin: 0;
}
.small {
  font-size: 0.9rem;
}
.tags {
  list-style: none;
  margin: 18px 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.tag {
  padding: 3px 12px;
  border-radius: 999px;
  background: var(--pink-soft);
  color: var(--pink-dark);
  font-size: 0.85rem;
  font-weight: 600;
}
.action-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.app-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.note {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 14px;
  background: #f6efe3;
}
.note-icon {
  flex-shrink: 0;
  margin-top: 2px;
}
.note-title {
  margin: 0;
  font-weight: 700;
}
.note-text {
  margin: 4px 0 0;
  font-size: 0.92rem;
}
.tone-info {
  background: #eef5fd;
  color: #24557f;
}
.tone-success {
  background: var(--success-soft);
  color: var(--success);
}
.tone-warning {
  background: #fdf3e1;
  color: #8a5a12;
}
.tone-danger {
  background: var(--danger-soft);
  color: var(--danger);
}
.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.withdraw {
  color: var(--danger);
}
.copy {
  margin-top: -4px;
}
.dates {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.date-row dt {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--muted);
}
.date-row dd {
  margin: 4px 0 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}
.date {
  font-weight: 600;
}
.capacity-line {
  margin: 0 0 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.1rem;
}
.bar {
  height: 10px;
  border-radius: 999px;
  background: #f2eadb;
  overflow: hidden;
  margin-bottom: 12px;
}
.bar-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--pink), var(--pink-dark));
  transition: width 0.3s;
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
  padding: 5px 14px;
  border-radius: 999px;
  border: 1.5px solid var(--border);
  font-weight: 600;
  font-size: 0.9rem;
}
.community {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.platform {
  font-weight: 700;
}
.external {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  font-weight: 600;
}
/* One column on small screens, with the actions and dates first so nobody scrolls past the description to sign up */
@media (max-width: 960px) {
  .layout {
    display: flex;
    flex-direction: column;
  }
  .main-col,
  .side-col {
    display: contents;
  }
  .action-panel {
    order: -2;
  }
  .dates-panel {
    order: -1;
  }
}
@media (max-width: 640px) {
  .hero-body {
    padding: 18px 18px 22px;
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
}
</style>
