<script setup>
import { ref, reactive, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { useRoute, useRouter, RouterLink, onBeforeRouteLeave } from 'vue-router';
import {
  CalendarSearch,
  Hourglass,
  LoaderCircle,
  Send,
  Plus,
  Trash2,
  Link as LinkIcon,
  TriangleAlert,
  CircleCheck,
  PartyPopper,
  Gift,
} from 'lucide-vue-next';
import PageHeader from '@/components/ui/PageHeader.vue';
import FormField from '@/components/ui/FormField.vue';
import ChoiceChips from '@/components/ui/ChoiceChips.vue';
import DeadlineChip from '@/components/ui/DeadlineChip.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import UserAvatar from '@/components/UserAvatar.vue';
import ImageUploader from '@/components/events/ImageUploader.vue';
import SubmissionDetails from '@/components/events/SubmissionDetails.vue';
import { api, qs } from '@/api';
import { toast } from '@/stores/toast';
import { LIMITS } from '@shared/constants.mjs';
import { formatDateTime } from '@/utils/format';
import { eventLink, inviteFrom, isPast, isHttpUrl, matchUnavailable, typeOptions } from '@/utils/events';
import { MAX_UPLOAD_REQUEST_BYTES, totalBytes, formatBytes } from '@/utils/images';

const LINK_LABEL_MAX = 60;
const LINK_URL_MAX = 500;

const route = useRoute();
const router = useRouter();

const loading = ref(true);
const loadError = ref('');
const notFound = ref(false);
const unavailable = ref(null);

const event = ref(null);
const match = ref(null);
const submission = ref(null); // what the server has now

const form = reactive({ title: '', type: '', message: '', links: [] });
const keepImages = ref([]);
const newFiles = ref([]);
const preparing = ref(false);

const errors = ref({});
const submitError = ref(null); // { title, message }
const errorSummary = ref(null);
const saving = ref(false);
const justSaved = ref(false);
const snapshot = ref('');

const confirmDelete = ref(false);
const deleting = ref(false);

const invite = computed(() => inviteFrom(route));
const backTo = computed(() =>
  invite.value ? { path: eventLink(route.params.id), query: { invite: invite.value } } : eventLink(route.params.id)
);

const recipient = computed(() => match.value?.recipient || null);
const recipientName = computed(() => recipient.value?.displayName || 'your recipient');
const deadline = computed(() => match.value?.submissionDeadline || event.value?.submissionDeadline);
const isActive = computed(() => event.value?.status === 'active');
const pastDeadline = computed(() => isPast(deadline.value));
const typeChoices = computed(() => typeOptions(event.value?.allowedTypes));
const imageCount = computed(() => keepImages.value.length + newFiles.value.length);

function currentState() {
  return JSON.stringify({
    form,
    keep: keepImages.value,
    files: newFiles.value.map((f) => `${f.name}:${f.size}`),
  });
}
const dirty = computed(() => Boolean(snapshot.value) && currentState() !== snapshot.value);

// Picks a sensible type for a new submission: one the recipient asked for, if the event allows it
function defaultType() {
  const allowed = event.value?.allowedTypes || [];
  const wanted = (recipient.value?.wantsTypes || []).find((t) => allowed.includes(t));
  return wanted || allowed[0] || 'art';
}

function fillForm() {
  const s = submission.value;
  form.title = s?.title || '';
  form.type = s?.type && (event.value?.allowedTypes || []).includes(s.type) ? s.type : defaultType();
  form.message = s?.message || '';
  form.links = (s?.links || []).map((l) => ({ label: l.label || '', url: l.url || '' }));
  keepImages.value = [...(s?.images || [])];
  newFiles.value = [];
  errors.value = {};
  submitError.value = null;
  snapshot.value = currentState();
}

function loginRedirect() {
  router.replace({ name: 'login', query: { redirect: route.fullPath } });
}

let requestId = 0;
async function load() {
  const id = ++requestId;
  const eventId = route.params.id;
  loading.value = true;
  loadError.value = '';
  notFound.value = false;
  unavailable.value = null;
  justSaved.value = false;

  const [eventRes, matchRes, subRes] = await Promise.allSettled([
    api(`/events/${eventId}${qs({ invite: invite.value })}`),
    api(`/events/${eventId}/my-match`),
    api(`/events/${eventId}/submission`),
  ]);
  if (id !== requestId) return;

  const failed = [eventRes, matchRes, subRes].find((r) => r.status === 'rejected');
  if (failed?.reason?.status === 401) return loginRedirect();

  if (eventRes.status === 'rejected') {
    if (eventRes.reason.status === 404) notFound.value = true;
    else loadError.value = eventRes.reason.message;
    loading.value = false;
    return;
  }

  event.value = eventRes.value.event;
  document.title = `Submit your gift: ${event.value.name} · Drawisicle`;

  if (matchRes.status === 'rejected') {
    const reason = matchRes.reason;
    if (reason.status === 403 || reason.status === 404) unavailable.value = matchUnavailable(event.value, reason);
    else loadError.value = reason.message;
    loading.value = false;
    return;
  }
  match.value = matchRes.value.match;

  if (subRes.status === 'fulfilled') {
    submission.value = subRes.value.submission ?? null;
  } else if (subRes.reason.status === 404) {
    // My match carries the same submission, so a missing route here isn't fatal
    submission.value = match.value?.submission ?? null;
  } else {
    loadError.value = subRes.reason.message;
    loading.value = false;
    return;
  }

  fillForm();
  loading.value = false;
}

watch(
  () => route.params.id,
  () => {
    if (route.name === 'event-submit') load();
  },
  { immediate: true }
);

// ---------- Links ----------

function addLink() {
  if (form.links.length >= LIMITS.submissionLinks) return;
  form.links.push({ label: '', url: '' });
  nextTick(() => document.getElementById(`submit-link-url-${form.links.length - 1}`)?.focus());
}

function removeLink(index) {
  form.links.splice(index, 1);
  const next = {};
  for (const [key, value] of Object.entries(errors.value)) {
    if (!key.startsWith('links.')) next[key] = value;
  }
  errors.value = next;
}

function cleanLinks() {
  return form.links
    .map((l) => ({ label: l.label.trim(), url: l.url.trim() }))
    .filter((l) => l.url);
}

// ---------- Validation and saving ----------

function validate() {
  const e = {};
  const allowed = event.value.allowedTypes || [];

  if (form.title.trim().length > LIMITS.submissionTitle) {
    e.title = `Keep the title under ${LIMITS.submissionTitle} characters.`;
  }
  if (!form.type) e.type = 'Pick what kind of gift this is.';
  else if (!allowed.includes(form.type)) e.type = "This event doesn't allow that kind of gift.";
  if (form.message.trim().length > LIMITS.submissionMessage) {
    e.message = `Keep your message under ${LIMITS.submissionMessage} characters.`;
  }

  form.links.forEach((link, i) => {
    const url = link.url.trim();
    const label = link.label.trim();
    if (!url && !label) return;
    if (!url) e[`links.${i}`] = 'Add the link, or remove this row.';
    else if (!isHttpUrl(url)) e[`links.${i}`] = 'Links need to start with http:// or https://';
    else if (url.length > LINK_URL_MAX) e[`links.${i}`] = 'That link is too long.';
    else if (label.length > LINK_LABEL_MAX) e[`links.${i}`] = `Keep the label under ${LINK_LABEL_MAX} characters.`;
  });
  const links = cleanLinks();
  if (links.length > LIMITS.submissionLinks) e.links = `Add up to ${LIMITS.submissionLinks} links.`;

  if (imageCount.value > LIMITS.submissionImages) {
    e.images = `Add up to ${LIMITS.submissionImages} images. Remove ${imageCount.value - LIMITS.submissionImages} to continue.`;
  } else if (totalBytes(newFiles.value) > MAX_UPLOAD_REQUEST_BYTES) {
    e.images = `Your new images add up to ${formatBytes(totalBytes(newFiles.value))}, but one save can only send ${formatBytes(MAX_UPLOAD_REQUEST_BYTES)}. Remove one, save, then add the rest.`;
  } else if (!imageCount.value && !links.length) {
    e.images = 'Add at least one image or link so your recipient can see your gift.';
  }

  errors.value = e;
  return Object.keys(e).length === 0;
}

async function focusSummary() {
  await nextTick();
  errorSummary.value?.focus();
  errorSummary.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function explain(e) {
  if (e.status === 413 || e.code === 'TOO_LARGE') {
    return {
      title: 'That upload was too big',
      message: 'Try fewer or smaller images in one go. Already uploaded images are kept, so you can add the rest after saving.',
    };
  }
  if (e.code === 'UPLOAD_INVALID') return { title: "One of the images couldn't be uploaded", message: e.message };
  if (e.status === 403 || e.status === 409) {
    return { title: "Your gift couldn't be saved", message: `${e.message} Refresh the page to see the latest state of the event.` };
  }
  return { title: "Your gift couldn't be saved", message: e.message };
}

async function submit() {
  submitError.value = null;
  justSaved.value = false;
  if (preparing.value) {
    submitError.value = { title: 'Nearly ready', message: 'Your images are still being prepared. Try again in a moment.' };
    return focusSummary();
  }
  if (!validate()) {
    submitError.value = { title: 'Check your gift', message: 'A few things need fixing before you can send it.' };
    return focusSummary();
  }

  const wasNew = !submission.value;
  const data = new FormData();
  data.append('title', form.title.trim());
  data.append('message', form.message.trim());
  data.append('type', form.type);
  data.append('links', JSON.stringify(cleanLinks()));
  data.append('keepImages', JSON.stringify(keepImages.value));
  for (const file of newFiles.value) data.append('images', file, file.name);

  saving.value = true;
  try {
    const res = await api(`/events/${route.params.id}/submission`, { method: 'PUT', form: data });
    submission.value = res.submission;
    if (match.value) match.value = { ...match.value, status: 'submitted', submission: res.submission };
    fillForm();
    justSaved.value = true;
    toast.success(wasNew ? `Gift sent! ${recipientName.value} will see it at the reveal.` : 'Your gift has been updated.');
    if (res.submission?.late && wasNew) toast.info('It arrived after the deadline, so it is marked late.');
  } catch (e) {
    if (e.status === 401) return loginRedirect();
    submitError.value = explain(e);
    focusSummary();
  } finally {
    saving.value = false;
  }
}

async function removeSubmission() {
  deleting.value = true;
  try {
    await api(`/events/${route.params.id}/submission`, { method: 'DELETE' });
    submission.value = null;
    if (match.value) match.value = { ...match.value, status: 'assigned', submission: null };
    confirmDelete.value = false;
    justSaved.value = false;
    fillForm();
    toast.success('Your submission was deleted.');
  } catch (e) {
    if (e.status === 401) return loginRedirect();
    toast.error(e.message);
  } finally {
    deleting.value = false;
  }
}

// Clear an error as soon as its field is fixed
watch(
  () => [form.type, keepImages.value.length, newFiles.value.length, form.links.map((l) => l.url).join('|')],
  () => {
    if (!errors.value.type && !errors.value.images) return;
    const next = { ...errors.value };
    if (form.type) delete next.type;
    if (imageCount.value || cleanLinks().length) {
      if (next.images?.startsWith('Add at least one')) delete next.images;
    }
    errors.value = next;
  }
);

onBeforeRouteLeave(() => {
  if (dirty.value && !saving.value && !window.confirm('Leave this page? Your changes to your gift have not been saved.')) {
    return false;
  }
});

function beforeUnload(e) {
  if (dirty.value) e.preventDefault();
}
window.addEventListener('beforeunload', beforeUnload);
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));

const counter = (value, max) => `${value.trim().length} / ${max}`;
</script>

<template>
  <main class="page narrow">
    <LoadingBlock v-if="loading" label="Loading your gift…" />

    <EmptyState
      v-else-if="notFound"
      :icon="CalendarSearch"
      title="Event not found"
      message="It may have been deleted, or it's a private event that needs an invite link."
    >
      <RouterLink to="/events" class="btn btn-primary">Browse events</RouterLink>
    </EmptyState>

    <template v-else-if="loadError">
      <PageHeader title="Submit your gift" :back="backTo" back-label="Back to event" />
      <ErrorBlock :message="loadError" @retry="load" />
    </template>

    <template v-else-if="event">
      <PageHeader
        :title="isActive ? (submission ? 'Edit your gift' : 'Submit your gift') : 'Your gift'"
        :subtitle="event.name"
        :back="backTo"
        back-label="Back to event"
      >
        <div class="header-chips">
          <StatusBadge v-if="match" kind="match" :status="submission ? 'submitted' : 'assigned'" />
          <StatusBadge v-if="submission?.late" kind="submission" status="late" />
          <DeadlineChip v-if="isActive && deadline" :at="deadline" label="Gifts due" past-label="Was due" />
        </div>
      </PageHeader>

      <EmptyState v-if="unavailable" :icon="Hourglass" :title="unavailable.title" :message="unavailable.message">
        <RouterLink :to="backTo" class="btn btn-primary">Back to the event</RouterLink>
      </EmptyState>

      <!-- Finished events: show what was sent, nothing can change -->
      <template v-else-if="!isActive">
        <section class="card section readonly">
          <p class="alert alert-info closed-note">
            <PartyPopper :size="18" aria-hidden="true" />
            <span v-if="event.status === 'completed'">This event has finished and the gifts have been revealed, so submissions can't be changed.</span>
            <span v-else>Submissions can only be sent while the event is active.</span>
          </p>
          <template v-if="submission">
            <h2 class="section-title">What you sent {{ recipient ? `to ${recipientName}` : '' }}</h2>
            <SubmissionDetails :submission="submission" :caption="`Your gift for ${recipientName}`" show-meta />
          </template>
          <p v-else class="muted">You didn't submit a gift for this event.</p>
          <div class="form-actions">
            <RouterLink v-if="event.status === 'completed'" :to="eventLink(event, '/results')" class="btn btn-primary">
              See the reveal
            </RouterLink>
            <RouterLink :to="backTo" class="btn btn-outline">Back to the event</RouterLink>
          </div>
        </section>
      </template>

      <form v-else class="submit-form" novalidate @submit.prevent="submit">
        <section v-if="recipient" class="card recipient">
          <UserAvatar :user="recipient" :size="48" />
          <div class="recipient-text">
            <p class="muted small">You're making a gift for</p>
            <p class="recipient-name">{{ recipient.displayName }}</p>
          </div>
          <RouterLink :to="eventLink(event, '/matches')" class="btn btn-ghost btn-sm">
            <Gift :size="16" aria-hidden="true" /> Their wishes
          </RouterLink>
        </section>

        <p v-if="pastDeadline" class="alert alert-warning row-alert">
          <TriangleAlert :size="18" aria-hidden="true" />
          <span>
            The deadline was {{ formatDateTime(deadline) }}.
            {{ submission ? 'Changes are still saved, but your gift is marked late.' : 'You can still send your gift, but it will be marked late.' }}
          </span>
        </p>

        <p v-if="justSaved" class="alert alert-success row-alert" role="status">
          <CircleCheck :size="18" aria-hidden="true" />
          <span>
            Saved. {{ recipientName }} will see your gift when the organisers reveal everything. You can keep editing until then.
          </span>
        </p>

        <div v-if="submitError" ref="errorSummary" class="alert alert-error summary" role="alert" tabindex="-1">
          <p class="summary-title">{{ submitError.title }}</p>
          <p class="summary-text">{{ submitError.message }}</p>
        </div>

        <section class="card section" aria-labelledby="sec-gift">
          <h2 id="sec-gift" class="section-title">Your gift</h2>

          <FormField
            label="Title"
            :hint="`Optional. ${counter(form.title, LIMITS.submissionTitle)}`"
            :error="errors.title"
            for-id="submit-title"
            v-slot="{ describedby }"
          >
            <div class="input-wrap" :class="{ 'is-invalid': errors.title }">
              <input
                id="submit-title"
                v-model="form.title"
                class="input"
                type="text"
                :maxlength="LIMITS.submissionTitle"
                placeholder="Starlight picnic"
                :aria-invalid="errors.title ? 'true' : undefined"
                :aria-describedby="describedby"
              />
            </div>
          </FormField>

          <fieldset class="group">
            <legend id="legend-type" class="label">What kind of gift is it? <span class="req" aria-hidden="true">*</span></legend>
            <ChoiceChips v-model="form.type" :options="typeChoices" :multiple="false" aria-labelledby="legend-type" />
            <p v-if="errors.type" class="field-error">{{ errors.type }}</p>
          </fieldset>

          <FormField
            label="Message to your recipient"
            :hint="`Optional. Shown with your gift at the reveal. ${counter(form.message, LIMITS.submissionMessage)}`"
            :error="errors.message"
            for-id="submit-message"
            v-slot="{ describedby }"
          >
            <div class="input-wrap" :class="{ 'is-invalid': errors.message }">
              <textarea
                id="submit-message"
                v-model="form.message"
                class="textarea"
                :maxlength="LIMITS.submissionMessage"
                :placeholder="`Happy holidays, ${recipientName}! I had so much fun drawing…`"
                :aria-invalid="errors.message ? 'true' : undefined"
                :aria-describedby="describedby"
              />
            </div>
          </FormField>
        </section>

        <section class="card section" aria-labelledby="sec-images">
          <h2 id="sec-images" class="section-title">Images</h2>
          <p id="images-hint" class="hint section-hint">
            Up to {{ LIMITS.submissionImages }} pictures of your gift. Add at least one image or one link below.
          </p>
          <p v-if="errors.images" class="field-error top" role="alert">{{ errors.images }}</p>
          <ImageUploader
            id="submit-images"
            v-model:existing="keepImages"
            v-model:files="newFiles"
            v-model:busy="preparing"
            :max="LIMITS.submissionImages"
            :disabled="saving"
            described-by="images-hint"
          />
        </section>

        <section class="card section" aria-labelledby="sec-links">
          <h2 id="sec-links" class="section-title">Links</h2>
          <p class="hint section-hint">
            For writing, music or anything hosted elsewhere, like a Google Doc, SoundCloud track or Toyhou.se page.
          </p>
          <p v-if="errors.links" class="field-error top" role="alert">{{ errors.links }}</p>

          <ul v-if="form.links.length" class="link-rows">
            <li v-for="(link, i) in form.links" :key="i" class="link-row">
              <div class="link-inputs">
                <div class="input-wrap label-input" :class="{ 'is-invalid': errors[`links.${i}`] }">
                  <label :for="`submit-link-label-${i}`" class="sr-only">Link {{ i + 1 }} label</label>
                  <input
                    :id="`submit-link-label-${i}`"
                    v-model="link.label"
                    class="input"
                    type="text"
                    :maxlength="LINK_LABEL_MAX"
                    placeholder="Label (optional)"
                  />
                </div>
                <div class="input-wrap url-input" :class="{ 'is-invalid': errors[`links.${i}`] }">
                  <LinkIcon :size="16" class="input-icon" aria-hidden="true" />
                  <label :for="`submit-link-url-${i}`" class="sr-only">Link {{ i + 1 }} address</label>
                  <input
                    :id="`submit-link-url-${i}`"
                    v-model="link.url"
                    class="input"
                    type="url"
                    inputmode="url"
                    :maxlength="LINK_URL_MAX"
                    placeholder="https://"
                    :aria-invalid="errors[`links.${i}`] ? 'true' : undefined"
                    :aria-describedby="errors[`links.${i}`] ? `submit-link-error-${i}` : undefined"
                  />
                </div>
                <button
                  type="button"
                  class="btn btn-ghost btn-icon btn-danger-text"
                  :aria-label="`Remove link ${i + 1}`"
                  @click="removeLink(i)"
                >
                  <Trash2 :size="18" aria-hidden="true" />
                </button>
              </div>
              <p v-if="errors[`links.${i}`]" :id="`submit-link-error-${i}`" class="field-error">{{ errors[`links.${i}`] }}</p>
            </li>
          </ul>

          <button
            type="button"
            class="btn btn-outline btn-sm add-link"
            :disabled="form.links.length >= LIMITS.submissionLinks"
            @click="addLink"
          >
            <Plus :size="16" aria-hidden="true" />
            {{ form.links.length >= LIMITS.submissionLinks ? `Up to ${LIMITS.submissionLinks} links` : 'Add a link' }}
          </button>
        </section>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary submit" :disabled="saving || preparing">
            <LoaderCircle v-if="saving || preparing" :size="18" class="spin" aria-hidden="true" />
            <Send v-else :size="18" aria-hidden="true" />
            {{ saving ? 'Sending…' : submission ? 'Save changes' : 'Send my gift' }}
          </button>
          <RouterLink :to="backTo" class="btn btn-outline">Cancel</RouterLink>
          <button
            v-if="submission"
            type="button"
            class="btn btn-ghost btn-danger-text delete"
            :disabled="saving"
            @click="confirmDelete = true"
          >
            <Trash2 :size="16" aria-hidden="true" /> Delete submission
          </button>
        </div>
      </form>

      <ConfirmDialog
        :open="confirmDelete"
        title="Delete your submission?"
        :message="`Your gift for ${recipientName} will be removed, including its images. You can submit again while the event is active.`"
        confirm-label="Delete"
        cancel-label="Keep it"
        danger
        :loading="deleting"
        @confirm="removeSubmission"
        @cancel="confirmDelete = false"
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
.submit-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.muted {
  margin: 0;
  color: var(--muted);
}
.small {
  font-size: 0.88rem;
}
.recipient {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
}
.recipient-text {
  flex: 1;
  min-width: 0;
}
.recipient-name {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.3rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.row-alert,
.closed-note {
  margin: 0;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.row-alert svg,
.closed-note svg {
  flex-shrink: 0;
  margin-top: 2px;
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
.readonly {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.readonly .section-title {
  margin-bottom: 0;
}
.group {
  border: 0;
  margin: 22px 0;
  padding: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.group legend {
  padding: 0;
  margin-bottom: 10px;
}
.req {
  color: var(--pink-dark);
}
.field-error {
  margin: 0;
}
.field-error.top {
  margin-bottom: 14px;
}
.link-rows {
  list-style: none;
  margin: 0 0 14px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.link-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.link-inputs {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.6fr) auto;
  gap: 10px;
  align-items: center;
}
.link-inputs .input {
  padding: 11px 0;
}
.add-link {
  align-self: flex-start;
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
.delete {
  margin-left: auto;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
@media (max-width: 640px) {
  .section {
    padding: 20px 16px 22px;
  }
  .recipient {
    flex-wrap: wrap;
    padding: 14px 16px;
  }
  .link-inputs {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .label-input {
    grid-column: 1 / -1;
  }
  .form-actions {
    flex-direction: column;
    align-items: stretch;
  }
  .delete {
    margin-left: 0;
  }
}
</style>
