<script setup>
import { computed } from 'vue';
import { auth } from '@/stores/auth';
import { can } from '@shared/permissions.mjs';
import { useRoute, useRouter } from 'vue-router';
import { ShieldCheck } from 'lucide-vue-next';
import { isMockMode } from '@/api';
import PageHeader from '@/components/ui/PageHeader.vue';
import TabNav from '@/components/ui/TabNav.vue';
import AdminOverview from '@/components/admin/AdminOverview.vue';
import AdminUsers from '@/components/admin/AdminUsers.vue';
import AdminEvents from '@/components/admin/AdminEvents.vue';
import AdminActivity from '@/components/admin/AdminActivity.vue';
import AdminReports from '@/components/admin/AdminReports.vue';
import AdminChat from '@/components/admin/AdminChat.vue';

const route = useRoute();
const router = useRouter();

// Each tab needs a permission (shared/permissions.mjs); moderators see fewer of them
const ALL_TABS = [
  { key: 'overview', label: 'Overview', permission: 'stats.view' },
  { key: 'reports', label: 'Reports', permission: 'reports.review' },
  { key: 'chat', label: 'Chat logs', permission: 'chat.logs' },
  { key: 'users', label: 'Accounts', permission: 'users.view' },
  { key: 'events', label: 'Events', permission: 'events.moderate' },
  { key: 'activity', label: 'Audit log', permission: 'audit.view' },
];
const TABS = computed(() => ALL_TABS.filter((t) => can(auth.user, t.permission)));
const isAdmin = computed(() => auth.user?.role === 'admin');
const PANELS = {
  overview: AdminOverview,
  reports: AdminReports,
  chat: AdminChat,
  users: AdminUsers,
  events: AdminEvents,
  activity: AdminActivity,
};

const tab = computed({
  get: () => (TABS.value.some((t) => t.key === route.query.tab) ? route.query.tab : TABS.value[0]?.key),
  set: (key) => router.replace({ query: { ...route.query, tab: key === TABS.value[0]?.key ? undefined : key } }),
});
</script>

<template>
  <main id="main" class="page" tabindex="-1">
    <PageHeader
      :title="isAdmin ? 'Site admin' : 'Moderation'"
      :subtitle="
        isAdmin
          ? 'Review reports, moderate events, manage accounts and see what other admins have done.'
          : 'Review reports and museum chat, and look up accounts. Site admins handle bans and events.'
      "
    >
      <span class="badge badge-admin inline-flex items-center gap-1">
        <ShieldCheck :size="14" aria-hidden="true" /> {{ isAdmin ? 'Admin only' : 'Moderators' }}
      </span>
    </PageHeader>

    <p v-if="isMockMode" class="alert alert-error mt-6">
      The admin tools need the real server, so they aren't available in demo mode. Run the app with Start-all to try them.
    </p>
    <template v-else>
      <TabNav v-model="tab" :tabs="TABS" class="mt-6" />
      <div class="mt-6">
        <KeepAlive>
          <component :is="PANELS[tab]" v-if="tab" :key="tab" />
        </KeepAlive>
      </div>
    </template>
  </main>
</template>
