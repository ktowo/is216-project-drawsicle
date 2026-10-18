<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import {
  BellOff,
  CheckCheck,
  Check,
  RotateCw,
  Trash2,
  Loader2,
  ChevronRight,
  ChevronDown,
  Filter,
} from 'lucide-vue-next';
import PageHeader from '@/components/ui/PageHeader.vue';
import TabNav from '@/components/ui/TabNav.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import {
  notifications,
  filtered,
  groupCounts,
  loadNotifications,
  loadMoreNotifications,
  loadFiltered,
  loadMoreFiltered,
  loadGroupCounts,
  markRead,
  markAllRead,
  removeNotification,
  notificationKind,
  isInternalLink,
  NOTIFICATION_GROUPS,
} from '@/stores/notifications';
import { auth, setUser } from '@/stores/auth';
import { toast } from '@/stores/toast';
import { api } from '@/api';
import { timeAgo, formatDateTime, toDate, pluralize } from '@/utils/format';

const PAGE = 30;

const route = useRoute();
const router = useRouter();

// ---------- Filters (kept in the URL so Back returns to the same view) ----------

const GROUP_KEYS = NOTIFICATION_GROUPS.map((g) => g.key);
const readShow = (value) => (value === 'unread' ? 'unread' : 'all');
const readType = (value) => (GROUP_KEYS.includes(value) ? value : '');

const show = ref(readShow(route.query.show));
const type = ref(readType(route.query.type));

watch([show, type], ([s, t]) => {
  const query = {};
  if (s !== 'all') query.show = s;
  if (t) query.type = t;
  router.replace({ query });
});
watch(
  () => [route.query.show, route.query.type],
  ([s, t]) => {
    if (route.name !== 'notifications') return;
    show.value = readShow(s);
    type.value = readType(t);
  }
);

const filtersOn = computed(() => show.value !== 'all' || Boolean(type.value));
const currentFilter = () => ({ show: show.value, group: type.value });

function clearFilters() {
  show.value = 'all';
  type.value = '';
}

// ---------- Loading ----------

const loading = ref(!notifications.loaded);
const error = ref('');
const moreError = ref('');
const markingAll = ref(false);
const busyId = ref(null);

async function load() {
  loading.value = true;
  error.value = '';
  moreError.value = '';
  loadGroupCounts(show.value);
  try {
    await Promise.all([loadNotifications(PAGE), filtersOn.value ? loadFiltered(currentFilter(), PAGE) : null]);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function loadMore() {
  moreError.value = '';
  try {
    if (filtersOn.value) await loadMoreFiltered(currentFilter(), PAGE);
    else await loadMoreNotifications(PAGE);
  } catch (e) {
    moreError.value = e.message;
  }
}

// Changing a filter asks the server for that filter's first page (and the chip counts for All/Unread)
const filterError = ref('');
watch([show, type], async ([s], [prevShow]) => {
  moreError.value = '';
  filterError.value = '';
  if (s !== prevShow) loadGroupCounts(s);
  if (!filtersOn.value) return;
  try {
    await loadFiltered(currentFilter(), PAGE);
  } catch (e) {
    filterError.value = e.message;
  }
});

// "3 hours ago" stays right while the page is open
const now = ref(Date.now());
const clock = setInterval(() => (now.value = Date.now()), 60000);
onBeforeUnmount(() => clearInterval(clock));

// ---------- What's shown ----------

const tabs = computed(() => [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread', count: notifications.unreadCount },
]);

// With a filter on, the list comes from the server already filtered; without one it's the shared list
const list = computed(() => (filtersOn.value ? filtered.items : notifications.items));
const listHasMore = computed(() => (filtersOn.value ? filtered.hasMore : notifications.hasMore));
const listLoadingMore = computed(() => (filtersOn.value ? filtered.loadingMore : notifications.loadingMore));
const filterLoading = computed(
  () => filtersOn.value && filtered.loading && filtered.key !== '' && !filtered.items.length
);

// Totals from the server, so they count everything and not just what's loaded
const typeOptions = computed(() => {
  const counts = groupCounts.key === show.value ? groupCounts.counts : null;
  return [
    { key: '', label: 'Every type', count: counts?.all },
    ...NOTIFICATION_GROUPS.map((g) => ({ ...g, count: counts?.[g.key] })),
  ];
});

const shown = list;

// Today / Yesterday / This week / Earlier, in the browser's time zone
const SECTIONS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'Earlier this week' },
  { key: 'earlier', label: 'Earlier' },
];

const sections = computed(() => {
  const today = new Date(now.value);
  const startOf = (daysBack) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysBack).getTime();
  const starts = { today: startOf(0), yesterday: startOf(1), week: startOf(6) };

  const buckets = { today: [], yesterday: [], week: [], earlier: [] };
  for (const n of shown.value) {
    const at = toDate(n.createdAt)?.getTime() ?? 0;
    if (at >= starts.today) buckets.today.push(n);
    else if (at >= starts.yesterday) buckets.yesterday.push(n);
    else if (at >= starts.week) buckets.week.push(n);
    else buckets.earlier.push(n);
  }
  return SECTIONS.filter((s) => buckets[s.key].length).map((s) => ({ ...s, items: buckets[s.key] }));
});

// More unread on the server than we can account for: something new arrived since loading
const hasNewer = computed(() => {
  if (!notifications.loaded) return false;
  const loadedUnread = notifications.items.filter((n) => !n.read).length;
  return notifications.unreadCount > loadedUnread + notifications.unreadBeyond;
});

const groupLabel = (n) => NOTIFICATION_GROUPS.find((g) => g.key === notificationKind(n.type).group)?.label || '';

const emptyCopy = computed(() => {
  if (!notifications.items.length) {
    return {
      icon: BellOff,
      title: 'No notifications yet',
      message:
        'When something happens in your events (an accepted sign-up, your match, a reminder or the big reveal) it shows up here.',
    };
  }
  const typeName = NOTIFICATION_GROUPS.find((g) => g.key === type.value)?.label.toLowerCase();
  if (show.value === 'unread' && !typeName) {
    return { icon: CheckCheck, title: "You're all caught up", message: 'Every notification has been read. Nice.' };
  }
  return {
    icon: Filter,
    title: 'Nothing matches these filters',
    message: `No ${show.value === 'unread' ? 'unread ' : ''}${typeName || ''} notifications right now.`,
  };
});

// ---------- Actions ----------

function rowId(n) {
  return `notification-${n.id}`;
}

function open(n) {
  markRead(n.id);
  if (isInternalLink(n.link)) router.push(n.link);
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
  // Where keyboard focus goes once the row is gone: the next row, else the previous, else the list heading
  const list = shown.value;
  const index = list.findIndex((x) => x.id === n.id);
  const neighbour = list[index + 1] || list[index - 1];

  busyId.value = n.id;
  try {
    await removeNotification(n.id);
    toast.success('Notification deleted.');
    await nextTick();
    const target = neighbour && document.getElementById(`${rowId(neighbour)}-delete`);
    (target || document.getElementById('inbox-heading'))?.focus();
  } catch (e) {
    toast.error(e.message);
  } finally {
    busyId.value = null;
  }
}

// ---------- Email preferences ----------

const PREFS = [
  {
    key: 'emailReminders',
    label: 'Deadline reminders',
    description:
      'Sign-ups closing soon (including events you asked to be reminded about) and submission deadlines for gifts you still owe.',
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
      <h2 id="inbox-heading" class="sr-only" tabindex="-1">Inbox</h2>

      <div class="panel-head">
        <TabNav v-model="show" :tabs="tabs" aria-label="Read or unread" />
        <button v-if="hasNewer && !loading" type="button" class="newer" @click="load">
          <RotateCw :size="14" aria-hidden="true" /> New notifications. Show them
        </button>
      </div>

      <div class="types" role="group" aria-label="Notification type">
        <button
          v-for="option in typeOptions"
          :key="option.key || 'all'"
          type="button"
          class="type-chip"
          :class="{ on: type === option.key }"
          :aria-pressed="type === option.key ? 'true' : 'false'"
          @click="type = option.key"
        >
          {{ option.label }}
          <template v-if="typeof option.count === 'number'">
            <span class="type-count" aria-hidden="true">{{ option.count }}</span>
            <span class="sr-only">({{ option.count }})</span>
          </template>
        </button>
      </div>

      <LoadingBlock v-if="loading && !notifications.loaded" label="Loading notifications…" />

      <ErrorBlock v-else-if="error && !notifications.items.length" :message="error" @retry="load" />

      <template v-else>
        <p v-if="error" class="alert alert-error list-alert" role="alert">
          Couldn't refresh: {{ error }}
        </p>
        <p v-if="filterError" class="alert alert-error list-alert" role="alert">
          Couldn't load this filter: {{ filterError }}
        </p>

        <LoadingBlock v-if="filterLoading" label="Loading notifications…" />

        <EmptyState
          v-else-if="!shown.length"
          :icon="emptyCopy.icon"
          :title="emptyCopy.title"
          :message="emptyCopy.message"
        >
          <button v-if="filtersOn" type="button" class="btn btn-outline btn-sm" @click="clearFilters">
            Show everything
          </button>
          <RouterLink v-if="!notifications.items.length" to="/events" class="btn btn-primary btn-sm">
            Browse events
          </RouterLink>
        </EmptyState>

        <div v-else class="sections">
          <section v-for="section in sections" :key="section.key" :aria-labelledby="`day-${section.key}`">
            <h3 :id="`day-${section.key}`" class="day">
              {{ section.label }}
              <span class="day-count">{{ section.items.length }}</span>
            </h3>
            <ul class="list">
              <li v-for="n in section.items" :key="n.id" class="row" :class="{ unread: !n.read }">
                <component
                  :is="isInternalLink(n.link) ? 'button' : 'div'"
                  :id="rowId(n)"
                  :type="isInternalLink(n.link) ? 'button' : undefined"
                  class="row-main"
                  :class="{ clickable: isInternalLink(n.link) }"
                  @click="isInternalLink(n.link) && open(n)"
                >
                  <span class="icon" :class="`tone-${notificationKind(n.type).tone}`" aria-hidden="true">
                    <component :is="notificationKind(n.type).icon" :size="19" />
                  </span>
                  <span class="body">
                    <span class="title">
                      <span v-if="!n.read" class="sr-only">Unread:</span>
                      {{ n.title }}
                    </span>
                    <span v-if="n.message" class="message">{{ n.message }}</span>
                    <span class="meta">
                      <time :datetime="n.createdAt" :title="formatDateTime(n.createdAt)">
                        {{ timeAgo(n.createdAt, now) }}
                      </time>
                      <span aria-hidden="true">·</span>
                      <span>{{ groupLabel(n) }}</span>
                    </span>
                  </span>
                  <span v-if="isInternalLink(n.link)" class="open-hint" aria-hidden="true">
                    <span class="open-text">Open</span>
                    <ChevronRight :size="18" />
                  </span>
                </component>

                <div class="row-actions">
                  <button
                    v-if="!n.read"
                    type="button"
                    class="btn btn-ghost btn-icon"
                    :aria-label="`Mark as read: ${n.title}`"
                    title="Mark as read"
                    @click="markRead(n.id)"
                  >
                    <Check :size="17" aria-hidden="true" />
                  </button>
                  <button
                    :id="`${rowId(n)}-delete`"
                    type="button"
                    class="btn btn-ghost btn-icon delete"
                    :disabled="busyId === n.id"
                    :aria-label="`Delete notification: ${n.title}`"
                    title="Delete"
                    @click="remove(n)"
                  >
                    <Loader2 v-if="busyId === n.id" :size="17" class="spin" aria-hidden="true" />
                    <Trash2 v-else :size="17" aria-hidden="true" />
                  </button>
                </div>
              </li>
            </ul>
          </section>
        </div>

        <div v-if="shown.length && !filterLoading" class="list-foot">
          <p v-if="moreError" class="alert alert-error" role="alert">{{ moreError }}</p>
          <button
            v-if="listHasMore"
            type="button"
            class="btn btn-outline btn-sm"
            :disabled="listLoadingMore"
            @click="loadMore"
          >
            <Loader2 v-if="listLoadingMore" :size="16" class="spin" aria-hidden="true" />
            <ChevronDown v-else :size="16" aria-hidden="true" />
            {{ listLoadingMore ? 'Loading…' : 'Load older notifications' }}
          </button>
          <p v-else class="hint end-note">
            That's everything{{ filtersOn ? ' for this filter' : '' }}: {{ pluralize(shown.length, 'notification') }}.
          </p>
        </div>
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
}
.newer {
  display: inline-flex;
  align-items: center;
  gap: 6px;
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
  background: var(--pink-line);
}
.types {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 16px 0 18px;
}
.type-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  border-radius: 999px;
  padding: 6px 12px;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
}
.type-chip:hover {
  border-color: var(--pink-line);
}
.type-chip.on {
  background: var(--pink-soft);
  border-color: var(--pink);
  color: var(--pink-dark);
}
.type-chip:focus-visible {
  border-radius: 999px;
}
.type-count {
  min-width: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--chip);
  color: var(--muted);
  font-size: 0.75rem;
  text-align: center;
}
.type-chip.on .type-count {
  background: var(--surface);
  color: var(--pink-dark);
}
.list-alert {
  margin: 0 0 12px;
}
.sections {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.day {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 4px;
  padding: 0 10px;
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}
.day-count {
  padding: 0 7px;
  border-radius: 999px;
  background: var(--chip);
  font-size: 0.72rem;
  letter-spacing: 0;
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
  border-radius: 14px;
}
.row:first-child {
  border-top: 0;
}
.row.unread {
  background: var(--pink-tint);
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
  font: inherit;
}
.row-main.clickable {
  cursor: pointer;
}
.row-main.clickable:hover {
  background: var(--hover);
}
.row-main:focus-visible {
  border-radius: 14px;
}
.icon {
  position: relative;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
}
.tone-pink {
  background: var(--pink-soft);
  color: var(--pink-dark);
}
.tone-info {
  background: var(--info-soft);
  color: var(--info);
}
.tone-success {
  background: var(--success-soft);
  color: var(--success);
}
.tone-warning {
  background: var(--warning-soft);
  color: var(--warning);
}
.tone-muted {
  background: var(--chip);
  color: var(--muted);
}
.unread .icon::after {
  content: '';
  position: absolute;
  top: -3px;
  right: -3px;
  width: 11px;
  height: 11px;
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
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--subtle);
  font-size: 0.82rem;
}
.open-hint {
  flex-shrink: 0;
  align-self: center;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--muted);
  font-size: 0.88rem;
  font-weight: 600;
}
.row-main.clickable:hover .open-hint {
  color: var(--pink-dark);
}
.row-actions {
  display: flex;
  flex-shrink: 0;
  gap: 2px;
  padding-right: 4px;
}
.row-actions .btn {
  color: var(--muted);
}
.row-actions .btn:hover:not(:disabled) {
  color: var(--success);
  background: var(--success-soft);
}
.row-actions .delete:hover:not(:disabled) {
  color: var(--danger);
  background: var(--danger-soft);
}
.list-foot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
}
.list-foot .alert {
  margin: 0;
  align-self: stretch;
}
.end-note {
  margin: 0;
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
  background: var(--border-strong);
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
  background: var(--surface);
  box-shadow: 0 1px 3px rgba(60, 40, 20, 0.25);
  transition: transform 0.15s;
}
.switch.on .knob {
  transform: translateX(20px);
}
@media (max-width: 640px) {
  .panel {
    padding: 18px 12px;
  }
  .types {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
    margin-inline: -12px;
    padding: 2px 12px;
  }
  .types::-webkit-scrollbar {
    display: none;
  }
  .type-chip {
    flex-shrink: 0;
  }
  .row {
    align-items: flex-start;
  }
  .row-main {
    gap: 12px;
    padding: 12px 6px;
  }
  .row-actions {
    flex-direction: column;
    padding-top: 8px;
  }
  .open-text {
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
