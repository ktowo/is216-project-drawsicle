<script setup>
import { ref, reactive, watch, onMounted } from 'vue';
import { Search, ShieldCheck, ShieldOff, Ban, Undo2, Trash2, Users } from 'lucide-vue-next';
import { api, qs } from '@/api';
import { auth } from '@/stores/auth';
import { toast } from '@/stores/toast';
import UserAvatar from '@/components/UserAvatar.vue';
import PersonLink from '@/components/events/PersonLink.vue';
import { linkableUser } from './helpers.js';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue';
import ReasonDialog from './ReasonDialog.vue';
import { formatDate } from '@/utils/format';
import { can, SITE_ROLE_LABELS } from '@shared/permissions.mjs';
import { SITE_ROLES } from '@shared/constants.mjs';

const mayManage = () => can(auth.user, 'users.manage');
const mayChangeRoles = () => can(auth.user, 'users.roles');

const filters = reactive({ q: '', status: '', role: '' });
const page = ref(1);
const data = ref(null);
const loading = ref(false);
const error = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    data.value = await api(`/admin/users${qs({ ...filters, page: page.value })}`);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

let searchTimer = null;
watch(() => filters.q, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { page.value = 1; load(); }, 300);
});
watch(() => [filters.status, filters.role], () => { page.value = 1; load(); });
watch(page, load);
onMounted(load);

const isMe = (u) => u.id === auth.user?.id;

// One dialog at a time: { kind, user }
const pending = ref(null);
const working = ref(false);

const DIALOGS = {
  role: (u, role) => ({
    title: `Make ${u.displayName} ${role === 'user' ? 'a regular member' : `a ${SITE_ROLE_LABELS[role].toLowerCase()}`}?`,
    message: ROLE_NOTES[role],
    confirmLabel: role === 'user' ? 'Remove their role' : `Make ${SITE_ROLE_LABELS[role].toLowerCase()}`,
    danger: role === 'user',
  }),
  ban: (u) => ({ title: `Ban ${u.displayName}?`, message: "They're logged out everywhere, can't log back in, and their sign-ups in events that haven't been matched yet are withdrawn.", confirmLabel: 'Ban account', danger: true, reason: true, required: true }),
  unban: (u) => ({ title: `Unban ${u.displayName}?`, message: 'They can log in again. Withdrawn sign-ups are not restored.', confirmLabel: 'Unban', reason: true, required: false }),
  delete: (u) => ({ title: `Delete ${u.displayName}'s account?`, message: "Their personal details are wiped and they can't log in. Past events and gifts stay, credited to 'Deleted user'. This can't be undone.", confirmLabel: 'Delete account', danger: true, reason: true, required: false }),
};

const ROLE_NOTES = {
  user: 'They keep their account and events, but lose the moderation tools.',
  moderator: 'Moderators review reports, read and moderate museum chat, and look up accounts. They cannot ban people or change events.',
  admin: 'Admins can do everything: ban people, change roles, and moderate or delete any event.',
};

function ask(kind, user, role) {
  pending.value = { kind, user, role, ...DIALOGS[kind](user, role) };
}

async function run(reason = '') {
  const { kind, user, role } = pending.value;
  working.value = true;
  try {
    const base = `/admin/users/${user.id}`;
    if (kind === 'role') {
      await api(base, { method: 'PATCH', body: { role } });
      toast.success(role === 'user' ? `${user.displayName} is a regular member now.` : `${user.displayName} is now a ${SITE_ROLE_LABELS[role].toLowerCase()}.`);
    } else if (kind === 'ban') {
      const res = await api(`${base}/ban`, { method: 'POST', body: { reason } });
      const n = res.withdrawnApplications;
      toast.success(`${user.displayName} is banned${n ? ` and ${n} sign-up${n === 1 ? ' was' : 's were'} withdrawn` : ''}.`);
    } else if (kind === 'unban') {
      await api(`${base}/unban`, { method: 'POST', body: { reason } });
      toast.success(`${user.displayName} can log in again.`);
    } else if (kind === 'delete') {
      await api(base, { method: 'DELETE', body: { reason } });
      toast.success('Account deleted.');
    }
    pending.value = null;
    await load();
  } catch (e) {
    toast.error(e.message);
  } finally {
    working.value = false;
  }
}
</script>

<template>
  <div class="grid gap-5">
    <div class="filters card">
      <label class="input-wrap grow">
        <Search :size="18" class="input-icon" aria-hidden="true" />
        <input v-model="filters.q" class="input" type="search" placeholder="Search by name, username or email" aria-label="Search accounts" />
      </label>
      <select v-model="filters.status" class="select" aria-label="Account status">
        <option value="">Any status</option>
        <option value="active">Active</option>
        <option value="banned">Banned</option>
        <option value="deactivated">Deactivated</option>
      </select>
      <select v-model="filters.role" class="select" aria-label="Role">
        <option value="">Any role</option>
        <option value="admin">Site admins</option>
        <option value="moderator">Moderators</option>
        <option value="user">Members</option>
      </select>
    </div>

    <ErrorBlock v-if="error" :message="error" @retry="load" />
    <LoadingBlock v-else-if="!data" label="Loading accounts…" />
    <EmptyState v-else-if="!data.users.length" :icon="Users" title="No accounts match" message="Try a different search or filter." />
    <template v-else>
      <p class="hint" aria-live="polite">{{ data.total }} account{{ data.total === 1 ? '' : 's' }}</p>
      <ul class="rows" :class="{ dim: loading }">
        <li v-for="u in data.users" :key="u.id" class="card row">
          <div class="who">
            <UserAvatar :user="u" :size="40" />
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <PersonLink :user="linkableUser(u)" :size="0" />
                <span v-if="u.role !== 'user'" class="badge badge-admin">{{ SITE_ROLE_LABELS[u.role] }}</span>
                <StatusBadge kind="user" :status="u.status" />
                <span v-if="isMe(u)" class="hint">(you)</span>
              </div>
              <div class="hint truncate">
                {{ u.email }}<template v-if="u.username"> · @{{ u.username }}</template> · joined {{ formatDate(u.createdAt) }}
                · {{ u.eventsOrganized }} event{{ u.eventsOrganized === 1 ? '' : 's' }} organised
              </div>
              <div v-if="u.status === 'banned' && u.banReason" class="ban-note">Banned: {{ u.banReason }}</div>
            </div>
          </div>
          <div v-if="!isMe(u) && !u.email.endsWith('@deleted.invalid')" class="actions">
            <template v-if="u.status !== 'banned' && mayChangeRoles()">
              <template v-for="r in SITE_ROLES" :key="r">
                <button v-if="r !== u.role" class="btn btn-outline btn-sm" @click="ask('role', u, r)">
                  <ShieldOff v-if="r === 'user'" :size="16" aria-hidden="true" />
                  <ShieldCheck v-else :size="16" aria-hidden="true" />
                  {{ r === 'user' ? 'Remove role' : `Make ${SITE_ROLE_LABELS[r].toLowerCase()}` }}
                </button>
              </template>
            </template>
            <template v-if="u.role === 'user' && mayManage()">
              <button v-if="u.status === 'banned'" class="btn btn-outline btn-sm" @click="ask('unban', u)"><Undo2 :size="16" aria-hidden="true" /> Unban</button>
              <button v-else class="btn btn-outline btn-sm danger" @click="ask('ban', u)"><Ban :size="16" aria-hidden="true" /> Ban</button>
              <button class="btn btn-ghost btn-sm danger" @click="ask('delete', u)"><Trash2 :size="16" aria-hidden="true" /> Delete</button>
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
      v-if="pending?.reason"
      :open="true"
      :title="pending.title"
      :message="pending.message"
      :confirm-label="pending.confirmLabel"
      :danger="pending.danger"
      :required="pending.required"
      :loading="working"
      @confirm="run"
      @cancel="pending = null"
    />
    <ConfirmDialog
      v-else-if="pending"
      :open="true"
      :title="pending.title"
      :message="pending.message"
      :confirm-label="pending.confirmLabel"
      :danger="pending.danger"
      :loading="working"
      @confirm="run()"
      @cancel="pending = null"
    />
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
  flex: 1 1 260px;
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
  gap: 12px;
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
  gap: 12px;
  padding: 14px 18px;
}
.who {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1 1 320px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.danger {
  color: var(--danger);
}
.ban-note {
  margin-top: 4px;
  font-size: 0.85rem;
  color: var(--danger);
}
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
</style>
