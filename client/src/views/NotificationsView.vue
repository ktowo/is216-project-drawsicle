<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import {
  Bell,
  BellOff,
  CheckCheck,
  RotateCw,
  Trash2,
  Inbox,
  CircleCheck,
  Ban,
  CalendarHeart,
  Users,
  Gift,
  Clock,
  ImageUp,
  PartyPopper,
  ShieldCheck,
  Loader2,
  ChevronRight,
} from 'lucide-vue-next';
import PageHeader from '@/components/ui/PageHeader.vue';
import TabNav from '@/components/ui/TabNav.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import {
  notifications,
  loadNotifications,
  markRead,
  markAllRead,
  removeNotification,
} from '@/stores/notifications';
import { auth, setUser } from '@/stores/auth';
import { toast } from '@/stores/toast';
import { api } from '@/api';
import { timeAgo, formatDateTime } from '@/utils/format';

const LIMIT = 50;

const ICONS = {
  application_received: Inbox,
  application_accepted: CircleCheck,
  application_rejected: Ban,
  event_status: CalendarHeart,
  organizer_added: Users,
  role_changed: ShieldCheck,
  match_assigned: Gift,
  deadline_reminder: Clock,
  submission_received: ImageUp,
  gift_revealed: PartyPopper,
};

const router = useRouter();

const filter = ref('all');
const loading = ref(true);
const error = ref('');
const markingAll = ref(false);
const deletingId = ref(null);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    await loadNotifications(LIMIT);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const tabs = computed(() => [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread', count: notifications.unreadCount },
]);

const shown = computed(() =>
  filter.value === 'unread' ? notifications.items.filter((n) => !n.read) : notifications.items
);

// More unread on the server than in the list we have: something new arrived since loading
const hasNewer = computed(
  () => notifications.loaded && notifications.unreadCount > notifications.items.filter((n) => !n.read).length
);

const isInternal = (link) => typeof link === 'string' && link.startsWith('/') && !link.startsWith('//');

function open(n) {
  markRead(n.id);
  if (isInternal(n.link)) router.push(n.link);
}

async function onMarkAll() {
  markingAll.value = true;
  try {
    await markAllRead();
    toast.success('All caught up.');
  } catch (e) {
    toast.error(e.message);
  } finally {
    markingAll.value = false;
  }
}

async function remove(n) {
  deletingId.value = n.id;
  try {
    await removeNotification(n.id);
  } catch (e) {
    toast.error(e.message);
  } finally {
    deletingId.value = null;
  }
}

// ---------- Email preferences ----------

const PREFS = [
  {
    key: 'emailReminders',
    label: 'Deadline reminders',
    description: 'Sign-ups closing soon and submission deadlines for gifts you still owe.',
  },
  {
    key: 'emailMatches',
    label: 'Your match',
    description: 'When matches are published and you find out who you are making a gift for.',
  },
  {
    key: 'emailEventUpdates',
    label: 'Event updates',
    description: 'Application decisions, status changes and gift reveals for events you are part of.',
  },
];

const prefs = reactive({
  emailReminders: auth.user?.notificationPrefs?.emailReminders !== false,
  emailMatches: auth.user?.notificationPrefs?.emailMatches !== false,
  emailEventUpdates: Boolean(auth.user?.notificationPrefs?.emailEventUpdates),
});
const savingPref = ref('');

// Each switch saves straight away; it flips back if the server says no
async function togglePref(key) {
  if (savingPref.value) return;
  const next = !prefs[key];
  prefs[key] = next;
  savingPref.value = key;
  try {
    const { user } = await api('/profile', { method: 'PATCH', body: { notificationPrefs: { [key]: next } } });
    setUser(user);
    Object.assign(prefs, user.notificationPrefs || {});
    toast.success(next ? 'We will email you about this.' : 'Okay, no more emails about this.');
  } catch (e) {
    prefs[key] = !next;
    toast.error(e.message);
  } finally {
    savingPref.value = '';
  }
}
</script>

<template>
  <div class="notifications-view">
    <PageHeader title="Notifications" subtitle="Updates about your events, matches and deadlines.">
      <template #actions>
        <button type="button" class="btn btn-outline btn-sm" :disabled="loading" @click="load">
          <RotateCw :size="16" :class="{ spin: loading }" aria-hidden="true" /> Refresh
        </button>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="!notifications.unreadCount || markingAll"
          @click="onMarkAll"
        >
          <Loader2 v-if="markingAll" :size="16" class="spin" aria-hidden="true" />
          <CheckCheck v-else :size="16" aria-hidden="true" />
          Mark all read
        </button>
      </template>
    </PageHeader>

    <section class="card panel" aria-labelledby="inbox-heading">
      <div class="panel-head">
        <h2 id="inbox-heading" class="sr-only">Inbox</h2>
        <TabNav v-model="filter" :tabs="tabs" aria-label="Filter notifications" />
        <button v-if="hasNewer && !loading" type="button" class="newer" @click="load">
          New notifications. Show them
        </button>
      </div>

      <LoadingBlock v-if="loading && !notifications.loaded" label="Loading notifications…" />

      <ErrorBlock v-else-if="error && !notifications.items.length" :message="error" @retry="load" />

      <EmptyState
        v-else-if="!shown.length"
        :icon="filter === 'unread' ? CheckCheck : BellOff"
        :title="filter === 'unread' ? 'No unread notifications' : 'No notifications yet'"
        :message="
          filter === 'unread'
            ? 'You have read everything. Nice.'
            : 'When something happens in your events (a match, a reminder, a reveal) it shows up here.'
        "
      >
        <button v-if="filter === 'unread' && notifications.items.length" type="button" class="btn btn-outline btn-sm" @click="filter = 'all'">
          Show all
        </button>
      </EmptyState>

      <template v-else>
        <p v-if="error" class="alert alert-error list-alert" role="alert">{{ error }}</p>
        <ul class="list">
          <li v-for="n in shown" :key="n.id" class="row" :class="{ unread: !n.read }">
            <button type="button" class="row-main" @click="open(n)">
              <span class="icon" aria-hidden="true">
                <component :is="ICONS[n.type] || Bell" :size="19" />
              </span>
              <span class="body">
                <span class="title">
                  {{ n.title }}
                  <span v-if="!n.read" class="sr-only">(unread)</span>
                </span>
                <span v-if="n.message" class="message">{{ n.message }}</span>
                <time class="time" :datetime="n.createdAt" :title="formatDateTime(n.createdAt)">
                  {{ timeAgo(n.createdAt) }}
                </time>
              </span>
              <ChevronRight v-if="isInternal(n.link)" :size="18" class="chev" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-icon delete"
              :disabled="deletingId === n.id"
              :aria-label="`Delete notification: ${n.title}`"
              @click="remove(n)"
            >
              <Loader2 v-if="deletingId === n.id" :size="17" class="spin" aria-hidden="true" />
              <Trash2 v-else :size="17" aria-hidden="true" />
            </button>
          </li>
        </ul>
        <p v-if="notifications.items.length >= LIMIT" class="hint more-note">
          Showing your latest {{ LIMIT }}. Delete old ones to see further back.
        </p>
      </template>
    </section>

    <section class="card panel" aria-labelledby="email-heading">
      <h2 id="email-heading" class="section-title">Email me about</h2>
      <p class="section-sub">In-app notifications are always on. Choose which ones also come by email.</p>

      <ul class="prefs">
        <li v-for="p in PREFS" :key="p.key" class="pref">
          <div class="pref-text">
            <span :id="`pref-${p.key}`" class="pref-label">{{ p.label }}</span>
            <span :id="`pref-${p.key}-desc`" class="pref-desc">{{ p.description }}</span>
          </div>
          <button
            type="button"
            role="switch"
            class="switch"
            :class="{ on: prefs[p.key] }"
            :aria-checked="prefs[p.key] ? 'true' : 'false'"
            :aria-labelledby="`pref-${p.key}`"
            :aria-describedby="`pref-${p.key}-desc`"
            :aria-busy="savingPref === p.key ? 'true' : undefined"
            :disabled="Boolean(savingPref)"
            @click="togglePref(p.key)"
          >
            <span class="knob" aria-hidden="true" />
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.notifications-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.notifications-view :deep(.page-header) {
  margin-bottom: 4px;
}
.panel {
  padding: 24px;
}
.panel-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.newer {
  border: 0;
  background: var(--pink-soft);
  color: var(--pink-dark);
  font-weight: 600;
  font-size: 0.9rem;
  padding: 7px 14px;
  border-radius: 999px;
  cursor: pointer;
}
.newer:hover {
  background: #fbd5e2;
}
.list-alert {
  margin: 0 0 12px;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.row {
  display: flex;
  align-items: center;
  gap: 4px;
  border-top: 1px solid var(--border);
}
.row:first-child {
  border-top: 0;
}
.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 10px;
  border: 0;
  background: none;
  border-radius: 14px;
  text-align: left;
  color: var(--text);
  cursor: pointer;
}
.row-main:hover {
  background: #faf3e7;
}
.row-main:focus-visible {
  border-radius: 14px;
}
.icon {
  position: relative;
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: #f3ebdc;
  color: var(--muted);
}
.unread .icon {
  background: var(--pink-soft);
  color: var(--pink-dark);
}
.unread .icon::after {
  content: '';
  position: absolute;
  top: -3px;
  right: -3px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--pink);
  box-shadow: 0 0 0 2px var(--surface);
}
.body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
}
.title {
  font-weight: 500;
  overflow-wrap: anywhere;
}
.unread .title {
  font-weight: 700;
}
.message {
  color: var(--muted);
  font-size: 0.93rem;
  overflow-wrap: anywhere;
}
.time {
  color: #a88d6e;
  font-size: 0.82rem;
}
.chev {
  flex-shrink: 0;
  align-self: center;
  color: var(--muted);
}
.delete {
  flex-shrink: 0;
  color: var(--muted);
}
.delete:hover:not(:disabled) {
  color: var(--danger);
  background: var(--danger-soft);
}
.more-note {
  margin: 14px 0 0;
  text-align: center;
}
.prefs {
  list-style: none;
  margin: 20px 0 0;
  padding: 0;
}
.pref {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 0;
  border-top: 1px solid var(--border);
}
.pref-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.pref-label {
  font-weight: 600;
}
.pref-desc {
  color: var(--muted);
  font-size: 0.92rem;
}
.switch {
  position: relative;
  flex-shrink: 0;
  width: 50px;
  height: 30px;
  border-radius: 999px;
  border: 0;
  background: #e3d6c1;
  cursor: pointer;
  transition: background 0.15s;
}
.switch.on {
  background: var(--pink);
}
.switch:disabled {
  cursor: progress;
  opacity: 0.8;
}
.switch:focus-visible {
  border-radius: 999px;
}
.knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(60, 40, 20, 0.25);
  transition: transform 0.15s;
}
.switch.on .knob {
  transform: translateX(20px);
}
@media (max-width: 640px) {
  .panel {
    padding: 18px 14px;
  }
  .row-main {
    gap: 12px;
    padding: 12px 6px;
  }
  .chev {
    display: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .switch,
  .knob {
    transition: none;
  }
}
</style>
