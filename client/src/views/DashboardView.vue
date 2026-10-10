<script setup>
import { ref, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { Bell, Sparkles, ArrowRight, CalendarHeart, BellPlus } from 'lucide-vue-next';
import { auth } from '../stores/auth';
import { notifications, refreshUnreadCount, loadNotifications } from '../stores/notifications';
import { api } from '../api';

const memberships = ref([]);
const membershipsLoaded = ref(false);
const isDev = import.meta.env.DEV;

onMounted(async () => {
  refreshUnreadCount();
  try {
    memberships.value = (await api('/memberships/mine')).memberships;
  } catch {
    memberships.value = [];
  } finally {
    membershipsLoaded.value = true;
  }
});

async function sendTestNotification() {
  await api('/notifications/test', { method: 'POST' });
  await loadNotifications();
}
</script>

<template>
  <main v-if="auth.user" class="page">
    <h1 class="welcome">Welcome, {{ auth.user.displayName }} 🎨</h1>
    <p class="lead">Your Drawisicle account is ready. Events, matching, and exchanges come next.</p>

    <section class="stats">
      <div class="card stat">
        <span class="stat-label">Your role</span>
        <span class="badge" :class="auth.user.role === 'admin' ? 'badge-admin' : 'badge-member'">
          {{ auth.user.role === 'admin' ? 'ADMIN' : 'MEMBER' }}
        </span>
      </div>
      <div class="card stat">
        <span class="stat-label">Unread notifications</span>
        <span class="stat-value"><Bell :size="24" /> {{ notifications.unreadCount }}</span>
      </div>
      <div class="card stat">
        <span class="stat-label">Account</span>
        <span class="stat-value email" :title="auth.user.email">{{ auth.user.email }}</span>
      </div>
    </section>

    <section class="card panel">
      <h2 class="panel-title"><CalendarHeart :size="26" /> Your events</h2>
      <p v-if="!membershipsLoaded" class="muted">Loading…</p>
      <p v-else-if="!memberships.length" class="muted">
        You haven't joined any art exchanges yet. When you do, your role in each one shows up here.
      </p>
      <ul v-else class="events">
        <li v-for="m in memberships" :key="m.eventId" class="event-row">
          <span class="event-name">{{ m.eventName || 'Untitled event' }}</span>
          <span class="roles">
            <span v-for="r in m.roles" :key="r" class="badge badge-role">{{ r }}</span>
          </span>
        </li>
      </ul>
    </section>

    <section class="card panel">
      <h2 class="panel-title"><Sparkles :size="26" /> Next steps</h2>
      <template v-if="!auth.user.profileComplete">
        <p class="muted">Set up your artist profile to participate in exchanges.</p>
        <RouterLink to="/profile" class="cta">Complete your profile <ArrowRight :size="20" /></RouterLink>
      </template>
      <template v-else>
        <p class="muted">Your profile is all set. Keep an eye on your notifications for new events.</p>
        <RouterLink to="/profile" class="cta">Edit your profile <ArrowRight :size="20" /></RouterLink>
      </template>

      <button v-if="isDev" class="btn btn-ghost dev-btn" @click="sendTestNotification">
        <BellPlus :size="16" /> Send me a test notification (dev only)
      </button>
    </section>
  </main>
</template>

<style scoped>
.welcome {
  font-size: clamp(1.9rem, 4vw, 2.6rem);
  font-weight: 800;
}
.lead {
  margin: 14px 0 0;
  color: var(--muted);
  font-size: 1.25rem;
}
.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 32px;
  margin-top: 52px;
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 18px;
  padding: 44px 48px;
  min-width: 0;
}
.stat-label {
  color: var(--muted);
  font-size: 1.2rem;
}
.stat .badge {
  font-size: 1.05rem;
  padding: 6px 22px;
}
.stat-value {
  display: inline-flex;
  align-items: center;
  gap: 14px;
  font-size: 1.6rem;
  font-weight: 500;
  max-width: 100%;
}
.email {
  display: block;
  font-size: 1.35rem;
  overflow-wrap: anywhere;
}
.panel {
  margin-top: 32px;
  padding: 44px 48px;
}
.panel-title {
  display: flex;
  align-items: center;
  gap: 14px;
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 1.6rem;
}
.muted {
  margin: 14px 0 0;
  color: var(--muted);
  font-size: 1.15rem;
}
.cta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-top: 48px;
  font-size: 1.5rem;
  font-weight: 500;
}
.events {
  list-style: none;
  margin: 18px 0 0;
  padding: 0;
}
.event-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 14px 0;
  border-top: 1px solid var(--border);
}
.event-row:first-child {
  border-top: 0;
}
.event-name {
  font-weight: 600;
}
.roles {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.dev-btn {
  display: flex;
  margin-top: 28px;
  font-size: 0.85rem;
}
@media (max-width: 900px) {
  .stats {
    grid-template-columns: 1fr;
    gap: 16px;
    margin-top: 32px;
  }
  .stat,
  .panel {
    padding: 28px 24px;
  }
  .panel {
    margin-top: 16px;
  }
  .cta {
    margin-top: 28px;
    font-size: 1.2rem;
  }
}
</style>
