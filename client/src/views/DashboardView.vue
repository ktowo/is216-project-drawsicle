<script setup>
import { ref, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import {
  Bell,
  BellPlus,
  CalendarPlus,
  CalendarClock,
  Compass,
  Gift,
  Palette,
  Users,
  ClipboardList,
  ArrowRight,
  Sparkles,
  AlarmClock,
  Send,
  Eye,
  PartyPopper,
  Settings2,
  UserRound,
} from 'lucide-vue-next';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import DeadlineChip from '@/components/ui/DeadlineChip.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import StatTile from '@/components/events/manage/StatTile.vue';
import EventBanner from '@/components/events/EventBanner.vue';
import { auth } from '@/stores/auth';
import { notifications, refreshUnreadCount, loadNotifications } from '@/stores/notifications';
import { toast } from '@/stores/toast';
import { api, isMockMode } from '@/api';
import { formatDateTime, timeUntil, pluralize } from '@/utils/format';
import { eventLink, nextDeadline, isPast } from '@/utils/events';

const data = ref(null);
const loading = ref(true);
const error = ref('');
const unreadLoaded = ref(false);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    data.value = await api('/dashboard');
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  load();
  await refreshUnreadCount();
  unreadLoaded.value = true;
});

const firstName = computed(() => (auth.user?.displayName || auth.user?.username || 'there').split(/\s+/)[0]);
const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 5) return 'Up late';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
});

const assignments = computed(() => data.value?.assignments || []);
const organizing = computed(() => data.value?.organizing || []);
const upcoming = computed(() =>
  [...(data.value?.upcoming || [])]
    .filter((u) => u.at)
    .sort((a, b) => new Date(a.at) - new Date(b.at))
    .slice(0, 8)
);
const counts = computed(() => data.value?.counts || { organizing: 0, participating: 0, unreadNotifications: 0 });
// The bell's number is fresher (it updates as notifications are read), so prefer it once fetched
const unread = computed(() => (unreadLoaded.value ? notifications.unreadCount : counts.value.unreadNotifications || 0));
const isNewUser = computed(() => !assignments.value.length && !organizing.value.length && !counts.value.participating);

// ---- Assignments ----
function assignmentState(item) {
  if (item.submitted) return item.late ? { label: 'Submitted late', cls: 'badge-warning' } : { label: 'Submitted', cls: 'badge-success' };
  if (item.event.status === 'completed') return { label: 'Not submitted', cls: 'badge-muted' };
  // Without a submission, late means the deadline has passed
  if (item.late || isPast(item.event.submissionDeadline)) return { label: 'Overdue', cls: 'badge-danger' };
  return { label: 'Not submitted yet', cls: 'badge-muted' };
}

// ---- Organising ----
function percent(part, whole) {
  if (!whole) return 0;
  return Math.max(0, Math.min(100, Math.round((part / whole) * 100)));
}

function progressRows(stats, status) {
  const s = stats || {};
  const rows = [
    {
      key: 'accepted',
      label: 'Accepted',
      value: `${s.accepted || 0} of ${pluralize(s.applications || 0, 'sign-up')}`,
      pct: percent(s.accepted || 0, s.applications || 0),
    },
  ];
  if (status === 'matching' || status === 'active' || status === 'completed') {
    rows.push({
      key: 'matched',
      label: 'Matched',
      value: `${s.matched || 0} of ${s.accepted || 0}`,
      pct: percent(s.matched || 0, s.accepted || 0),
    });
  }
  if (status === 'active' || status === 'completed') {
    rows.push({
      key: 'submitted',
      label: 'Gifts in',
      value: `${s.submitted || 0} of ${s.matched || 0}`,
      pct: percent(s.submitted || 0, s.matched || 0),
    });
  }
  return rows;
}

function organizerNote(item) {
  const { event, stats = {} } = item;
  if (event.status === 'draft') return 'Draft: only organisers can see it until you open sign-ups.';
  if (event.status === 'matching') return stats.matched ? 'Draft matches are ready to check and publish.' : 'Sign-ups are closed. Time to generate matches.';
  if (event.status === 'completed') return 'Complete. The reveal stays up for everyone to look back on.';
  return '';
}

// ---- Upcoming ----
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dayParts(at) {
  const d = new Date(at);
  return { day: d.getDate(), month: MONTHS[d.getMonth()] };
}
const upcomingLabel = (kind) => (kind === 'signup' ? 'Sign-ups close' : 'Gifts due');

// ---- Dev helper (the route answers 404 in production) ----
const showDevTools = import.meta.env.DEV && !isMockMode;
const sendingTest = ref(false);
async function sendTestNotification() {
  sendingTest.value = true;
  try {
    await api('/notifications/test', { method: 'POST' });
    await loadNotifications();
    toast.success('Test notification sent. Check the bell.');
  } catch (e) {
    toast.error(e.message);
  } finally {
    sendingTest.value = false;
  }
}
</script>

<template>
  <main v-if="auth.user" class="page">
    <header class="hello">
      <div class="min-w-0">
        <h1 class="welcome">{{ greeting }}, {{ firstName }}</h1>
        <p class="lead">
          {{ isNewUser && !loading ? 'Welcome to Drawisicle! Find an exchange to join, or start your own.' : "Here's what's happening in your art exchanges." }}
        </p>
      </div>
      <RouterLink to="/events/new" class="btn btn-primary">
        <CalendarPlus :size="18" aria-hidden="true" /> Create an event
      </RouterLink>
    </header>

    <section v-if="!auth.user.profileComplete" class="card nudge" aria-labelledby="nudge-title">
      <span class="nudge-icon" aria-hidden="true"><UserRound :size="22" /></span>
      <div class="min-w-0 flex-1">
        <h2 id="nudge-title" class="nudge-title">Finish setting up your profile</h2>
        <p class="m-0 text-cocoa">
          Add a short bio and your community usernames so organisers and your Secret Santa know who you are.
        </p>
      </div>
      <RouterLink to="/profile" class="btn btn-outline btn-sm">
        Complete profile <ArrowRight :size="16" aria-hidden="true" />
      </RouterLink>
    </section>

    <LoadingBlock v-if="loading" label="Loading your dashboard…" />
    <ErrorBlock v-else-if="error" :message="error" @retry="load" />

    <template v-else-if="data">
      <div class="tiles">
        <StatTile label="Organising" :value="counts.organizing" :icon="ClipboardList" sub="Events you run" />
        <StatTile label="Participating" :value="counts.participating" :icon="Users" sub="Events you signed up for" />
        <StatTile label="Unread notifications" :value="unread" :icon="Bell" :tone="unread ? 'brand' : 'default'">
          <RouterLink to="/notifications" class="tile-link">
            {{ unread ? 'Read them' : 'See all' }} <ArrowRight :size="14" aria-hidden="true" />
          </RouterLink>
        </StatTile>
      </div>

      <div class="layout">
        <div class="main-col">
          <!-- Assignments -->
          <section class="card panel" aria-labelledby="assign-title">
            <h2 id="assign-title" class="panel-title"><Gift :size="22" aria-hidden="true" /> Your assignments</h2>
            <EmptyState
              v-if="!assignments.length"
              :icon="Palette"
              title="No gifts to make right now"
              message="When an exchange you joined publishes its matches, the person you're making a gift for shows up here."
            >
              <RouterLink to="/events" class="btn btn-outline btn-sm">
                <Compass :size="16" aria-hidden="true" /> Browse events
              </RouterLink>
            </EmptyState>
            <ul v-else class="list">
              <li v-for="item in assignments" :key="item.event.id" class="assignment">
                <div class="min-w-0 flex-1">
                  <RouterLink :to="eventLink(item.event)" class="item-title">{{ item.event.name }}</RouterLink>
                  <p class="m-0 text-cocoa">
                    for <strong class="text-ink">{{ item.recipientName || 'your recipient' }}</strong>
                  </p>
                  <div class="chips">
                    <span class="badge" :class="assignmentState(item).cls">{{ assignmentState(item).label }}</span>
                    <DeadlineChip
                      v-if="item.event.status === 'active'"
                      :at="item.event.submissionDeadline"
                      label="Due"
                      past-label="Was due"
                    />
                  </div>
                </div>
                <div class="item-actions">
                  <template v-if="item.event.status === 'completed'">
                    <RouterLink :to="eventLink(item.event, '/results')" class="btn btn-primary btn-sm">
                      <PartyPopper :size="16" aria-hidden="true" /> See the reveal
                    </RouterLink>
                  </template>
                  <template v-else>
                    <RouterLink :to="eventLink(item.event, '/matches')" class="btn btn-outline btn-sm">
                      <Eye :size="16" aria-hidden="true" /> View match
                    </RouterLink>
                    <RouterLink
                      :to="eventLink(item.event, '/submit')"
                      class="btn btn-sm"
                      :class="item.submitted ? 'btn-outline' : 'btn-primary'"
                    >
                      <Send :size="16" aria-hidden="true" /> {{ item.submitted ? 'Edit gift' : 'Submit' }}
                    </RouterLink>
                  </template>
                </div>
              </li>
            </ul>
          </section>

          <!-- Organising -->
          <section class="card panel" aria-labelledby="org-title">
            <h2 id="org-title" class="panel-title"><ClipboardList :size="22" aria-hidden="true" /> Events you organise</h2>
            <EmptyState
              v-if="!organizing.length"
              :icon="CalendarPlus"
              title="You're not organising anything yet"
              message="Run your own exchange: collect sign-ups, match artists automatically and keep track of every gift."
            >
              <RouterLink to="/events/new" class="btn btn-primary btn-sm">
                <CalendarPlus :size="16" aria-hidden="true" /> Create an event
              </RouterLink>
            </EmptyState>
            <ul v-else class="list">
              <li
                v-for="item in organizing"
                :key="item.event.id"
                class="org-item"
                :class="{ overdue: item.stats?.overdue > 0 }"
              >
                <EventBanner :event="item.event" :height="64" class="org-thumb" />
                <div class="min-w-0 flex-1">
                  <div class="org-head">
                    <RouterLink :to="eventLink(item.event, '/manage')" class="item-title">{{ item.event.name }}</RouterLink>
                    <StatusBadge :status="item.event.status" />
                  </div>
                  <div class="chips">
                    <DeadlineChip
                      v-if="nextDeadline(item.event)"
                      :at="nextDeadline(item.event).at"
                      :label="nextDeadline(item.event).label"
                    />
                    <span v-if="item.stats?.pending > 0" class="badge badge-warning">
                      {{ pluralize(item.stats.pending, 'sign-up') }} to review
                    </span>
                    <span v-if="item.stats?.overdue > 0" class="badge badge-danger">
                      <AlarmClock :size="13" aria-hidden="true" class="mr-1" />
                      {{ item.stats.overdue }} overdue
                    </span>
                  </div>
                  <p v-if="organizerNote(item)" class="m-0 mt-2 text-sm text-cocoa">{{ organizerNote(item) }}</p>
                  <dl v-if="item.event.status !== 'draft'" class="bars">
                    <div v-for="row in progressRows(item.stats, item.event.status)" :key="row.key" class="bar-row">
                      <dt>{{ row.label }}</dt>
                      <dd>
                        <span
                          class="bar"
                          role="progressbar"
                          :aria-valuenow="row.pct"
                          aria-valuemin="0"
                          aria-valuemax="100"
                          :aria-label="`${row.label}: ${row.value}`"
                        >
                          <span :class="{ full: row.pct === 100 }" :style="{ width: `${row.pct}%` }" />
                        </span>
                        <span class="bar-value">{{ row.value }}</span>
                      </dd>
                    </div>
                  </dl>
                </div>
                <RouterLink :to="eventLink(item.event, '/manage')" class="btn btn-outline btn-sm manage-btn">
                  <Settings2 :size="16" aria-hidden="true" /> Manage
                </RouterLink>
              </li>
            </ul>
          </section>
        </div>

        <aside class="side-col">
          <!-- Upcoming deadlines -->
          <section class="card panel" aria-labelledby="upcoming-title">
            <h2 id="upcoming-title" class="panel-title"><CalendarClock :size="22" aria-hidden="true" /> Upcoming deadlines</h2>
            <p v-if="!upcoming.length" class="m-0 mt-2 text-cocoa">
              Nothing due soon. Deadlines from events you organise or joined will show up here.
            </p>
            <ol v-else class="timeline">
              <li v-for="u in upcoming" :key="`${u.eventId}-${u.kind}`" class="tl-item">
                <span class="tl-date" aria-hidden="true">
                  <span class="tl-day">{{ dayParts(u.at).day }}</span>
                  <span class="tl-month">{{ dayParts(u.at).month }}</span>
                </span>
                <div class="min-w-0">
                  <p class="m-0 font-semibold">{{ upcomingLabel(u.kind) }}</p>
                  <RouterLink :to="eventLink(u.eventId)" class="tl-event">{{ u.eventName }}</RouterLink>
                  <p class="m-0 text-sm text-cocoa">
                    <time :datetime="u.at">{{ formatDateTime(u.at) }}</time> · {{ timeUntil(u.at) }}
                  </p>
                </div>
              </li>
            </ol>
          </section>

          <!-- Quick actions -->
          <section class="card panel" aria-labelledby="quick-title">
            <h2 id="quick-title" class="panel-title"><Sparkles :size="22" aria-hidden="true" /> Quick actions</h2>
            <nav class="quick" aria-labelledby="quick-title">
              <RouterLink to="/events/new" class="quick-link">
                <span class="quick-icon" aria-hidden="true"><CalendarPlus :size="18" /></span>
                <span>
                  <span class="quick-title">Create an event</span>
                  <span class="quick-sub">Start a new exchange</span>
                </span>
              </RouterLink>
              <RouterLink to="/events" class="quick-link">
                <span class="quick-icon" aria-hidden="true"><Compass :size="18" /></span>
                <span>
                  <span class="quick-title">Browse events</span>
                  <span class="quick-sub">Find one to join</span>
                </span>
              </RouterLink>
              <RouterLink to="/characters" class="quick-link">
                <span class="quick-icon" aria-hidden="true"><Palette :size="18" /></span>
                <span>
                  <span class="quick-title">Character library</span>
                  <span class="quick-sub">Characters you can offer</span>
                </span>
              </RouterLink>
            </nav>
            <button
              v-if="showDevTools"
              type="button"
              class="btn btn-ghost btn-xs dev-btn"
              :disabled="sendingTest"
              @click="sendTestNotification"
            >
              <BellPlus :size="15" aria-hidden="true" /> Send me a test notification (dev only)
            </button>
          </section>
        </aside>
      </div>
    </template>
  </main>
</template>

<style scoped>
.hello {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px 24px;
}
.welcome {
  font-size: clamp(1.9rem, 4vw, 2.6rem);
  font-weight: 800;
  overflow-wrap: anywhere;
}
.lead {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 1.1rem;
}
.nudge {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px 18px;
  margin-top: 24px;
  padding: 18px 22px;
  background: linear-gradient(135deg, var(--surface) 0%, var(--pink-tint) 100%);
  border-color: var(--pink-line);
}
.nudge-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: var(--pink-soft);
  color: var(--pink-dark);
  flex-shrink: 0;
}
.nudge-title {
  font-family: var(--font-body);
  font-size: 1.05rem;
  font-weight: 700;
  margin-bottom: 2px;
}
.tiles {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 28px;
}
.tile-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.88rem;
  font-weight: 600;
}
.layout {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
  gap: 20px;
  margin-top: 20px;
  align-items: start;
}
.main-col,
.side-col {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}
.panel {
  padding: 22px 24px;
}
.panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-body);
  font-weight: 700;
  font-size: 1.2rem;
}
.list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
}
.list > li {
  padding: 16px 0;
  border-top: 1px solid var(--border);
}
.list > li:first-child {
  border-top: 0;
  padding-top: 6px;
}
.assignment {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 18px;
}
.item-title {
  display: inline-block;
  font-weight: 700;
  font-size: 1.05rem;
  color: var(--text);
  overflow-wrap: anywhere;
}
.item-title:hover {
  color: var(--pink-dark);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin-top: 8px;
}
.chips .badge {
  padding: 3px 10px;
  font-size: 0.8rem;
}
.item-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.org-item {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.org-item.overdue {
  margin: 0 -12px;
  padding-left: 12px;
  padding-right: 12px;
  background: var(--pink-tint);
  box-shadow: inset 3px 0 0 var(--danger);
}
.org-thumb {
  width: 88px;
  flex-shrink: 0;
  border-radius: 12px;
  overflow: hidden;
}
.org-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}
.org-head :deep(.badge) {
  padding: 2px 10px;
  font-size: 0.78rem;
}
.manage-btn {
  flex-shrink: 0;
}
.bars {
  margin: 12px 0 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bar-row {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}
.bar-row dt {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--muted);
}
.bar-row dd {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.bar {
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: var(--chip);
  overflow: hidden;
}
.bar > span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--pink-line), var(--pink));
}
.bar > span.full {
  background: var(--success);
}
.bar-value {
  font-size: 0.82rem;
  color: var(--muted);
  white-space: nowrap;
}
.timeline {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.tl-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.tl-date {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 52px;
  border-radius: 12px;
  background: var(--pink-soft);
  color: var(--pink-dark);
  flex-shrink: 0;
  line-height: 1;
}
.tl-day {
  font-family: var(--font-display);
  font-size: 1.3rem;
  font-weight: 700;
}
.tl-month {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.tl-event {
  font-weight: 600;
  overflow-wrap: anywhere;
}
.quick {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}
.quick-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  transition: background 0.15s, border-color 0.15s;
}
.quick-link:hover {
  background: var(--surface-2);
  color: var(--text);
  border-color: var(--border-strong);
}
.quick-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--pink-soft);
  color: var(--pink-dark);
  flex-shrink: 0;
}
.quick-title {
  display: block;
  font-weight: 700;
}
.quick-sub {
  display: block;
  font-size: 0.85rem;
  color: var(--muted);
}
.dev-btn {
  margin-top: 14px;
}
@media (max-width: 960px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 640px) {
  .hello > .btn {
    width: 100%;
  }
  .tiles {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }
  .panel {
    padding: 18px 16px;
  }
  .item-actions {
    width: 100%;
  }
  .item-actions > .btn {
    flex: 1 1 auto;
  }
  .org-item {
    flex-wrap: wrap;
  }
  .org-thumb {
    display: none;
  }
  .org-item.overdue {
    margin: 0 -16px;
    padding-left: 16px;
    padding-right: 16px;
  }
  .manage-btn {
    width: 100%;
  }
}
</style>
