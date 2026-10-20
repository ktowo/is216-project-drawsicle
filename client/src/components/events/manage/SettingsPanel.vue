<script setup>
import { ref, reactive, computed, watch, useId } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import { UserPlus, UserMinus, Users, ImageIcon, TriangleAlert, Trash2, Pencil, Loader2 } from 'lucide-vue-next';
import BaseModal from '@/components/ui/BaseModal.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import UserAvatar from '@/components/UserAvatar.vue';
import BannerUploader from './BannerUploader.vue';
import { api } from '@/api';
import { auth } from '@/stores/auth';
import { toast } from '@/stores/toast';
import { pluralize } from '@/utils/format';
import { eventLink } from '@/utils/events';
import { personName } from './helpers';

// Organisers, banner and deleting the event.
const props = defineProps({
  event: { type: Object, required: true },
});
// updated: a new event object for the page; left: the viewer removed themselves as organiser
const emit = defineEmits(['updated', 'left']);

const router = useRouter();
const uid = useId();
const completed = computed(() => props.event.status === 'completed');

// ---- Organisers ----
const organizers = ref([]);
const loading = ref(true);
const loadError = ref('');
let loadToken = 0;

async function loadOrganizers() {
  const token = ++loadToken;
  loading.value = true;
  loadError.value = '';
  try {
    const data = await api(`/events/${props.event.id}/organizers`);
    if (token !== loadToken) return;
    organizers.value = data.organizers || [];
  } catch (e) {
    if (token === loadToken) loadError.value = e.message;
  } finally {
    if (token === loadToken) loading.value = false;
  }
}
watch(() => props.event.id, loadOrganizers, { immediate: true });

function setOrganizers(list) {
  organizers.value = list || [];
  // Keeps the organiser names on the rest of the page in step
  emit('updated', { ...props.event, organizers: organizers.value });
}

const isMe = (user) => Boolean(user?.id) && user.id === auth.user?.id;
const onlyOne = computed(() => organizers.value.length <= 1);

const identifier = ref('');
const adding = ref(false);
const addError = ref('');

async function addOrganizer() {
  const value = identifier.value.trim();
  addError.value = '';
  if (!value) {
    addError.value = 'Enter their email or username.';
    return;
  }
  if (value.length > 254) {
    addError.value = "That's too long for an email or username.";
    return;
  }
  adding.value = true;
  const before = new Set(organizers.value.map((o) => o.id));
  try {
    const data = await api(`/events/${props.event.id}/organizers`, { method: 'POST', body: { identifier: value } });
    const added = (data.organizers || []).find((o) => !before.has(o.id));
    setOrganizers(data.organizers);
    identifier.value = '';
    if (added) toast.success(`${personName(added)} is now an organiser. We've let them know.`);
    else toast.info('That person is already an organiser.');
  } catch (e) {
    addError.value = e.message;
  } finally {
    adding.value = false;
  }
}

const removal = reactive({ open: false, user: null, loading: false, error: '' });

const removalText = computed(() => {
  const user = removal.user;
  if (!user) return { title: '', message: '' };
  if (isMe(user)) {
    return {
      title: 'Step down as organiser?',
      message: "You'll lose access to this manage page straight away. Another organiser can add you back.",
    };
  }
  return {
    title: `Remove ${personName(user)}?`,
    message: `${personName(user)} will no longer be able to manage this event. Their sign-up (if they have one) isn't affected.`,
  };
});

function askRemove(user) {
  removal.user = user;
  removal.error = '';
  removal.open = true;
}

function closeRemoval() {
  if (!removal.loading) removal.open = false;
}

async function confirmRemove() {
  const user = removal.user;
  if (!user) return;
  removal.loading = true;
  removal.error = '';
  try {
    const data = await api(`/events/${props.event.id}/organizers/${user.id}`, { method: 'DELETE' });
    removal.open = false;
    if (isMe(user)) {
      toast.success(`You are no longer an organiser of ${props.event.name}.`);
      emit('left');
      return;
    }
    setOrganizers(data.organizers);
    toast.success(`${personName(user)} is no longer an organiser.`);
  } catch (e) {
    // LAST_ORGANIZER and friends: the server's message says what to do
    removal.error = e.message;
    if (e.status === 404) loadOrganizers();
  } finally {
    removal.loading = false;
  }
}

// ---- Delete ----
const deletion = reactive({ open: false, typed: '', loading: false, error: '' });
const nameMatches = computed(() => deletion.typed.trim() === props.event.name.trim());

const deleteWarning = computed(() => {
  const count = props.event.participantCount || 0;
  const people = count ? `${pluralize(count, 'accepted participant')} will be told it was ${completed.value ? 'removed' : 'cancelled'}.` : '';
  switch (props.event.status) {
    case 'draft':
      return 'Nobody else has seen this draft yet.';
    case 'active':
      return `Artists are making gifts right now. Every sign-up, match and submitted gift is deleted. ${people}`.trim();
    case 'completed':
      return `The reveal and every gift go with it, so participants can no longer look back at them. ${people}`.trim();
    default:
      return `Every sign-up${props.event.status === 'matching' ? ' and draft match' : ''} is deleted. ${people}`.trim();
  }
});

function askDelete() {
  deletion.typed = '';
  deletion.error = '';
  deletion.open = true;
}

function closeDelete() {
  if (!deletion.loading) deletion.open = false;
}

async function confirmDelete() {
  if (!nameMatches.value || deletion.loading) return;
  deletion.loading = true;
  deletion.error = '';
  try {
    await api(`/events/${props.event.id}`, { method: 'DELETE' });
    deletion.open = false;
    toast.success(`"${props.event.name}" was deleted.`);
    router.push('/my-events');
  } catch (e) {
    deletion.error = e.message;
  } finally {
    deletion.loading = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <!-- Organisers -->
    <section class="card p-5 sm:p-6" :aria-labelledby="`${uid}-org-title`">
      <h2 :id="`${uid}-org-title`" class="section-title flex items-center gap-2">
        <Users :size="20" aria-hidden="true" /> Organisers
      </h2>
      <p class="section-sub text-sm">
        Organisers can change the details, review sign-ups, make matches and send reminders. Add co-organisers by
        the email or username on their Drawsicle account.
      </p>

      <LoadingBlock v-if="loading" label="Loading organisers…" />
      <ErrorBlock v-else-if="loadError" :message="loadError" @retry="loadOrganizers" />
      <ul v-else class="org-list">
        <li v-for="o in organizers" :key="o.id" class="org-row">
          <UserAvatar :user="o" :size="40" />
          <div class="min-w-0 flex-1">
            <p class="m-0 font-semibold truncate">
              {{ personName(o) }}
              <span v-if="isMe(o)" class="badge badge-role you">You</span>
            </p>
            <p v-if="o.username" class="m-0 text-sm text-cocoa truncate">@{{ o.username }}</p>
          </div>
          <button
            type="button"
            class="btn btn-ghost btn-xs btn-danger-text"
            :disabled="onlyOne"
            :title="onlyOne ? 'Every event needs at least one organiser' : undefined"
            :aria-label="isMe(o) ? 'Step down as organiser' : `Remove ${personName(o)} as organiser`"
            @click="askRemove(o)"
          >
            <UserMinus :size="15" aria-hidden="true" /> {{ isMe(o) ? 'Step down' : 'Remove' }}
          </button>
        </li>
      </ul>
      <p v-if="!loading && !loadError && onlyOne" class="hint m-0 mt-2">
        Every event needs at least one organiser, so add someone else before stepping down.
      </p>

      <form class="add-form" novalidate @submit.prevent="addOrganizer">
        <label :for="`${uid}-identifier`" class="label">Add an organiser</label>
        <div class="add-row">
          <div class="input-wrap flex-1 min-w-0" :class="{ 'is-invalid': addError }">
            <UserPlus :size="18" class="input-icon" aria-hidden="true" />
            <input
              :id="`${uid}-identifier`"
              v-model="identifier"
              type="text"
              class="input py-2.5"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              maxlength="254"
              placeholder="Email or username"
              :aria-invalid="Boolean(addError)"
              :aria-describedby="addError ? `${uid}-identifier-error` : `${uid}-identifier-hint`"
              @input="addError = ''"
            />
          </div>
          <button type="submit" class="btn btn-primary btn-sm" :disabled="adding">
            <Loader2 v-if="adding" :size="16" class="spin" aria-hidden="true" />
            <UserPlus v-else :size="16" aria-hidden="true" />
            Add organiser
          </button>
        </div>
        <p v-if="addError" :id="`${uid}-identifier-error`" class="field-error m-0" role="alert">{{ addError }}</p>
        <p v-else :id="`${uid}-identifier-hint`" class="hint m-0">They'll get a notification and can manage the event right away.</p>
      </form>
    </section>

    <div class="grid gap-5 lg:grid-cols-2">
      <!-- Banner -->
      <section class="card p-5 sm:p-6" :aria-labelledby="`${uid}-banner-title`">
        <h2 :id="`${uid}-banner-title`" class="section-title flex items-center gap-2">
          <ImageIcon :size="20" aria-hidden="true" /> Banner
        </h2>
        <p class="section-sub text-sm mb-4">
          {{ completed ? 'The banner is locked now that the event is completed.' : 'Shown on the event page and on event cards. Changes save straight away.' }}
        </p>
        <BannerUploader :event="event" :disabled="completed" :height="150" @updated="emit('updated', $event)" />
      </section>

      <!-- Details -->
      <section class="card p-5 sm:p-6" :aria-labelledby="`${uid}-details-title`">
        <h2 :id="`${uid}-details-title`" class="section-title flex items-center gap-2">
          <Pencil :size="20" aria-hidden="true" /> Event details
        </h2>
        <p class="section-sub text-sm">
          <template v-if="completed">This event is completed, so its details can no longer be changed.</template>
          <template v-else>
            Name, description, rules, deadlines, sign-up options and who can see the event are on the edit page.
            <template v-if="['matching', 'active'].includes(event.status)">
              Sign-up options and publicity are locked now that sign-ups have closed.
            </template>
          </template>
        </p>
        <RouterLink v-if="!completed" :to="eventLink(event, '/edit')" class="btn btn-outline btn-sm mt-4">
          <Pencil :size="16" aria-hidden="true" /> Edit details
        </RouterLink>
      </section>
    </div>

    <!-- Danger zone -->
    <section class="card danger-zone p-5 sm:p-6" :aria-labelledby="`${uid}-danger-title`">
      <h2 :id="`${uid}-danger-title`" class="section-title flex items-center gap-2 text-danger">
        <TriangleAlert :size="20" aria-hidden="true" /> Danger zone
      </h2>
      <div class="flex flex-col gap-3 mt-2 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <p class="m-0 font-semibold">Delete this event</p>
          <p class="m-0 text-sm text-cocoa">
            Removes the event with all its sign-ups, matches and gifts. This can't be undone.
          </p>
        </div>
        <button type="button" class="btn btn-outline btn-sm btn-danger-text shrink-0" @click="askDelete">
          <Trash2 :size="16" aria-hidden="true" /> Delete event
        </button>
      </div>
    </section>

    <ConfirmDialog
      :open="removal.open"
      :title="removalText.title"
      :message="removalText.message"
      :confirm-label="removal.user && isMe(removal.user) ? 'Step down' : 'Remove organiser'"
      danger
      :loading="removal.loading"
      @confirm="confirmRemove"
      @cancel="closeRemoval"
    >
      <p v-if="removal.error" class="alert alert-error m-0" role="alert">{{ removal.error }}</p>
    </ConfirmDialog>

    <!-- Typed confirmation, so BaseModal is used directly to disable the button until the name matches -->
    <BaseModal :open="deletion.open" title="Delete this event?" size="sm" @close="closeDelete">
      <form :id="`${uid}-delete-form`" class="flex flex-col gap-4" novalidate @submit.prevent="confirmDelete">
        <p class="m-0 text-cocoa">{{ deleteWarning }} This can't be undone.</p>
        <div class="field">
          <label :for="`${uid}-delete-name`" class="label text-sm">
            Type <strong class="break-anywhere">{{ event.name }}</strong> to confirm
          </label>
          <div class="input-wrap">
            <input
              :id="`${uid}-delete-name`"
              v-model="deletion.typed"
              type="text"
              class="input py-2.5"
              autocomplete="off"
              spellcheck="false"
              :aria-invalid="Boolean(deletion.typed) && !nameMatches"
            />
          </div>
        </div>
        <p v-if="deletion.error" class="alert alert-error m-0" role="alert">{{ deletion.error }}</p>
      </form>
      <template #footer>
        <button type="button" class="btn btn-outline btn-sm" :disabled="deletion.loading" @click="closeDelete">
          Cancel
        </button>
        <button
          type="submit"
          :form="`${uid}-delete-form`"
          class="btn btn-danger btn-sm"
          :disabled="!nameMatches || deletion.loading"
        >
          <Loader2 v-if="deletion.loading" :size="16" class="spin" aria-hidden="true" />
          <Trash2 v-else :size="16" aria-hidden="true" />
          Delete forever
        </button>
      </template>
    </BaseModal>
  </div>
</template>

<style scoped>
.org-list {
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
}
.org-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid var(--border);
}
.org-row:first-child {
  border-top: 0;
  padding-top: 4px;
}
.you {
  margin-left: 6px;
  padding: 1px 10px;
  font-size: 0.75rem;
  vertical-align: middle;
}
.add-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 20px;
  padding-top: 18px;
  border-top: 1px dashed var(--border);
}
.add-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.add-row .input-wrap {
  flex-basis: 240px;
}
.danger-zone {
  border-color: var(--pink-line);
}
.break-anywhere {
  overflow-wrap: anywhere;
}
@media (max-width: 480px) {
  .add-row > .btn {
    flex: 1 1 100%;
  }
}
</style>
