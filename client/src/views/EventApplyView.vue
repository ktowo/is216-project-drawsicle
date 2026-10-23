<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter, RouterLink, onBeforeRouteLeave } from 'vue-router';
import {
  CalendarSearch,
  CalendarX,
  LoaderCircle,
  Send,
  LogOut,
  TriangleAlert,
  ArrowLeft,
  ArrowRight,
  Check,
  Pencil,
  History,
} from 'lucide-vue-next';
import PageHeader from '@/components/ui/PageHeader.vue';
import FormField from '@/components/ui/FormField.vue';
import ChoiceChips from '@/components/ui/ChoiceChips.vue';
import TagInput from '@/components/ui/TagInput.vue';
import DeadlineChip from '@/components/ui/DeadlineChip.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import CharacterPicker from '@/components/events/CharacterPicker.vue';
import { api, qs } from '@/api';
import { auth, setUser, refreshUser } from '@/stores/auth';
import { toast } from '@/stores/toast';
import { LIMITS, signupsOpen } from '@shared/constants.mjs';
import {
  eventLink,
  platformLabel,
  typeOptions,
  typeLabel,
  inviteFrom,
  isFull,
  validateCharacterDraft,
  cleanCharacterDraft,
} from '@/utils/events';
import { STYLE_PREFERENCES, STYLE_PREFERENCE_LABELS } from '@shared/style.mjs';

const route = useRoute();
const router = useRouter();

const loading = ref(true);
const loadError = ref('');
const notFound = ref(false);

const event = ref(null);
const application = ref(null);
const library = ref([]);

const form = reactive({
  communityUsername: '',
  canCreate: [],
  wantsTypes: [],
  likes: '',
  adoptWishlist: '',
  avoid: '',
  cannotDraw: [],
  notes: '',
  canBackup: false,
  stylePreference: 'any',
  confirmAdult: false,
  saveAsDefault: false,
});
const selectedIds = ref([]);
// Asking for adoptables: show the adopt wishlist
const wantsAdopts = computed(() => form.wantsTypes.includes('adoptable'));
const newCharacters = ref([]);

const errors = ref({});
const newErrors = ref([]);
const submitError = ref(null); // { title, message }
const errorSummary = ref(null);
const saving = ref(false);
const savedOnce = ref(false);
const snapshot = ref('');

const confirmWithdraw = ref(false);
const withdrawing = ref(false);

// ---------- Steps ----------
const STEPS = [
  { key: 'you', title: 'About you' },
  { key: 'characters', title: 'Characters' },
  { key: 'prefs', title: 'Preferences' },
  { key: 'review', title: 'Review and send' },
];
const REVIEW = STEPS.length - 1;
// Which step each answer is on, for sending people back to fix it
const STEP_OF = { communityUsername: 0, canCreate: 0, wantsTypes: 0, characters: 1, likes: 2, adoptWishlist: 2, avoid: 2, cannotDraw: 2, notes: 2 };

const step = ref(0);
const reached = ref(0); // furthest step opened so far; the indicator lets you jump back to any of them

const invite = computed(() => inviteFrom(route));
const backTo = computed(() =>
  invite.value ? { path: eventLink(route.params.id), query: { invite: invite.value } } : eventLink(route.params.id)
);

const existing = computed(
  () => application.value && ['pending', 'accepted', 'waitlisted'].includes(application.value.status)
);
const typeChoices = computed(() => typeOptions(event.value?.allowedTypes));
const communityName = computed(() => {
  if (!event.value) return '';
  return event.value.platform === 'other' ? event.value.platformName || 'the community' : platformLabel(event.value.platform);
});

// Why the form can't be used right now (null when it can)
const closedReason = computed(() => {
  const e = event.value;
  if (!e) return null;
  if (application.value?.status === 'rejected') {
    return {
      title: 'Your sign-up was not accepted',
      message: "The organisers didn't accept your sign-up for this event, so it can't be changed.",
    };
  }
  if (e.status === 'draft') {
    return { title: "Sign-ups haven't opened yet", message: 'The organisers are still setting this event up. Check back soon.' };
  }
  if (e.status === 'open' && !signupsOpen(e)) {
    return { title: 'Sign-ups have closed', message: 'The sign-up deadline has passed. Matching will start soon.' };
  }
  if (e.status !== 'open') {
    return { title: 'Sign-ups have closed', message: 'This event is past the sign-up stage, so sign-ups can no longer be changed.' };
  }
  return null;
});

const fullWarning = computed(() => event.value && isFull(event.value) && !existing.value);

function currentState() {
  return JSON.stringify({ form, ids: selectedIds.value, drafts: newCharacters.value });
}
const dirty = computed(() => Boolean(snapshot.value) && !savedOnce.value && currentState() !== snapshot.value);

function prefill() {
  const allowed = event.value.allowedTypes || [];
  const source = application.value || auth.user?.defaultForm || {};
  form.communityUsername = source.communityUsername || '';
  form.canCreate = (source.canCreate || []).filter((t) => allowed.includes(t));
  form.wantsTypes = (source.wantsTypes || []).filter((t) => allowed.includes(t));
  form.likes = source.likes || '';
  form.adoptWishlist = source.adoptWishlist || '';
  form.avoid = source.avoid || '';
  form.cannotDraw = [...(source.cannotDraw || [])];
  form.notes = application.value?.notes || '';
  form.canBackup = Boolean(application.value?.canBackup);
  form.stylePreference = application.value?.stylePreference || 'any';
  form.saveAsDefault = false;
  // Only one kind of creation allowed: nothing to choose
  if (allowed.length === 1) {
    form.canCreate = [...allowed];
    form.wantsTypes = [...allowed];
  }
  selectedIds.value = application.value ? [...(application.value.offeredCharacterIds || [])] : [];
  newCharacters.value = [];
  errors.value = {};
  newErrors.value = [];
  snapshot.value = currentState();
  // Changing a sign-up starts on the summary, with every step a click away
  step.value = existing.value ? REVIEW : 0;
  reached.value = existing.value ? REVIEW : 0;
}

// ---------- Draft kept in this browser ----------
// Answers are saved as you type, so closing the tab by mistake loses nothing.
const draftKey = computed(() => `drawsicle:signup-draft:${route.params.id}`);
const draftFound = ref(null); // { savedAt } when there's a draft that differs from the form

function readDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(draftKey.value) || 'null');
    return draft && draft.state ? draft : null;
  } catch {
    return null;
  }
}
function clearDraft() {
  try {
    localStorage.removeItem(draftKey.value);
  } catch {
    // Nothing to clear
  }
  draftFound.value = null;
}
function restoreDraft() {
  const draft = readDraft();
  if (!draft) return;
  const { form: saved, ids, drafts } = JSON.parse(draft.state);
  Object.assign(form, saved, { saveAsDefault: Boolean(saved.saveAsDefault) });
  // Characters deleted since the draft was saved are left out
  selectedIds.value = (ids || []).filter((id) => library.value.some((c) => c.id === id) || application.value?.offeredCharacterIds?.includes(id));
  newCharacters.value = drafts || [];
  draftFound.value = null;
  toast.info('Your draft is back. Check it over before sending.');
}
let draftTimer = null;
watch(
  () => currentState(),
  (state) => {
    if (!snapshot.value || savedOnce.value || draftFound.value) return;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      try {
        if (state === snapshot.value) localStorage.removeItem(draftKey.value);
        else localStorage.setItem(draftKey.value, JSON.stringify({ state, savedAt: new Date().toISOString() }));
      } catch {
        // Private browsing or full storage: the draft just isn't kept
      }
    }, 400);
  }
);
onBeforeUnmount(() => clearTimeout(draftTimer));

function loginRedirect() {
  router.replace({ name: 'login', query: { redirect: route.fullPath } });
}

async function load() {
  loading.value = true;
  loadError.value = '';
  notFound.value = false;
  const id = route.params.id;
  const [eventRes, appRes, charRes] = await Promise.allSettled([
    api(`/events/${id}${qs({ invite: invite.value })}`),
    api(`/events/${id}/application${qs({ invite: invite.value })}`),
    api('/characters'),
  ]);

  const failed = [eventRes, appRes, charRes].find((r) => r.status === 'rejected');
  if (failed?.reason?.status === 401) return loginRedirect();
  if (eventRes.status === 'rejected') {
    if (eventRes.reason.status === 404) notFound.value = true;
    else loadError.value = eventRes.reason.message;
  } else if (failed) {
    loadError.value = failed.reason.message;
  } else {
    event.value = eventRes.value.event;
    application.value = appRes.value.application;
    library.value = charRes.value.characters || [];
    document.title = `Sign up: ${event.value.name} · Drawsicle`;
    prefill();
    const draft = readDraft();
    if (draft && draft.state !== snapshot.value && !closedReason.value) draftFound.value = { savedAt: draft.savedAt };
  }
  loading.value = false;
}

onMounted(load);

function validate() {
  const e = {};
  const allowed = event.value.allowedTypes || [];
  const username = form.communityUsername.trim();
  if (!username) e.communityUsername = `Add your username on ${communityName.value}.`;
  else if (username.length > LIMITS.communityUsername) {
    e.communityUsername = `Keep it under ${LIMITS.communityUsername} characters.`;
  }

  if (!form.canCreate.length) e.canCreate = 'Pick at least one thing you can make.';
  else if (form.canCreate.some((t) => !allowed.includes(t))) e.canCreate = "This event doesn't allow one of those.";
  if (!form.wantsTypes.length) e.wantsTypes = "Pick at least one thing you'd like to receive.";
  else if (form.wantsTypes.some((t) => !allowed.includes(t))) e.wantsTypes = "This event doesn't allow one of those.";

  // Archived characters can't be picked in CharacterPicker unless this sign-up already offered
  // them, which the server allows, so only the count and the new characters need checking here.
  const count = selectedIds.value.length + newCharacters.value.length;
  newErrors.value = newCharacters.value.map(validateCharacterDraft);
  if (count < LIMITS.offeredCharactersMin) {
    e.characters = `Offer at least ${LIMITS.offeredCharactersMin} character for your Secret Santa to draw.`;
  } else if (count > LIMITS.offeredCharactersMax) {
    e.characters = `Offer up to ${LIMITS.offeredCharactersMax} characters.`;
  } else if (newErrors.value.some((x) => Object.keys(x).length)) {
    e.characters = 'Check the details of your new character below.';
  }

  for (const key of ['likes', 'avoid', 'notes']) {
    if (form[key].trim().length > LIMITS.formText) e[key] = `Keep this under ${LIMITS.formText} characters.`;
  }
  if (form.adoptWishlist.trim().length > LIMITS.adoptWishlist) {
    e.adoptWishlist = `Keep this under ${LIMITS.adoptWishlist} characters.`;
  }
  if (form.cannotDraw.length > LIMITS.tags) e.cannotDraw = `Up to ${LIMITS.tags} tags.`;
  if (event.value.adultOnly && !existing.value && !form.confirmAdult) {
    e.confirmAdult = "This event is for adults. Confirm you're 18 or older to sign up.";
  }

  errors.value = e;
  return Object.keys(e).length === 0;
}

const stepErrors = (index) => Object.keys(errors.value).filter((key) => STEP_OF[key] === index);

const STEP_FIELD_IDS = {
  communityUsername: 'apply-community',
  likes: 'apply-likes',
  adoptWishlist: 'apply-adopt-wishlist',
  avoid: 'apply-avoid',
  notes: 'apply-notes',
};

async function showStep(index, { focusField } = {}) {
  step.value = index;
  reached.value = Math.max(reached.value, index);
  await nextTick();
  const target = (focusField && document.getElementById(STEP_FIELD_IDS[focusField])) || document.getElementById(`step-heading-${index}`);
  target?.focus();
  document.querySelector('.stepper')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Moving on checks this step's answers only; the others are checked when you get to them
function next() {
  validate();
  const problems = stepErrors(step.value);
  // Keep showing only this step's problems, so later steps don't open with red errors
  errors.value = Object.fromEntries(problems.map((key) => [key, errors.value[key]]));
  if (step.value !== 1) newErrors.value = newCharacters.value.map(() => ({}));
  if (problems.length) {
    submitError.value = null;
    nextTick(() => document.getElementById(STEP_FIELD_IDS[problems[0]] || `step-heading-${step.value}`)?.focus());
    return;
  }
  submitError.value = null;
  showStep(Math.min(step.value + 1, REVIEW));
}

function back() {
  if (step.value > 0) showStep(step.value - 1);
}

// The indicator only jumps to steps you've already opened
function goTo(index) {
  if (index <= reached.value && index !== step.value) showStep(index);
}

// ---------- Review ----------
const characterNames = computed(() => {
  const known = [...library.value, ...(application.value?.offeredCharacters || [])];
  const picked = selectedIds.value.map((id) => known.find((c) => c.id === id)?.name).filter(Boolean);
  const added = newCharacters.value.map((c) => (c.name || '').trim()).filter(Boolean).map((name) => `${name} (new)`);
  return [...picked, ...added];
});
const typesText = (list) => list.map(typeLabel).join(', ') || 'None picked';

const SUBMIT_ERRORS = {
  SIGNUPS_CLOSED: {
    title: 'Sign-ups have closed',
    message: 'Sign-ups for this event closed before your answers were sent, so nothing was saved.',
  },
  EVENT_FULL: {
    title: 'This event is full',
    message: 'Every spot was taken before your sign-up arrived. A spot may open up if someone withdraws.',
  },
  APPLICATION_REJECTED: {
    title: 'Your sign-up was not accepted',
    message: "The organisers didn't accept your sign-up for this event, so it can't be changed.",
  },
};

async function focusSummary() {
  await nextTick();
  errorSummary.value?.focus();
  errorSummary.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function submit() {
  // Enter in a text box on an earlier step means "next", not "send"
  if (step.value < REVIEW) return next();
  submitError.value = null;
  if (!validate()) {
    submitError.value = { title: 'Check your answers', message: 'Some answers need fixing before you can send this.' };
    const first = Math.min(...Object.keys(errors.value).map((key) => STEP_OF[key] ?? REVIEW));
    if (first < REVIEW) {
      const key = Object.keys(errors.value).find((k) => STEP_OF[k] === first);
      return showStep(first, { focusField: key });
    }
    return focusSummary();
  }

  saving.value = true;
  const wasExisting = existing.value;
  const body = {
    communityUsername: form.communityUsername.trim(),
    canCreate: [...form.canCreate],
    wantsTypes: [...form.wantsTypes],
    offeredCharacterIds: [...selectedIds.value],
    newCharacters: newCharacters.value.map(cleanCharacterDraft),
    likes: form.likes.trim(),
    adoptWishlist: wantsAdopts.value ? form.adoptWishlist.trim() : '',
    avoid: form.avoid.trim(),
    cannotDraw: [...form.cannotDraw],
    notes: form.notes.trim(),
    canBackup: form.canBackup,
    stylePreference: form.stylePreference,
    confirmAdult: Boolean(event.value.adultOnly && form.confirmAdult),
    saveAsDefault: form.saveAsDefault,
    // A full event: this sign-up goes onto the waitlist
    waitlist: Boolean(fullWarning.value),
  };

  try {
    const data = await api(`/events/${route.params.id}/application${qs({ invite: invite.value })}`, {
      method: 'PUT',
      body,
    });
    savedOnce.value = true;
    clearDraft();
    if (form.saveAsDefault && auth.user) {
      const { communityUsername, canCreate, wantsTypes, likes, avoid, cannotDraw } = body;
      setUser({ ...auth.user, defaultForm: { communityUsername, canCreate, wantsTypes, likes, avoid, cannotDraw } });
      refreshUser();
    }
    const status = data.application?.status;
    if (status === 'waitlisted' && !wasExisting) toast.success("You're on the waitlist. If a place opens up, you'll move in automatically.");
    else if (status === 'pending') toast.success('Sign-up sent! The organisers will review it soon.');
    else if (wasExisting) toast.success('Your sign-up has been updated.');
    else toast.success("You're signed up! We'll let you know when matches are out.");
    const created = data.createdCharacters?.length || 0;
    if (created) toast.info(`${created === 1 ? 'Your new character was' : `${created} new characters were`} saved to your library.`);
    router.push(backTo.value);
  } catch (e) {
    if (e.status === 401) return loginRedirect();
    submitError.value = SUBMIT_ERRORS[e.code] || { title: "Couldn't send your sign-up", message: e.message };
    focusSummary();
  } finally {
    saving.value = false;
  }
}

async function withdraw() {
  withdrawing.value = true;
  try {
    await api(`/events/${route.params.id}/application${qs({ invite: invite.value })}`, { method: 'DELETE' });
    savedOnce.value = true;
    clearDraft();
    confirmWithdraw.value = false;
    toast.success("You've withdrawn from this event.");
    router.push(backTo.value);
  } catch (e) {
    toast.error(e.message);
  } finally {
    withdrawing.value = false;
  }
}

// Clear a field's error as soon as it is fixed
watch(
  () => [form.communityUsername, form.canCreate, form.wantsTypes, selectedIds.value, newCharacters.value],
  () => {
    if (!Object.keys(errors.value).length) return;
    const next = { ...errors.value };
    if (form.communityUsername.trim()) delete next.communityUsername;
    if (form.canCreate.length) delete next.canCreate;
    if (form.wantsTypes.length) delete next.wantsTypes;
    if (selectedIds.value.length + newCharacters.value.length >= LIMITS.offeredCharactersMin && next.characters?.startsWith('Offer at least')) {
      delete next.characters;
    }
    errors.value = next;
  },
  { deep: true }
);

onBeforeRouteLeave(() => {
  if (dirty.value && !window.confirm('Leave this page? Your sign-up answers have not been sent.')) return false;
});

function beforeUnload(e) {
  if (dirty.value) e.preventDefault();
}
window.addEventListener('beforeunload', beforeUnload);
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));

const counter = (value) => `${value.trim().length} / ${LIMITS.formText}`;
</script>

<template>
  <main class="page narrow">
    <LoadingBlock v-if="loading" label="Loading sign-up form…" />

    <EmptyState
      v-else-if="notFound"
      :icon="CalendarSearch"
      title="Event not found"
      message="It may have been deleted, or it's a private event that needs an invite link."
    >
      <RouterLink to="/events" class="btn btn-primary">Browse events</RouterLink>
    </EmptyState>

    <ErrorBlock v-else-if="loadError" :message="loadError" @retry="load" />

    <template v-else-if="event">
      <PageHeader
        :title="existing ? 'Edit your sign-up' : 'Sign up'"
        :subtitle="event.name"
        :back="backTo"
        back-label="Back to event"
      >
        <div class="header-chips">
          <StatusBadge v-if="existing" kind="application" :status="application.status" />
          <DeadlineChip v-if="event.status === 'open'" :at="event.signupDeadline" label="Sign-ups close" />
        </div>
      </PageHeader>

      <EmptyState v-if="closedReason" :icon="CalendarX" :title="closedReason.title" :message="closedReason.message">
        <RouterLink :to="backTo" class="btn btn-primary">Back to the event</RouterLink>
      </EmptyState>

      <form v-else class="apply-form" novalidate @submit.prevent="submit">
        <p v-if="fullWarning" class="alert alert-warning">
          <TriangleAlert :size="18" aria-hidden="true" />
          This event is full right now, so you'll join the waitlist. If someone drops out before sign-ups close, the
          next person in line moves in and gets a notification.
        </p>
        <p v-if="event.requireApproval && !existing" class="intro muted">
          The organisers review each sign-up for this event. You'll get a notification once they've decided.
        </p>

        <div v-if="draftFound" class="alert alert-info draft" role="status">
          <History :size="18" aria-hidden="true" />
          <span class="draft-text">You started filling this in earlier. Pick up where you left off?</span>
          <span class="draft-actions">
            <button type="button" class="btn btn-primary btn-xs" @click="restoreDraft">Restore my draft</button>
            <button type="button" class="btn btn-ghost btn-xs" @click="clearDraft">Start fresh</button>
          </span>
        </div>

        <nav class="stepper" aria-label="Sign-up steps">
          <ol>
            <li
              v-for="(s, i) in STEPS"
              :key="s.key"
              class="stepper-item"
              :class="{ current: i === step, done: i < step || (i <= reached && i !== step) }"
            >
              <button
                type="button"
                class="stepper-btn"
                :disabled="i > reached"
                :aria-current="i === step ? 'step' : undefined"
                @click="goTo(i)"
              >
                <span class="stepper-num" aria-hidden="true">
                  <Check v-if="i < step" :size="14" :stroke-width="3" />
                  <template v-else>{{ i + 1 }}</template>
                </span>
                <span class="stepper-label">{{ s.title }}</span>
                <span class="sr-only">{{ i === step ? '(current step)' : i < step ? '(done)' : '' }}</span>
              </button>
            </li>
          </ol>
        </nav>

        <div
          v-if="submitError"
          ref="errorSummary"
          class="alert alert-error summary"
          role="alert"
          tabindex="-1"
        >
          <p class="summary-title">{{ submitError.title }}</p>
          <p class="summary-text">{{ submitError.message }}</p>
        </div>

        <div v-show="step === 0" class="step-panel">
          <section class="card section" aria-labelledby="step-heading-0">
            <h2 id="step-heading-0" class="section-title" tabindex="-1">About you</h2>
            <FormField
              :label="`Your username on ${communityName}`"
              :hint="
                event.platformName
                  ? `So the organisers can find you in ${event.platformName}.`
                  : 'So the organisers can find you in the community.'
              "
              :error="errors.communityUsername"
              for-id="apply-community"
              required
            >
              <div class="input-wrap">
                <input
                  id="apply-community"
                  v-model="form.communityUsername"
                  class="input"
                  type="text"
                  autocomplete="off"
                  :maxlength="LIMITS.communityUsername"
                  :aria-invalid="Boolean(errors.communityUsername)"
                  required
                />
              </div>
            </FormField>
          </section>

          <section class="card section" aria-labelledby="sec-types">
            <h2 id="sec-types" class="section-title">Making and receiving</h2>
            <fieldset class="group">
              <legend id="legend-can" class="label">What can you make? <span class="req" aria-hidden="true">*</span></legend>
              <p class="hint">Pick everything you're happy to make for someone.</p>
              <ChoiceChips v-model="form.canCreate" :options="typeChoices" aria-labelledby="legend-can" />
              <p v-if="errors.canCreate" class="field-error">{{ errors.canCreate }}</p>
            </fieldset>
            <fieldset class="group">
              <legend id="legend-wants" class="label">What would you like to receive? <span class="req" aria-hidden="true">*</span></legend>
              <p class="hint">You'll only be matched with someone who can make at least one of these.</p>
              <ChoiceChips v-model="form.wantsTypes" :options="typeChoices" aria-labelledby="legend-wants" />
              <p v-if="errors.wantsTypes" class="field-error">{{ errors.wantsTypes }}</p>
            </fieldset>
          </section>
        </div>

        <section v-show="step === 1" class="card section" aria-labelledby="step-heading-1">
          <h2 id="step-heading-1" class="section-title" tabindex="-1">Characters to offer</h2>
          <p class="hint section-hint">
            Your Secret Santa will make something featuring one or more of these. Offer
            {{ LIMITS.offeredCharactersMin }} to {{ LIMITS.offeredCharactersMax }} characters.
          </p>
          <p v-if="errors.characters" class="field-error top" role="alert">{{ errors.characters }}</p>
          <CharacterPicker
            v-model:selected-ids="selectedIds"
            v-model:new-characters="newCharacters"
            :characters="library"
            :offered="application?.offeredCharacters || []"
            :new-errors="newErrors"
            id-prefix="apply"
          />
        </section>

        <div v-show="step === 2" class="step-panel">
          <section class="card section" aria-labelledby="step-heading-2">
            <h2 id="step-heading-2" class="section-title" tabindex="-1">Your preferences</h2>
            <FormField
              label="What would you love to get?"
              :hint="`Themes, moods, styles or ideas. ${counter(form.likes)}`"
              :error="errors.likes"
              for-id="apply-likes"
            >
              <div class="input-wrap">
                <textarea
                  id="apply-likes"
                  v-model="form.likes"
                  class="textarea short"
                  :maxlength="LIMITS.formText"
                  placeholder="Cosy scenes, soft colours, my character with their cat…"
                />
              </div>
            </FormField>
            <FormField
              v-if="wantsAdopts"
              label="Adopt wishlist"
              :hint="`The kind of adoptable you'd love: species, colours, themes, or links to designs you like. ${form.adoptWishlist.trim().length} / ${LIMITS.adoptWishlist}`"
              :error="errors.adoptWishlist"
              for-id="apply-adopt-wishlist"
            >
              <div class="input-wrap">
                <textarea
                  id="apply-adopt-wishlist"
                  v-model="form.adoptWishlist"
                  class="textarea short"
                  :maxlength="LIMITS.adoptWishlist"
                  placeholder="Pastel humanoids, anything candy-themed, a grunge bat anthro…"
                />
              </div>
            </FormField>
            <FormField
              label="Anything to avoid?"
              :hint="`Things you'd rather not see in your gift. ${counter(form.avoid)}`"
              :error="errors.avoid"
              for-id="apply-avoid"
            >
              <div class="input-wrap">
                <textarea
                  id="apply-avoid"
                  v-model="form.avoid"
                  class="textarea short"
                  :maxlength="LIMITS.formText"
                  placeholder="Horror, gore, heavy shading…"
                />
              </div>
            </FormField>
            <FormField
              label="What can't you draw?"
              hint="Species or tags you can't draw, like “mecha” or “feral”. We use these so you're never matched with characters you can't draw. Press Enter or comma after each one."
              :error="errors.cannotDraw"
              for-id="apply-cannot-draw"
            >
              <TagInput
                id="apply-cannot-draw"
                v-model="form.cannotDraw"
                :max="LIMITS.tags"
                placeholder="Add a species or tag"
              />
            </FormField>

            <FormField
              label="Notes for the organisers"
              :hint="`Only the organisers see this. ${counter(form.notes)}`"
              :error="errors.notes"
              for-id="apply-notes"
            >
              <div class="input-wrap">
                <textarea id="apply-notes" v-model="form.notes" class="textarea short" :maxlength="LIMITS.formText" />
              </div>
            </FormField>

            <fieldset class="style-pref">
              <legend class="label">Art style for your gift</legend>
              <p class="hint">
                Who would you like to make your gift? Add pictures of your art under
                <RouterLink to="/profile">Your profile</RouterLink> so the matcher knows your style.
              </p>
              <label v-for="p in STYLE_PREFERENCES" :key="p" class="pref" :class="{ on: form.stylePreference === p }">
                <input v-model="form.stylePreference" type="radio" name="style-pref" :value="p" />
                <span>{{ STYLE_PREFERENCE_LABELS[p] }}</span>
              </label>
            </fieldset>

            <label class="check">
              <input v-model="form.canBackup" type="checkbox" />
              <span>
                <strong>I can be a backup artist</strong>
                <span class="hint block">
                  If someone can't finish their gift, the organisers may ask you to make an extra one. You can say no.
                </span>
              </span>
            </label>
          </section>
        </div>

        <section v-show="step === REVIEW" class="card section" aria-labelledby="step-heading-3">
          <h2 id="step-heading-3" class="section-title" tabindex="-1">Review and send</h2>
          <p class="hint section-hint">Check everything looks right. Organisers see all of this; your Secret Santa sees everything but the notes.</p>
          <div class="review">
            <div class="review-block">
              <div class="review-head">
                <h3 class="review-title">About you</h3>
                <button type="button" class="btn btn-ghost btn-xs" @click="showStep(0)">
                  <Pencil :size="14" aria-hidden="true" /> Edit<span class="sr-only"> about you</span>
                </button>
              </div>
              <dl class="review-list">
                <div><dt>Username on {{ communityName }}</dt><dd>{{ form.communityUsername.trim() || 'Not given' }}</dd></div>
                <div><dt>You can make</dt><dd>{{ typesText(form.canCreate) }}</dd></div>
                <div><dt>You'd like</dt><dd>{{ typesText(form.wantsTypes) }}</dd></div>
              </dl>
            </div>
            <div class="review-block">
              <div class="review-head">
                <h3 class="review-title">Characters</h3>
                <button type="button" class="btn btn-ghost btn-xs" @click="showStep(1)">
                  <Pencil :size="14" aria-hidden="true" /> Edit<span class="sr-only"> characters</span>
                </button>
              </div>
              <p v-if="characterNames.length" class="review-text">{{ characterNames.join(', ') }}</p>
              <p v-else class="review-text muted">No characters picked yet.</p>
            </div>
            <div class="review-block">
              <div class="review-head">
                <h3 class="review-title">Preferences</h3>
                <button type="button" class="btn btn-ghost btn-xs" @click="showStep(2)">
                  <Pencil :size="14" aria-hidden="true" /> Edit<span class="sr-only"> preferences</span>
                </button>
              </div>
              <dl class="review-list">
                <div><dt>You'd love</dt><dd class="pre">{{ form.likes.trim() || 'Nothing in particular' }}</dd></div>
                <div v-if="wantsAdopts"><dt>Adopt wishlist</dt><dd class="pre">{{ form.adoptWishlist.trim() || 'Nothing in particular' }}</dd></div>
                <div><dt>Please avoid</dt><dd class="pre">{{ form.avoid.trim() || 'Nothing in particular' }}</dd></div>
                <div><dt>Can't draw</dt><dd>{{ form.cannotDraw.join(', ') || 'Nothing listed' }}</dd></div>
                <div v-if="form.notes.trim()"><dt>Notes for organisers</dt><dd class="pre">{{ form.notes.trim() }}</dd></div>
                <div><dt>Backup artist</dt><dd>{{ form.canBackup ? 'Yes, happy to help' : 'No' }}</dd></div>
                <div><dt>Art style</dt><dd>{{ STYLE_PREFERENCE_LABELS[form.stylePreference] }}</dd></div>
              </dl>
            </div>
          </div>

          <div v-if="event.adultOnly && !existing" class="adult-confirm">
            <label class="check">
              <input v-model="form.confirmAdult" type="checkbox" aria-describedby="apply-adult-error" />
              <span>
                <strong>I'm 18 or older</strong>
                <span class="hint block">This event is for adults only, and gifts may include mature themes.</span>
              </span>
            </label>
            <p v-if="errors.confirmAdult" id="apply-adult-error" class="field-error m-0" role="alert">
              {{ errors.confirmAdult }}
            </p>
          </div>

          <label class="check">
            <input v-model="form.saveAsDefault" type="checkbox" />
            <span>
              <strong>Save these answers as my defaults</strong>
              <span class="hint block">Next time you sign up for an event, these answers are filled in for you.</span>
            </span>
          </label>
        </section>

        <div class="form-actions">
          <button v-if="step > 0" type="button" class="btn btn-outline" :disabled="saving" @click="back">
            <ArrowLeft :size="18" aria-hidden="true" /> Back
          </button>
          <button v-if="step < REVIEW" type="button" class="btn btn-primary submit" @click="next">
            Next: {{ STEPS[step + 1].title }} <ArrowRight :size="18" aria-hidden="true" />
          </button>
          <button v-else type="submit" class="btn btn-primary submit" :disabled="saving">
            <LoaderCircle v-if="saving" :size="18" class="spin" aria-hidden="true" />
            <Send v-else :size="18" aria-hidden="true" />
            {{ existing ? 'Save changes' : fullWarning ? 'Join the waitlist' : 'Send sign-up' }}
          </button>
          <RouterLink :to="backTo" class="btn btn-ghost">Cancel</RouterLink>
          <button
            v-if="existing"
            type="button"
            class="btn btn-ghost withdraw"
            :disabled="saving"
            @click="confirmWithdraw = true"
          >
            <LogOut :size="16" aria-hidden="true" /> Withdraw
          </button>
        </div>
      </form>

      <ConfirmDialog
        :open="confirmWithdraw"
        title="Withdraw from this event?"
        message="Your sign-up will be cancelled. You can sign up again while sign-ups are open, if there is still space."
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
.narrow {
  max-width: 860px;
}
.header-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.apply-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: 24px;
}
.intro {
  margin: 0;
}
.muted {
  color: var(--muted);
}
.alert-warning {
  margin: 0;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: var(--warning-soft);
  color: var(--warning);
}
.draft {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin: 0;
}
.draft-text {
  flex: 1 1 240px;
}
.draft-actions {
  display: flex;
  gap: 6px;
}
.stepper ol {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.stepper-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1.5px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  color: var(--muted);
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.stepper-btn:disabled {
  cursor: default;
  opacity: 0.7;
}
.stepper-btn:not(:disabled):hover {
  border-color: var(--pink-line);
}
.stepper-num {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--chip);
  font-size: 0.85rem;
}
.done .stepper-num {
  background: var(--success-soft);
  color: var(--success);
}
.current .stepper-btn {
  border-color: var(--pink);
  color: var(--text);
}
.current .stepper-num {
  background: var(--pink);
  color: #fff;
}
.stepper-label {
  min-width: 0;
  overflow-wrap: anywhere;
  line-height: 1.25;
}
.step-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.section-title:focus {
  outline: none;
}
.review {
  display: flex;
  flex-direction: column;
}
.review-block {
  padding: 14px 0;
  border-top: 1px solid var(--border);
}
.review-block:first-child {
  border-top: 0;
  padding-top: 0;
}
.review-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.review-title {
  font-family: var(--font-body);
  font-size: 1rem;
  font-weight: 700;
}
.review-list {
  margin: 8px 0 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.review-list div {
  display: grid;
  grid-template-columns: 190px minmax(0, 1fr);
  gap: 12px;
}
.review-list dt {
  color: var(--muted);
  font-weight: 600;
  font-size: 0.92rem;
}
.review-list dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.review-text {
  margin: 8px 0 0;
}
.pre {
  white-space: pre-line;
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
  font-weight: 500;
}
.section {
  padding: 26px 28px 28px;
}
.section-title {
  font-size: 1.3rem;
  font-weight: 700;
  margin-bottom: 18px;
}
.section-hint {
  margin: -8px 0 16px;
}
.group {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.group + .group {
  margin-top: 24px;
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
.field-error {
  margin: 0;
  color: var(--danger);
  font-size: 0.9rem;
  font-weight: 500;
}
.field-error.top {
  margin-bottom: 14px;
}
.textarea.short {
  min-height: 96px;
}
.check {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-top: 24px;
  cursor: pointer;
}
.check input {
  width: 18px;
  height: 18px;
  margin-top: 3px;
  accent-color: var(--pink);
  flex-shrink: 0;
}
.block {
  display: block;
  font-weight: 400;
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
.withdraw {
  margin-left: auto;
  color: var(--danger);
}
@media (max-width: 640px) {
  .section {
    padding: 20px 16px 22px;
  }
  .stepper ol {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
  }
  .stepper-btn {
    flex-direction: column;
    gap: 4px;
    padding: 8px 2px;
    text-align: center;
    font-size: 0.72rem;
  }
  .stepper-label {
    overflow-wrap: normal;
    word-break: normal;
  }
  
  .review-list div {
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
  }
  .form-actions {
    flex-direction: column;
    align-items: stretch;
  }
  .withdraw {
    margin-left: 0;
  }
}
.style-pref {
  margin: 0;
  padding: 0;
  border: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.pref {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1.5px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  font-weight: 600;
}
.pref.on {
  border-color: var(--pink);
  background: var(--pink-soft);
}
.pref input {
  accent-color: var(--pink);
}
</style>
