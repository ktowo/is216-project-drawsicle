<script setup>
import { ref, reactive, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { useRoute, useRouter, RouterLink, onBeforeRouteLeave } from 'vue-router';
import { CalendarSearch, Globe, Lock, Loader2, Save, Info, TriangleAlert, Clock } from 'lucide-vue-next';
import PageHeader from '@/components/ui/PageHeader.vue';
import FormField from '@/components/ui/FormField.vue';
import TagInput from '@/components/ui/TagInput.vue';
import ChoiceChips from '@/components/ui/ChoiceChips.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import BannerUploader from '@/components/events/manage/BannerUploader.vue';
import { PLATFORMS, SEASONS, CREATION_TYPES, LIMITS } from '@shared/constants.mjs';
import { api } from '@/api';
import { toast } from '@/stores/toast';
import { toLocalInput, fromLocalInput, formatDateTime, pluralize } from '@/utils/format';
import { eventLink, isHttpUrl, platformLabel } from '@/utils/events';

const route = useRoute();
const router = useRouter();

const isEdit = computed(() => route.name === 'event-edit');

const PLATFORM_TEXT_MAX = 100;
const PLATFORM_LINK_MAX = 500;
const TAG_SUGGESTIONS = ['sfw', 'oc friendly', 'fanart', 'furry', 'anthro', 'humanoid', 'fantasy', 'beginner friendly'];
const ALL_TYPES = CREATION_TYPES.map((t) => t.value);

// Fields the server only accepts changes to while sign-ups are open (FIELD_LOCKED otherwise)
const OPEN_ONLY = ['allowedTypes', 'requireApproval', 'minParticipants', 'maxParticipants', 'publicity'];

// ---- Defaults ----
function defaultDates() {
  const signup = new Date();
  signup.setDate(signup.getDate() + 14);
  signup.setHours(23, 59, 0, 0);
  const submission = new Date(signup);
  submission.setDate(submission.getDate() + 30);
  return { signup, submission };
}

function blankForm() {
  const { signup, submission } = defaultDates();
  return {
    name: '',
    theme: '',
    season: 'other',
    description: '',
    rules: '',
    tags: [],
    platform: 'discord',
    platformName: '',
    platformLink: '',
    signupDeadline: toLocalInput(signup),
    submissionDeadline: toLocalInput(submission),
    minParticipants: 3,
    maxParticipants: 50,
    allowedTypes: [...ALL_TYPES],
    requireApproval: false,
    publicity: 'public',
  };
}

function formFromEvent(ev) {
  return {
    name: ev.name || '',
    theme: ev.theme || '',
    season: ev.season || 'other',
    description: ev.description || '',
    rules: ev.rules || '',
    tags: [...(ev.tags || [])],
    platform: ev.platform || 'discord',
    platformName: ev.platformName || '',
    platformLink: ev.platformLink || '',
    signupDeadline: toLocalInput(ev.signupDeadline),
    submissionDeadline: toLocalInput(ev.submissionDeadline),
    minParticipants: ev.minParticipants,
    maxParticipants: ev.maxParticipants,
    allowedTypes: [...(ev.allowedTypes || [])],
    requireApproval: Boolean(ev.requireApproval),
    publicity: ev.publicity || 'public',
  };
}

// What the form would send. Dates stay as datetime-local strings here so an untouched
// deadline compares equal to the original (the input drops seconds).
function bodyFrom(f) {
  const order = (list) => ALL_TYPES.filter((t) => list.includes(t));
  return {
    name: f.name.trim(),
    theme: f.theme.trim(),
    season: f.season,
    description: f.description.trim(),
    rules: f.rules.trim(),
    tags: [...f.tags],
    platform: f.platform,
    platformName: f.platformName.trim(),
    platformLink: f.platformLink.trim(),
    signupDeadline: f.signupDeadline,
    submissionDeadline: f.submissionDeadline,
    minParticipants: toCount(f.minParticipants),
    maxParticipants: toCount(f.maxParticipants),
    allowedTypes: order(f.allowedTypes),
    requireApproval: Boolean(f.requireApproval),
    publicity: f.publicity,
  };
}

function toCount(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- State ----
const form = reactive(blankForm());
const event = ref(null); // the saved event when editing
const original = ref(bodyFrom(form));
const loading = ref(false);
const loadError = ref('');
const notFound = ref(false);
const saving = ref(false);
const saved = ref(false);
const errors = ref({});
const submitError = ref(null); // { title, message }
const errorSummary = ref(null);

const status = computed(() => (isEdit.value ? event.value?.status || 'draft' : 'draft'));
const readOnly = computed(() => isEdit.value && status.value === 'completed');
const signupsStage = computed(() => status.value === 'draft' || status.value === 'open');
const openOnlyLocked = computed(() => !readOnly.value && !signupsStage.value);
// Sign-ups are long over once matches are published, so the date stops meaning anything
const signupLocked = computed(() => readOnly.value || status.value === 'active');
const dirty = computed(() => !saved.value && !sameValue(bodyFrom(form), original.value));

function resetForm(values) {
  Object.assign(form, values);
  original.value = bodyFrom(form);
  errors.value = {};
  submitError.value = null;
}

let requestId = 0;
async function load() {
  const id = ++requestId;
  saved.value = false;
  submitError.value = null;
  errors.value = {};
  notFound.value = false;
  loadError.value = '';

  if (!isEdit.value) {
    event.value = null;
    resetForm(blankForm());
    loading.value = false;
    return;
  }

  loading.value = true;
  try {
    const data = await api(`/events/${route.params.id}`);
    if (id !== requestId) return;
    if (!data.event?.viewer?.isOrganizer) {
      router.replace({ name: 'forbidden' });
      return;
    }
    event.value = data.event;
    resetForm(formFromEvent(data.event));
    document.title = `Edit ${data.event.name} · Drawisicle`;
  } catch (e) {
    if (id !== requestId) return;
    if (e.status === 404 || e.code === 'INVALID_ID') notFound.value = true;
    else if (e.status === 403) router.replace({ name: 'forbidden' });
    else loadError.value = e.message;
  } finally {
    if (id === requestId) loading.value = false;
  }
}

watch(
  () => [route.name, route.params.id],
  () => {
    // The watcher can fire on the way out to another page; only this page's routes load
    if (route.name === 'event-new' || route.name === 'event-edit') load();
  },
  { immediate: true }
);

// ---- Dates ----
const timeZone = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
})();

function utcOffset(date = new Date()) {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  return `UTC${sign}${hours}${rest ? `:${String(rest).padStart(2, '0')}` : ''}`;
}
const zoneText = timeZone ? `${timeZone.replace(/_/g, ' ')} (${utcOffset()})` : utcOffset();

const now = ref(Date.now());
const clock = setInterval(() => (now.value = Date.now()), 60 * 1000);
onBeforeUnmount(() => clearInterval(clock));

const signupDate = computed(() => fromLocalInput(form.signupDeadline));
const submissionDate = computed(() => fromLocalInput(form.submissionDeadline));
const signupChanged = computed(() => form.signupDeadline !== original.value.signupDeadline);
const submissionChanged = computed(() => form.submissionDeadline !== original.value.submissionDeadline);
const signupMustBeFuture = computed(() => !isEdit.value || (signupsStage.value && signupChanged.value));
const minSignupInput = computed(() => (signupMustBeFuture.value ? toLocalInput(now.value) : undefined));
const minSubmissionInput = computed(() => form.signupDeadline || undefined);

const giftWindow = computed(() => {
  if (!signupDate.value || !submissionDate.value) return '';
  const days = (new Date(submissionDate.value) - new Date(signupDate.value)) / (24 * 60 * 60 * 1000);
  if (days <= 0) return '';
  if (days < 1) return 'Artists get less than a day to make their gifts.';
  return `Artists get about ${pluralize(Math.round(days), 'day')} to make their gifts after matching.`;
});

// Saved deadline already in the past while sign-ups haven't closed yet
const staleSignup = computed(
  () =>
    isEdit.value &&
    signupsStage.value &&
    !signupChanged.value &&
    signupDate.value &&
    new Date(signupDate.value).getTime() <= now.value
);

// ---- Hints for locked fields ----
const lockedHint = computed(() => {
  if (readOnly.value) return '';
  if (openOnlyLocked.value) return "Locked: matching depends on this, so it can't change after sign-ups close.";
  return '';
});

const signupHint = computed(() => {
  if (status.value === 'active') return 'Sign-ups are over and matches are out, so this date is locked.';
  if (status.value === 'matching') return 'Sign-ups are closed. This date only matters if you reopen sign-ups.';
  if (staleSignup.value) {
    return status.value === 'draft'
      ? 'This date has passed. Pick a new one before you open sign-ups.'
      : 'This date has passed, so sign-ups close automatically within the hour.';
  }
  return 'Sign-ups close automatically at this time and matching can begin.';
});

const submissionHint = computed(() => {
  if (status.value === 'active') return 'Moving it later gives everyone more time. Participants are told about the change.';
  if (status.value === 'open' || status.value === 'matching') {
    return 'Accepted participants are told if you change a deadline.';
  }
  return 'Gifts submitted after this are marked late.';
});

// ---- Choice lists ----
const typeOptions = CREATION_TYPES.map((t) => ({ value: t.value, label: t.label }));
const communityLabel = computed(() => (form.platform === 'other' ? 'your community' : platformLabel(form.platform)));
const platformNamePlaceholder = computed(() => {
  const examples = {
    discord: 'e.g. Cozy Critters Discord',
    deviantart: 'e.g. Cozy-Critters group',
    toyhouse: 'e.g. Cozy Critters world',
    tumblr: 'e.g. cozycritters',
    instagram: 'e.g. @cozycritters',
    twitter: 'e.g. @cozycritters',
    bluesky: 'e.g. cozycritters.bsky.social',
  };
  return examples[form.platform] || 'e.g. Cozy Critters forum';
});

// ---- Validation (mirrors server/routes/event-router.js and models/Event.js) ----
const counter = (value, max) => `${value.trim().length} / ${max}`;

function textError(value, label, max) {
  return value.trim().length > max ? `${label} is too long (max ${max} characters).` : '';
}

function validate() {
  const e = {};
  const body = bodyFrom(form);
  const { minParticipantsFloor: floor, maxParticipantsCeiling: ceiling } = LIMITS;

  if (!body.name) e.name = 'Give your event a name.';
  else if (body.name.length > LIMITS.eventName) e.name = `Name is too long (max ${LIMITS.eventName} characters).`;
  const lengthChecks = [
    ['theme', 'Theme', LIMITS.theme],
    ['description', 'Description', LIMITS.eventDescription],
    ['rules', 'Rules', LIMITS.eventRules],
    ['platformName', 'Community name', PLATFORM_TEXT_MAX],
  ];
  for (const [key, label, max] of lengthChecks) {
    const message = textError(form[key], label, max);
    if (message) e[key] = message;
  }
  if (body.platformLink.length > PLATFORM_LINK_MAX) {
    e.platformLink = `Community link is too long (max ${PLATFORM_LINK_MAX} characters).`;
  } else if (body.platformLink && !isHttpUrl(body.platformLink)) {
    e.platformLink = 'Community link must start with http:// or https://';
  }
  if (form.tags.length > LIMITS.tags) e.tags = `Up to ${LIMITS.tags} tags.`;

  const signup = signupDate.value ? new Date(signupDate.value).getTime() : null;
  const submission = submissionDate.value ? new Date(submissionDate.value).getTime() : null;
  const current = Date.now();
  if (!signup) e.signupDeadline = 'Pick when sign-ups close.';
  else if (signupMustBeFuture.value && signup <= current) e.signupDeadline = 'The sign-up deadline must be in the future.';
  if (!submission) e.submissionDeadline = 'Pick when gifts are due.';
  else if (submissionChanged.value && submission <= current) {
    e.submissionDeadline = 'The submission deadline must be in the future.';
  } else if (signup && submission <= signup) {
    e.submissionDeadline = 'The submission deadline must be after sign-ups close.';
  }

  if (!openOnlyLocked.value && !readOnly.value) {
    const min = body.minParticipants;
    const max = body.maxParticipants;
    const inRange = (n) => Number.isInteger(n) && n >= floor && n <= ceiling;
    if (!inRange(min)) e.minParticipants = `Use a whole number from ${floor} to ${ceiling}.`;
    if (!inRange(max)) e.maxParticipants = `Use a whole number from ${floor} to ${ceiling}.`;
    else if (inRange(min) && max < min) e.maxParticipants = 'The maximum must be at least the minimum.';
    else if (isEdit.value && max < (event.value?.participantCount || 0)) {
      e.maxParticipants = `${pluralize(event.value.participantCount, 'person is', 'people are')} already accepted, so the maximum can't be lower than that.`;
    }
    if (!body.allowedTypes.length) e.allowedTypes = 'Allow at least one kind of creation.';
  }

  errors.value = e;
  checkedBody = body;
  return Object.keys(e).length === 0;
}

// Clear an error as soon as its field differs from what was checked (or sent to the server)
let checkedBody = null;
watch(
  () => bodyFrom(form),
  (next) => {
    if (!checkedBody || !Object.keys(errors.value).length) return;
    const cleared = { ...errors.value };
    let changed = false;
    for (const key of Object.keys(cleared)) {
      if (key in next && !sameValue(next[key], checkedBody[key])) {
        delete cleared[key];
        changed = true;
      }
    }
    if (changed) errors.value = cleared;
  }
);

// ---- Server errors to fields ----
const FIELD_PATTERNS = [
  [/^Name\b|event a name/i, 'name'],
  [/^Description/i, 'description'],
  [/^Theme/i, 'theme'],
  [/^Rules/i, 'rules'],
  [/^Community name/i, 'platformName'],
  [/^Community link/i, 'platformLink'],
  [/community platform/i, 'platform'],
  [/season/i, 'season'],
  [/sign-up deadline/i, 'signupDeadline'],
  [/submission deadline/i, 'submissionDeadline'],
  [/^Minimum participants/i, 'minParticipants'],
  [/^Maximum participants|the maximum/i, 'maxParticipants'],
  [/creation/i, 'allowedTypes'],
  [/^Approval|Require approval/i, 'requireApproval'],
  [/^Publicity/i, 'publicity'],
];

function fieldFor(message) {
  return FIELD_PATTERNS.find(([re]) => re.test(message || ''))?.[1] || null;
}

const FIELD_IDS = {
  name: 'ev-name',
  theme: 'ev-theme',
  season: 'ev-season',
  description: 'ev-description',
  rules: 'ev-rules',
  tags: 'ev-tags',
  platform: 'ev-platform',
  platformName: 'ev-platform-name',
  platformLink: 'ev-platform-link',
  signupDeadline: 'ev-signup',
  submissionDeadline: 'ev-submission',
  minParticipants: 'ev-min',
  maxParticipants: 'ev-max',
  allowedTypes: 'ev-types',
  requireApproval: 'ev-approval',
  publicity: 'ev-publicity-public',
};

const FIELD_NAMES = {
  name: 'Name',
  theme: 'Theme',
  season: 'Season',
  description: 'Description',
  rules: 'Rules',
  tags: 'Tags',
  platform: 'Platform',
  platformName: 'Community name',
  platformLink: 'Community link',
  signupDeadline: 'Sign-ups close',
  submissionDeadline: 'Gifts due',
  minParticipants: 'Minimum participants',
  maxParticipants: 'Maximum participants',
  allowedTypes: 'What people can make',
  requireApproval: 'Approval',
  publicity: 'Who can see it',
};

const errorList = computed(() =>
  Object.entries(errors.value).map(([key, message]) => ({ key, label: FIELD_NAMES[key] || key, message }))
);

function focusField(key) {
  const el = document.getElementById(FIELD_IDS[key]);
  if (!el) return;
  // ChoiceChips is a group: focus its first chip
  const target = el.matches('input, select, textarea, button') ? el : el.querySelector('button, input');
  target?.focus();
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function focusSummary() {
  await nextTick();
  errorSummary.value?.focus();
  errorSummary.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Sign-ups closed (or the event finished) while the form was open: take the server's
// values for the fields that are now locked so the next save goes through.
async function refreshLocks() {
  try {
    const data = await api(`/events/${route.params.id}`);
    event.value = data.event;
    const fresh = formFromEvent(data.event);
    const freshBody = bodyFrom(fresh);
    const locked = data.event.status === 'draft' || data.event.status === 'open' ? [] : OPEN_ONLY;
    for (const key of locked) {
      form[key] = fresh[key];
      original.value = { ...original.value, [key]: freshBody[key] };
    }
  } catch {
    // keep what we have; the error summary already explains the problem
  }
}

// ---- Save ----
function buildPayload() {
  const body = bodyFrom(form);
  let payload = body;
  if (isEdit.value) {
    // Only what changed, so untouched deadlines don't trigger "new deadline" notifications
    payload = Object.fromEntries(Object.entries(body).filter(([key, value]) => !sameValue(value, original.value[key])));
    if (openOnlyLocked.value) for (const key of OPEN_ONLY) delete payload[key];
    if (signupLocked.value) delete payload.signupDeadline;
  }
  if ('signupDeadline' in payload) payload.signupDeadline = fromLocalInput(payload.signupDeadline);
  if ('submissionDeadline' in payload) payload.submissionDeadline = fromLocalInput(payload.submissionDeadline);
  return payload;
}

async function submit() {
  if (readOnly.value || saving.value) return;
  submitError.value = null;
  if (!validate()) {
    submitError.value = { title: 'Check the highlighted fields', message: 'Some answers need fixing before you can save.' };
    return focusSummary();
  }

  const payload = buildPayload();
  if (isEdit.value && !Object.keys(payload).length) {
    saved.value = true;
    toast.info('Nothing changed.');
    router.push(eventLink(event.value, '/manage'));
    return;
  }

  saving.value = true;
  try {
    if (isEdit.value) {
      const data = await api(`/events/${event.value.id}`, { method: 'PATCH', body: payload });
      saved.value = true;
      toast.success('Changes saved.');
      router.push(eventLink(data.event || event.value, '/manage'));
    } else {
      const data = await api('/events', { method: 'POST', body: payload });
      saved.value = true;
      toast.success('Draft saved. Open sign-ups when you are ready.');
      router.push(eventLink(data.event, '/manage'));
    }
  } catch (e) {
    handleSaveError(e);
  } finally {
    saving.value = false;
  }
}

function handleSaveError(e) {
  if (e.status === 401) {
    submitError.value = {
      title: 'You were logged out',
      message: 'Log in again in another tab, then save. Your answers are still here.',
    };
    return focusSummary();
  }
  if (e.status === 403) {
    saved.value = true;
    toast.error("You're no longer an organiser of this event.");
    router.replace({ name: 'forbidden' });
    return;
  }
  if (e.status === 404) {
    saved.value = true;
    notFound.value = true;
    return;
  }
  if (e.code === 'EVENT_LOCKED') {
    submitError.value = { title: 'This event is completed', message: e.message };
    refreshLocks();
    return focusSummary();
  }

  const field = fieldFor(e.message);
  if (field && (e.code === 'VALIDATION' || e.code === 'FIELD_LOCKED')) {
    errors.value = { ...errors.value, [field]: e.message };
  }
  if (e.code === 'FIELD_LOCKED') {
    submitError.value = {
      title: 'Sign-ups closed while you were editing',
      message: `${e.message} Those settings have been reset to their saved values, so you can save the rest now.`,
    };
    refreshLocks();
  } else {
    submitError.value = { title: "Couldn't save the event", message: e.message };
  }
  focusSummary();
}

function cancel() {
  router.push(isEdit.value && event.value ? eventLink(event.value, '/manage') : '/my-events');
}

// ---- Leaving with unsaved changes ----
onBeforeRouteLeave(() => {
  if (dirty.value && !window.confirm('Leave this page? Your changes to the event have not been saved.')) return false;
});

function beforeUnload(e) {
  if (dirty.value) e.preventDefault();
}
window.addEventListener('beforeunload', beforeUnload);
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));

function onBannerUpdated(updated) {
  if (updated) event.value = { ...event.value, ...updated };
}

const backLink = computed(() => (isEdit.value && event.value ? eventLink(event.value, '/manage') : '/my-events'));
</script>

<template>
  <main class="page narrow">
    <LoadingBlock v-if="loading" label="Loading event…" />

    <EmptyState
      v-else-if="notFound"
      :icon="CalendarSearch"
      title="Event not found"
      message="It may have been deleted, or the link is wrong."
    >
      <RouterLink to="/my-events" class="btn btn-primary">Go to my events</RouterLink>
    </EmptyState>

    <ErrorBlock v-else-if="loadError" :message="loadError" @retry="load" />

    <template v-else>
      <PageHeader
        :title="isEdit ? 'Edit event' : 'Create an event'"
        :subtitle="
          isEdit
            ? event?.name || ''
            : 'Set up the basics now. It stays a private draft until you open sign-ups from the manage page.'
        "
        :back="backLink"
        :back-label="isEdit ? 'Back to manage' : 'My events'"
      >
        <StatusBadge v-if="isEdit && event" :status="event.status" />
      </PageHeader>

      <p v-if="readOnly" class="alert alert-info notice">
        <Info :size="18" aria-hidden="true" />
        <span>This event is completed, so its details can no longer be changed.</span>
      </p>
      <p v-else-if="openOnlyLocked" class="alert alert-info notice">
        <Info :size="18" aria-hidden="true" />
        <span>
          Sign-ups have closed, so the participant limits, creation types, approval and publicity are locked. You can
          still change the text and the submission deadline.
        </span>
      </p>

      <form class="event-form" novalidate @submit.prevent="submit">
        <div
          v-if="submitError"
          ref="errorSummary"
          class="alert alert-error summary"
          role="alert"
          tabindex="-1"
        >
          <p class="summary-title">{{ submitError.title }}</p>
          <p class="summary-text">{{ submitError.message }}</p>
          <ul v-if="errorList.length" class="summary-list">
            <li v-for="item in errorList" :key="item.key">
              <button type="button" class="summary-link" @click="focusField(item.key)">
                {{ item.label }}: {{ item.message }}
              </button>
            </li>
          </ul>
        </div>

        <fieldset class="plain" :disabled="readOnly">
          <!-- Basics -->
          <section class="card section" aria-labelledby="sec-basics">
            <h2 id="sec-basics" class="section-title">Basics</h2>

            <FormField label="Event name" for-id="ev-name" :error="errors.name" required>
              <template #aside>
                <span class="hint">{{ counter(form.name, LIMITS.eventName) }}</span>
              </template>
              <template #default="{ describedby, invalid }">
                <div class="input-wrap" :class="{ 'is-invalid': invalid }">
                  <input
                    id="ev-name"
                    v-model="form.name"
                    class="input"
                    type="text"
                    autocomplete="off"
                    placeholder="e.g. Winter Secret Santa 2026"
                    :maxlength="LIMITS.eventName + 20"
                    :aria-invalid="invalid"
                    :aria-describedby="describedby"
                    required
                  />
                </div>
              </template>
            </FormField>

            <div class="pair">
              <FormField
                label="Theme"
                for-id="ev-theme"
                hint="Optional. A prompt to inspire everyone."
                :error="errors.theme"
              >
                <template #default="{ describedby, invalid }">
                  <div class="input-wrap" :class="{ 'is-invalid': invalid }">
                    <input
                      id="ev-theme"
                      v-model="form.theme"
                      class="input"
                      type="text"
                      autocomplete="off"
                      placeholder="e.g. Cosy winter nights"
                      :maxlength="LIMITS.theme + 20"
                      :aria-invalid="invalid"
                      :aria-describedby="describedby"
                    />
                  </div>
                </template>
              </FormField>

              <FormField label="Season" for-id="ev-season" hint="Used for filtering on Browse events." :error="errors.season">
                <template #default="{ describedby }">
                  <div class="input-wrap">
                    <select id="ev-season" v-model="form.season" class="select" :aria-describedby="describedby">
                      <option v-for="s in SEASONS" :key="s.value" :value="s.value">{{ s.label }}</option>
                    </select>
                  </div>
                </template>
              </FormField>
            </div>

            <FormField
              label="Description"
              for-id="ev-description"
              hint="What the exchange is about and who it's for. Shown at the top of the event page."
              :error="errors.description"
            >
              <template #aside>
                <span class="hint" :class="{ 'text-danger': form.description.trim().length > LIMITS.eventDescription }">
                  {{ counter(form.description, LIMITS.eventDescription) }}
                </span>
              </template>
              <template #default="{ describedby, invalid }">
                <div class="input-wrap" :class="{ 'is-invalid': invalid }">
                  <textarea
                    id="ev-description"
                    v-model="form.description"
                    class="textarea"
                    rows="5"
                    :aria-invalid="invalid"
                    :aria-describedby="describedby"
                  />
                </div>
              </template>
            </FormField>

            <FormField
              label="Rules"
              for-id="ev-rules"
              hint="Content guidelines, minimum effort, what counts as a finished gift, and so on."
              :error="errors.rules"
            >
              <template #aside>
                <span class="hint" :class="{ 'text-danger': form.rules.trim().length > LIMITS.eventRules }">
                  {{ counter(form.rules, LIMITS.eventRules) }}
                </span>
              </template>
              <template #default="{ describedby, invalid }">
                <div class="input-wrap" :class="{ 'is-invalid': invalid }">
                  <textarea
                    id="ev-rules"
                    v-model="form.rules"
                    class="textarea short"
                    rows="4"
                    placeholder="e.g. SFW only. At least a coloured sketch. Be kind!"
                    :aria-invalid="invalid"
                    :aria-describedby="describedby"
                  />
                </div>
              </template>
            </FormField>

            <FormField
              label="Tags"
              for-id="ev-tags"
              :hint="`Optional, up to ${LIMITS.tags}. Press Enter or comma after each one.`"
              :error="errors.tags"
            >
              <template #default="{ describedby }">
                <TagInput
                  id="ev-tags"
                  v-model="form.tags"
                  :max="LIMITS.tags"
                  :suggestions="TAG_SUGGESTIONS"
                  :disabled="readOnly"
                  placeholder="e.g. sfw, fantasy"
                  :aria-describedby="describedby"
                />
              </template>
            </FormField>
          </section>

          <!-- Community -->
          <section class="card section" aria-labelledby="sec-community">
            <h2 id="sec-community" class="section-title">Community</h2>
            <p class="hint section-hint">Where your participants hang out, so they know where to find each other.</p>

            <div class="pair">
              <FormField label="Platform" for-id="ev-platform" :error="errors.platform">
                <template #default="{ describedby }">
                  <div class="input-wrap">
                    <select id="ev-platform" v-model="form.platform" class="select" :aria-describedby="describedby">
                      <option v-for="p in PLATFORMS" :key="p.value" :value="p.value">{{ p.label }}</option>
                    </select>
                  </div>
                </template>
              </FormField>

              <FormField
                label="Community name"
                for-id="ev-platform-name"
                hint="Optional."
                :error="errors.platformName"
              >
                <template #default="{ describedby, invalid }">
                  <div class="input-wrap" :class="{ 'is-invalid': invalid }">
                    <input
                      id="ev-platform-name"
                      v-model="form.platformName"
                      class="input"
                      type="text"
                      autocomplete="off"
                      :placeholder="platformNamePlaceholder"
                      :maxlength="PLATFORM_TEXT_MAX + 20"
                      :aria-invalid="invalid"
                      :aria-describedby="describedby"
                    />
                  </div>
                </template>
              </FormField>
            </div>

            <FormField
              label="Community link"
              for-id="ev-platform-link"
              :hint="`Optional. An invite or page link for ${communityLabel}, starting with https://`"
              :error="errors.platformLink"
            >
              <template #default="{ describedby, invalid }">
                <div class="input-wrap" :class="{ 'is-invalid': invalid }">
                  <input
                    id="ev-platform-link"
                    v-model="form.platformLink"
                    class="input"
                    type="url"
                    inputmode="url"
                    autocomplete="off"
                    placeholder="https://"
                    :maxlength="PLATFORM_LINK_MAX + 20"
                    :aria-invalid="invalid"
                    :aria-describedby="describedby"
                  />
                </div>
              </template>
            </FormField>
          </section>

          <!-- Dates -->
          <section class="card section" aria-labelledby="sec-dates">
            <h2 id="sec-dates" class="section-title">Dates</h2>
            <p class="hint section-hint zone">
              <Clock :size="15" aria-hidden="true" />
              <span>
                Times are in your time zone, {{ zoneText }}. Everyone else sees them in their own time zone.
              </span>
            </p>

            <div class="pair">
              <FormField
                label="Sign-ups close"
                for-id="ev-signup"
                :hint="signupHint"
                :error="errors.signupDeadline"
                required
              >
                <template #default="{ describedby, invalid }">
                  <div class="input-wrap" :class="{ 'is-invalid': invalid, 'is-disabled': signupLocked }">
                    <input
                      id="ev-signup"
                      v-model="form.signupDeadline"
                      class="input"
                      type="datetime-local"
                      :min="minSignupInput"
                      :disabled="signupLocked"
                      :aria-invalid="invalid"
                      :aria-describedby="describedby"
                      required
                    />
                  </div>
                </template>
              </FormField>

              <FormField
                label="Gifts due"
                for-id="ev-submission"
                :hint="submissionHint"
                :error="errors.submissionDeadline"
                required
              >
                <template #default="{ describedby, invalid }">
                  <div class="input-wrap" :class="{ 'is-invalid': invalid }">
                    <input
                      id="ev-submission"
                      v-model="form.submissionDeadline"
                      class="input"
                      type="datetime-local"
                      :min="minSubmissionInput"
                      :aria-invalid="invalid"
                      :aria-describedby="describedby"
                      required
                    />
                  </div>
                </template>
              </FormField>
            </div>

            <p v-if="staleSignup && status === 'draft'" class="alert alert-warning inline-note">
              <TriangleAlert :size="18" aria-hidden="true" />
              <span>The sign-up deadline ({{ formatDateTime(event?.signupDeadline) }}) has passed.</span>
            </p>
            <p v-else-if="giftWindow" class="hint m-0 mt-4">{{ giftWindow }}</p>
          </section>

          <!-- Participants -->
          <section class="card section" aria-labelledby="sec-people">
            <h2 id="sec-people" class="section-title">Participants</h2>
            <p v-if="lockedHint" class="hint section-hint">{{ lockedHint }}</p>

            <div class="pair">
              <FormField
                label="Minimum participants"
                for-id="ev-min"
                :hint="`Matching needs at least this many accepted artists (${LIMITS.minParticipantsFloor} or more).`"
                :error="errors.minParticipants"
                required
              >
                <template #default="{ describedby, invalid }">
                  <div class="input-wrap" :class="{ 'is-invalid': invalid, 'is-disabled': openOnlyLocked }">
                    <input
                      id="ev-min"
                      v-model.number="form.minParticipants"
                      class="input"
                      type="number"
                      inputmode="numeric"
                      step="1"
                      :min="LIMITS.minParticipantsFloor"
                      :max="LIMITS.maxParticipantsCeiling"
                      :disabled="openOnlyLocked"
                      :aria-invalid="invalid"
                      :aria-describedby="describedby"
                      required
                    />
                  </div>
                </template>
              </FormField>

              <FormField
                label="Maximum participants"
                for-id="ev-max"
                :hint="
                  isEdit && event?.participantCount
                    ? `Sign-ups stop when this many are accepted. ${event.participantCount} accepted so far.`
                    : `Sign-ups stop when this many are accepted (up to ${LIMITS.maxParticipantsCeiling}).`
                "
                :error="errors.maxParticipants"
                required
              >
                <template #default="{ describedby, invalid }">
                  <div class="input-wrap" :class="{ 'is-invalid': invalid, 'is-disabled': openOnlyLocked }">
                    <input
                      id="ev-max"
                      v-model.number="form.maxParticipants"
                      class="input"
                      type="number"
                      inputmode="numeric"
                      step="1"
                      :min="LIMITS.minParticipantsFloor"
                      :max="LIMITS.maxParticipantsCeiling"
                      :disabled="openOnlyLocked"
                      :aria-invalid="invalid"
                      :aria-describedby="describedby"
                      required
                    />
                  </div>
                </template>
              </FormField>
            </div>

            <fieldset class="group">
              <legend id="ev-types-label" class="label">What can people make? <span class="req" aria-hidden="true">*</span></legend>
              <p id="ev-types-hint" class="hint">
                Participants pick from these when they sign up, and only get a match who wants something they can make.
              </p>
              <ChoiceChips
                id="ev-types"
                v-model="form.allowedTypes"
                :options="typeOptions"
                :disabled="openOnlyLocked || readOnly"
                aria-labelledby="ev-types-label"
                aria-describedby="ev-types-hint"
              />
              <p v-if="errors.allowedTypes" class="field-error m-0" role="alert">{{ errors.allowedTypes }}</p>
            </fieldset>

            <div class="toggle-row">
              <label class="switch" for="ev-approval">
                <input
                  id="ev-approval"
                  v-model="form.requireApproval"
                  type="checkbox"
                  role="switch"
                  :disabled="openOnlyLocked"
                  aria-describedby="ev-approval-hint"
                />
                <span class="track" aria-hidden="true"><span class="thumb" /></span>
                <span class="font-semibold">Review sign-ups before accepting them</span>
              </label>
              <p id="ev-approval-hint" class="hint m-0">
                <template v-if="form.requireApproval">
                  On: new sign-ups wait for you to accept or reject them on the Participants tab, and you're notified of
                  each one.
                </template>
                <template v-else>
                  Off: everyone who signs up is accepted straight away. You can still remove people until matches are
                  published.
                </template>
              </p>
              <p v-if="errors.requireApproval" class="field-error m-0" role="alert">{{ errors.requireApproval }}</p>
            </div>
          </section>

          <!-- Visibility -->
          <section class="card section" aria-labelledby="sec-visibility">
            <h2 id="sec-visibility" class="section-title">Who can see it</h2>
            <p class="hint section-hint">
              {{ lockedHint || 'New events start as a draft that only organisers can see, whichever you pick here.' }}
            </p>

            <div class="publicity" role="radiogroup" aria-labelledby="sec-visibility">
              <label class="choice" :class="{ on: form.publicity === 'public', locked: openOnlyLocked }">
                <input
                  id="ev-publicity-public"
                  v-model="form.publicity"
                  type="radio"
                  name="publicity"
                  value="public"
                  :disabled="openOnlyLocked"
                />
                <span class="choice-icon" aria-hidden="true"><Globe :size="20" /></span>
                <span class="choice-text">
                  <span class="choice-title">Public</span>
                  <span class="choice-sub">Listed on Browse events. Anyone with an account can sign up.</span>
                </span>
              </label>
              <label class="choice" :class="{ on: form.publicity === 'private', locked: openOnlyLocked }">
                <input
                  id="ev-publicity-private"
                  v-model="form.publicity"
                  type="radio"
                  name="publicity"
                  value="private"
                  :disabled="openOnlyLocked"
                />
                <span class="choice-icon" aria-hidden="true"><Lock :size="20" /></span>
                <span class="choice-text">
                  <span class="choice-title">Private, invite only</span>
                  <span class="choice-sub">
                    Hidden from listings. Only people with your invite link can see it and sign up.
                  </span>
                </span>
              </label>
            </div>
            <p v-if="errors.publicity" class="field-error m-0 mt-2" role="alert">{{ errors.publicity }}</p>
          </section>
        </fieldset>

        <!-- Banner (edit only: it needs the saved event) -->
        <section v-if="isEdit && event" class="card section" aria-labelledby="sec-banner">
          <h2 id="sec-banner" class="section-title">Banner</h2>
          <p class="hint section-hint">Banner changes save straight away, separately from the form.</p>
          <BannerUploader :event="event" :disabled="readOnly" @updated="onBannerUpdated" />
        </section>
        <p v-else-if="!isEdit" class="hint m-0 banner-note">
          You can add a banner image once the draft is saved.
        </p>

        <div v-if="!readOnly" class="form-actions">
          <button type="submit" class="btn btn-primary submit" :disabled="saving">
            <Loader2 v-if="saving" :size="18" class="spin" aria-hidden="true" />
            <Save v-else :size="18" aria-hidden="true" />
            {{ saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save draft' }}
          </button>
          <button type="button" class="btn btn-ghost" :disabled="saving" @click="cancel">Cancel</button>
          <span v-if="isEdit && dirty" class="hint unsaved" aria-live="polite">Unsaved changes</span>
        </div>
        <div v-else class="form-actions">
          <RouterLink :to="backLink" class="btn btn-outline">Back to manage</RouterLink>
        </div>
      </form>
    </template>
  </main>
</template>

<style scoped>
.narrow {
  max-width: 860px;
}
.notice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 0 0 20px;
}
.notice :deep(svg) {
  flex-shrink: 0;
  margin-top: 2px;
}
.event-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.plain {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.summary {
  outline: none;
}
.summary:focus-visible {
  box-shadow: 0 0 0 3px var(--pink-soft);
}
.summary-title {
  margin: 0;
  font-weight: 700;
}
.summary-text {
  margin: 4px 0 0;
}
.summary-list {
  margin: 8px 0 0;
  padding-left: 20px;
}
.summary-link {
  border: 0;
  background: none;
  padding: 2px 0;
  font: inherit;
  color: inherit;
  text-align: left;
  text-decoration: underline;
  cursor: pointer;
}
.section {
  padding: 26px 28px 28px;
}
.section-title {
  margin-bottom: 18px;
}
.section-hint {
  margin: -8px 0 18px;
}
.zone {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.zone :deep(svg) {
  flex-shrink: 0;
  margin-top: 3px;
}
.pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px 20px;
  margin-top: 22px;
}
.section-title + .pair,
.section-hint + .pair {
  margin-top: 0;
}
.pair > .field {
  margin-top: 0;
}
.pair + .field,
.field + .pair {
  margin-top: 22px;
}
.textarea.short {
  min-height: 96px;
}
.group {
  border: 0;
  margin: 24px 0 0;
  padding: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.group legend {
  padding: 0;
  margin-bottom: 2px;
}
.group .hint {
  margin: 0 0 4px;
}
.req {
  color: var(--pink-dark);
}
.toggle-row {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.switch {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  position: relative;
  width: fit-content;
}
.switch input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}
.track {
  width: 42px;
  height: 24px;
  border-radius: 999px;
  background: #e6dccb;
  position: relative;
  transition: background 0.15s;
  flex-shrink: 0;
}
.thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  transition: transform 0.15s;
}
.switch input:checked + .track {
  background: var(--pink);
}
.switch input:checked + .track .thumb {
  transform: translateX(18px);
}
.switch input:focus-visible + .track {
  box-shadow: var(--focus-ring);
}
.switch input:disabled + .track,
.switch input:disabled ~ span {
  opacity: 0.6;
}
.switch:has(input:disabled) {
  cursor: not-allowed;
}
.publicity {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.choice {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.choice:hover {
  background: #fbf6ec;
}
.choice.on {
  border-color: var(--pink);
  background: #fff7fa;
}
.choice.locked {
  cursor: not-allowed;
  opacity: 0.7;
}
.choice input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
}
.choice:has(input:focus-visible) {
  box-shadow: var(--focus-ring);
}
.choice-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: #f5eee1;
  color: var(--muted);
  flex-shrink: 0;
}
.choice.on .choice-icon {
  background: var(--pink-soft);
  color: var(--pink-dark);
}
.choice-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.choice-title {
  font-weight: 700;
}
.choice-sub {
  font-size: 0.9rem;
  color: var(--muted);
}
.inline-note {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 18px 0 0;
}
.inline-note :deep(svg) {
  flex-shrink: 0;
  margin-top: 2px;
}
.banner-note {
  padding: 0 4px;
}
.form-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.submit {
  min-width: 180px;
}
.unsaved {
  margin-left: auto;
}
@media (max-width: 640px) {
  .section {
    padding: 20px 16px 22px;
  }
  .pair,
  .publicity {
    grid-template-columns: minmax(0, 1fr);
  }
  .form-actions {
    flex-direction: column;
    align-items: stretch;
  }
  .unsaved {
    margin-left: 0;
    text-align: center;
  }
}
</style>
