<script setup>
import { ref, reactive, watch, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { Search, MessagesSquare, EyeOff, Eye, VolumeX, Volume2 } from 'lucide-vue-next';
import { api, qs } from '@/api';
import { auth } from '@/stores/auth';
import { toast } from '@/stores/toast';
import { can } from '@shared/permissions.mjs';
import { MUTE_OPTIONS } from '@shared/chat.mjs';
import PersonLink from '@/components/events/PersonLink.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ReasonDialog from './ReasonDialog.vue';
import { linkableUser } from './helpers.js';
import { formatDateTime, timeAgo } from '@/utils/format';

// Everything said in the museum, newest first. Moderators can hide a message (it leaves the
// room but stays here) or pause someone's chat for a while.
const filters = reactive({ q: '', person: '', show: '' });
const page = ref(1);
const data = ref(null);
const loading = ref(false);
const error = ref('');
const mayModerate = () => can(auth.user, 'chat.moderate');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    data.value = await api(`/admin/chat${qs({ ...filters, page: page.value })}`);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
let timer = null;
watch(
  () => [filters.q, filters.person],
  () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      page.value = 1;
      load();
    }, 300);
  }
);
watch(
  () => filters.show,
  () => {
    page.value = 1;
    load();
  }
);
watch(page, load);
onMounted(load);

const working = ref('');
async function setHidden(m, hidden) {
  working.value = m.id;
  try {
    await api(`/admin/chat/${m.id}/${hidden ? 'hide' : 'unhide'}`, { method: 'POST', body: {} });
    toast.success(hidden ? 'Message hidden from the room.' : 'Message shown again.');
    await load();
  } catch (e) {
    toast.error(e.message);
  } finally {
    working.value = '';
  }
}

// Muting asks how long and why (the person is told the reason)
const muting = ref(null); // the message whose author is being muted
const minutes = ref(MUTE_OPTIONS[0].minutes);
async function mute(reason) {
  const m = muting.value;
  working.value = m.id;
  try {
    await api(`/admin/users/${m.user.id}/mute`, { method: 'POST', body: { minutes: minutes.value, reason } });
    toast.success(`${m.user.displayName}'s chat is paused.`);
    muting.value = null;
    await load();
  } catch (e) {
    toast.error(e.message);
  } finally {
    working.value = '';
  }
}
async function unmute(m) {
  working.value = m.id;
  try {
    await api(`/admin/users/${m.user.id}/unmute`, { method: 'POST' });
    toast.success(`${m.user.displayName} can chat again.`);
    await load();
  } catch (e) {
    toast.error(e.message);
  } finally {
    working.value = '';
  }
}
</script>

<template>
  <div class="grid gap-5">
    <div class="filters card">
      <label class="input-wrap grow">
        <Search :size="18" class="input-icon" aria-hidden="true" />
        <input v-model="filters.q" class="input" type="search" placeholder="Search what was said" aria-label="Search messages" />
      </label>
      <label class="input-wrap grow">
        <input v-model="filters.person" class="input" type="search" placeholder="Name, username or email" aria-label="Who said it" />
      </label>
      <select v-model="filters.show" class="select" aria-label="Which messages">
        <option value="">All messages</option>
        <option value="visible">Showing in rooms</option>
        <option value="hidden">Hidden by a moderator</option>
      </select>
    </div>

    <ErrorBlock v-if="error" :message="error" @retry="load" />
    <LoadingBlock v-else-if="!data" label="Loading chat logs…" />
    <EmptyState
      v-else-if="!data.messages.length"
      :icon="MessagesSquare"
      title="Nothing said yet"
      message="Everything people say in the museum shows up here, newest first."
    />
    <template v-else>
      <p class="hint m-0" aria-live="polite">{{ data.total }} message{{ data.total === 1 ? '' : 's' }}</p>
      <ul class="rows" :class="{ dim: loading }">
        <li v-for="m in data.messages" :key="m.id" class="card row" :class="{ hidden: m.hidden }">
          <div class="min-w-0 info">
            <p class="meta">
              <PersonLink :user="linkableUser(m.user)" :size="0" />
              <span v-if="m.user.chatMutedUntil" class="chip danger">Muted until {{ formatDateTime(m.user.chatMutedUntil) }}</span>
              · <RouterLink :to="m.link">{{ m.roomLabel }}</RouterLink>
              · <time :datetime="m.createdAt" :title="formatDateTime(m.createdAt)">{{ timeAgo(m.createdAt) }}</time>
            </p>
            <p class="text" :class="m.kind">
              <template v-if="m.kind === 'emote'"><em>{{ m.user.displayName }} {{ m.text }}</em></template>
              <template v-else>{{ m.text }}</template>
            </p>
            <p v-if="m.hidden" class="hint m-0">
              Hidden<template v-if="m.hiddenBy"> by {{ m.hiddenBy.displayName }}</template>
              {{ timeAgo(m.hiddenAt) }}
            </p>
          </div>
          <div v-if="mayModerate()" class="actions">
            <button v-if="m.hidden" class="btn btn-outline btn-sm" :disabled="working === m.id" @click="setHidden(m, false)">
              <Eye :size="16" aria-hidden="true" /> Show again
            </button>
            <button v-else class="btn btn-outline btn-sm" :disabled="working === m.id" @click="setHidden(m, true)">
              <EyeOff :size="16" aria-hidden="true" /> Hide
            </button>
            <template v-if="m.user.id && m.user.role === 'user'">
              <button v-if="m.user.chatMutedUntil" class="btn btn-ghost btn-sm" :disabled="working === m.id" @click="unmute(m)">
                <Volume2 :size="16" aria-hidden="true" /> Unmute
              </button>
              <button v-else class="btn btn-ghost btn-sm danger" :disabled="working === m.id" @click="muting = m">
                <VolumeX :size="16" aria-hidden="true" /> Mute
              </button>
            </template>
          </div>
        </li>
      </ul>
      <nav v-if="data.pages > 1" class="pager" aria-label="Pages">
        <button class="btn btn-outline btn-sm" :disabled="page <= 1" @click="page--">Previous</button>
        <span class="hint">Page {{ data.page }} of {{ data.pages }}</span>
        <button class="btn btn-outline btn-sm" :disabled="page >= data.pages" @click="page++">Next</button>
      </nav>
    </template>

    <ReasonDialog
      v-if="muting"
      :open="true"
      :title="`Pause ${muting.user.displayName}'s chat?`"
      message="They can still walk around the museum and look at the art, but can't say anything until the time is up. They're told the reason."
      confirm-label="Pause chat"
      danger
      :loading="working === muting.id"
      @confirm="mute"
      @cancel="muting = null"
    >
      <fieldset class="mute-length">
        <legend class="label">How long?</legend>
        <label v-for="o in MUTE_OPTIONS" :key="o.minutes" class="choice">
          <input v-model="minutes" type="radio" name="mute-length" :value="o.minutes" /> {{ o.label }}
        </label>
      </fieldset>
    </ReasonDialog>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 14px;
}
.grow {
  flex: 1 1 220px;
}
.select {
  font: inherit;
  color: var(--text);
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 12px;
}
.rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
  transition: opacity 0.15s;
}
.rows.dim {
  opacity: 0.6;
}
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 16px;
}
.row.hidden {
  border-style: dashed;
  opacity: 0.8;
}
.info {
  flex: 1 1 320px;
}
.meta {
  margin: 0;
  font-size: 0.85rem;
  color: var(--muted);
}
.text {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
}
.text.shout {
  font-weight: 800;
  text-transform: uppercase;
}
.chip {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
}
.chip.danger {
  background: var(--danger-soft);
  color: var(--danger);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.danger {
  color: var(--danger);
}
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.mute-length {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  margin: 0 0 12px;
  padding: 0;
  border: 0;
}
.mute-length legend {
  margin-bottom: 6px;
}
.choice {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}
</style>
