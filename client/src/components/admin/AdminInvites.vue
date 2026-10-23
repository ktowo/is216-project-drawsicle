<script setup>
import { ref, onMounted } from 'vue';
import { Copy, Plus, Ticket, Users } from 'lucide-vue-next';
import { api } from '@/api';
import { toast } from '@/stores/toast';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import { formatDate, formatDateTime } from '@/utils/format';

const data = ref(null);
const error = ref('');
const form = ref({ code: '', capacity: 25 });
const working = ref(false);
const editing = ref(null);

async function load() {
  try {
    data.value = await api('/admin/invites');
  } catch (e) {
    error.value = e.message;
  }
}
async function create() {
  working.value = true;
  try {
    await api('/admin/invites', { method: 'POST', body: form.value });
    form.value = { code: '', capacity: 25 };
    toast.success('Invite code created.');
    await load();
  } catch (e) {
    toast.error(e.message);
  } finally {
    working.value = false;
  }
}
async function copy(code) {
  await navigator.clipboard?.writeText(code);
  toast.success('Invite code copied.');
}
async function saveCapacity(invite) {
  try {
    await api(`/admin/invites/${invite.id}`, { method: 'PATCH', body: { capacity: invite.capacity } });
    toast.success('Capacity updated.');
    editing.value = null;
    await load();
  } catch (e) {
    toast.error(e.message);
  }
}
onMounted(load);
</script>

<template>
  <div class="grid gap-6">
    <section class="card p-5">
      <h2 class="section-title flex items-center gap-2"><Plus :size="18" /> Create invite code</h2>
      <form class="mt-4 flex flex-wrap items-end gap-3" @submit.prevent="create">
        <label class="grid gap-1 grow">
          <span class="hint">Code</span>
          <input v-model="form.code" class="input" placeholder="SPRING-2027" maxlength="40" required />
        </label>
        <label class="grid gap-1 w-32">
          <span class="hint">Capacity</span>
          <input v-model.number="form.capacity" class="input" type="number" min="1" max="10000" required />
        </label>
        <button class="btn btn-primary" :disabled="working"><Plus :size="16" /> Create</button>
      </form>
      <p class="hint mt-3">Each code has its own signup limit. Existing or banned accounts cannot register again.</p>
    </section>
    <ErrorBlock v-if="error" :message="error" @retry="load" />
    <LoadingBlock v-else-if="!data" label="Loading invite codes…" />
    <EmptyState v-else-if="!data.invites.length" :icon="Ticket" title="No invite codes yet" message="Create one above to open registration." />
    <ul v-else class="grid gap-4">
      <li v-for="invite in data.invites" :key="invite.id" class="card p-5">
        <div class="flex flex-wrap items-center gap-3">
          <Ticket :size="20" class="text-brand" />
          <code class="font-semibold">{{ invite.code }}</code>
          <button class="btn btn-outline btn-sm" @click="copy(invite.code)"><Copy :size="15" /> Copy</button>
          <span class="ml-auto badge"><Users :size="14" /> {{ invite.used }} / {{ invite.capacity }}</span>
          <button class="btn btn-outline btn-sm" @click="editing = editing === invite.id ? null : invite.id">Set capacity</button>
        </div>
        <form v-if="editing === invite.id" class="mt-3 flex items-end gap-2" @submit.prevent="saveCapacity(invite)">
          <label class="grid gap-1 w-32"><span class="hint">New capacity</span><input v-model.number="invite.capacity" class="input" type="number" :min="invite.used || 1" max="10000" /></label>
          <button class="btn btn-primary btn-sm">Save</button>
        </form>
        <div class="mt-3 h-2 rounded bg-soft"><div class="h-2 rounded bg-brand" :style="{ width: `${Math.min(100, invite.used / invite.capacity * 100)}%` }" /></div>
        <ul v-if="invite.signups.length" class="mt-4 grid gap-2">
          <li v-for="signup in invite.signups" :key="signup.email" class="flex justify-between gap-3 text-sm">
            <span>{{ signup.email }}</span><span class="hint">{{ formatDateTime(signup.signedUpAt) }}</span>
          </li>
        </ul>
        <p v-else class="hint mt-3">No one has used this code yet · created {{ formatDate(invite.createdAt) }}</p>
      </li>
    </ul>
  </div>
</template>
