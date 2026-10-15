<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter, RouterLink, onBeforeRouteLeave } from 'vue-router';
import { CalendarSearch, CalendarX, LoaderCircle, Send, LogOut, TriangleAlert } from 'lucide-vue-next';
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
  inviteFrom,
  isFull,
  validateCharacterDraft,
  cleanCharacterDraft,
} from '@/utils/events';

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
  avoid: '',
  cannotDraw: [],
  notes: '',
  saveAsDefault: false,
});
const selectedIds = ref([]);
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

const invite = computed(() => inviteFrom(route));
const backTo = computed(() =>
  invite.value ? { path: eventLink(route.params.id), query: { invite: invite.value } } : eventLink(route.params.id)
);

const existing = computed(() => application.value && ['pending', 'accepted'].includes(application.value.status));
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
  form.avoid = source.avoid || '';
  form.cannotDraw = [...(source.cannotDraw || [])];
  form.notes = application.value?.notes || '';
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
}

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
  if (form.cannotDraw.length > LIMITS.tags) e.cannotDraw = `Up to ${LIMITS.tags} tags.`;

  errors.value = e;
  return Object.keys(e).length === 0;
}

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
  submitError.value = null;
  if (!validate()) {
    submitError.value = { title: 'Check your answers', message: 'Some answers need fixing before you can send this.' };
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
    avoid: form.avoid.trim(),
    cannotDraw: [...form.cannotDraw],
    notes: form.notes.trim(),
    saveAsDefault: form.saveAsDefault,
  };

  try {
    const data = await api(`/events/${route.params.id}/application${qs({ invite: invite.value })}`, {
      method: 'PUT',
      body,
    });
    savedOnce.value = true;
    if (form.saveAsDefault && auth.user) {
      const { communityUsername, canCreate, wantsTypes, likes, avoid, cannotDraw } = body;
      setUser({ ...auth.user, defaultForm: { communityUsername, canCreate, wantsTypes, likes, avoid, cannotDraw } });
      refreshUser();
    }
    const status = data.application?.status;
    if (status === 'pending') toast.success('Sign-up sent! The organisers will review it soon.');
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
          This event is full right now, so a new sign-up won't go through unless someone withdraws first.
        </p>
        <p v-if="event.requireApproval && !existing" class="intro muted">
          The organisers review each sign-up for this event. You'll get a notification once they've decided.
        </p>

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

        <section class="card section" aria-labelledby="sec-you">
          <h2 id="sec-you" class="section-title">About you</h2>
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

        <section class="card section" aria-labelledby="sec-chars">
          <h2 id="sec-chars" class="section-title">Characters to offer</h2>
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

        <section class="card section" aria-labelledby="sec-prefs">
          <h2 id="sec-prefs" class="section-title">Your preferences</h2>
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
        </section>

        <section class="card section" aria-labelledby="sec-notes">
          <h2 id="sec-notes" class="section-title">Anything else</h2>
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

          <label class="check">
            <input v-model="form.saveAsDefault" type="checkbox" />
            <span>
              <strong>Save these answers as my defaults</strong>
              <span class="hint block">Next time you sign up for an event, these answers are filled in for you.</span>
            </span>
          </label>
        </section>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary submit" :disabled="saving">
            <LoaderCircle v-if="saving" :size="18" class="spin" aria-hidden="true" />
            <Send v-else :size="18" aria-hidden="true" />
            {{ existing ? 'Save changes' : 'Send sign-up' }}
          </button>
          <RouterLink :to="backTo" class="btn btn-outline">Cancel</RouterLink>
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
  .form-actions {
    flex-direction: column;
    align-items: stretch;
  }
  .withdraw {
    margin-left: 0;
  }
}
</style>
