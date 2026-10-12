<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ShieldCheck } from 'lucide-vue-next';
import { isMockMode } from '@/api';
import PageHeader from '@/components/ui/PageHeader.vue';
import TabNav from '@/components/ui/TabNav.vue';
import AdminOverview from '@/components/admin/AdminOverview.vue';
import AdminUsers from '@/components/admin/AdminUsers.vue';
import AdminEvents from '@/components/admin/AdminEvents.vue';
import AdminActivity from '@/components/admin/AdminActivity.vue';

const route = useRoute();
const router = useRouter();

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'users', label: 'Accounts' },
  { key: 'events', label: 'Events' },
  { key: 'activity', label: 'Audit log' },
];
const PANELS = { overview: AdminOverview, users: AdminUsers, events: AdminEvents, activity: AdminActivity };

const tab = computed({
  get: () => (PANELS[route.query.tab] ? route.query.tab : 'overview'),
  set: (key) => router.replace({ query: { ...route.query, tab: key === 'overview' ? undefined : key } }),
});
</script>

<template>
  <main id="main" class="page" tabindex="-1">
    <PageHeader title="Site admin" subtitle="Moderate events, manage accounts and see what other admins have done.">
      <span class="badge badge-admin inline-flex items-center gap-1"><ShieldCheck :size="14" aria-hidden="true" /> Admin only</span>
    </PageHeader>

    <p v-if="isMockMode" class="alert alert-error mt-6">
      The admin tools need the real server, so they aren't available in demo mode. Run the app with Start-all to try them.
    </p>
    <template v-else>
      <TabNav v-model="tab" :tabs="TABS" class="mt-6" />
      <div class="mt-6">
        <KeepAlive>
          <component :is="PANELS[tab]" :key="tab" />
        </KeepAlive>
      </div>
    </template>
  </main>
</template>
