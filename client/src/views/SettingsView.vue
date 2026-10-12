<script setup>
import { ref, watch, nextTick, onMounted } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { UserRound, BookHeart, Bell, Settings } from 'lucide-vue-next';
import { notifications } from '@/stores/notifications';

// Shell for /profile, /characters, /notification and /settings/account: side menu + the page.
// The child pages render without their own .page wrapper.
const route = useRoute();

const ITEMS = [
  { to: '/profile', label: 'Profile', icon: UserRound, routes: ['profile'] },
  {
    to: '/characters',
    label: 'Character library',
    icon: BookHeart,
    routes: ['characters', 'character-new', 'character-edit'],
  },
  { to: '/notification', label: 'Notifications', icon: Bell, routes: ['notifications'] },
  { to: '/settings/account', label: 'Account', icon: Settings, routes: ['account'] },
];

const isActive = (item) => item.routes.includes(route.name);

// On phones the menu is a sideways-scrolling row; keep the current page's pill in view
const list = ref(null);
function revealActive() {
  const el = list.value?.querySelector('.side-link.active');
  if (!el || list.value.scrollWidth <= list.value.clientWidth) return;
  list.value.scrollLeft = el.offsetLeft - (list.value.clientWidth - el.offsetWidth) / 2;
}
onMounted(revealActive);
watch(() => route.name, () => nextTick(revealActive));
</script>

<template>
  <main id="main" class="page settings-page">
    <aside class="side">
      <p class="side-title" aria-hidden="true">Settings</p>
      <nav aria-label="Settings">
        <ul ref="list" class="side-list">
          <li v-for="item in ITEMS" :key="item.to">
            <RouterLink
              :to="item.to"
              class="side-link"
              :class="{ active: isActive(item) }"
              active-class=""
              exact-active-class=""
              :aria-current="isActive(item) ? 'page' : undefined"
            >
              <component :is="item.icon" :size="19" aria-hidden="true" />
              <span>{{ item.label }}</span>
              <template v-if="item.to === '/notification' && notifications.unreadCount">
                <span class="count" aria-hidden="true">
                  {{ notifications.unreadCount > 99 ? '99+' : notifications.unreadCount }}
                </span>
                <span class="sr-only">({{ notifications.unreadCount }} unread)</span>
              </template>
            </RouterLink>
          </li>
        </ul>
      </nav>
    </aside>

    <div class="content">
      <RouterView />
    </div>
  </main>
</template>

<style scoped>
.settings-page {
  display: grid;
  grid-template-columns: 230px minmax(0, 1fr);
  gap: 40px;
  align-items: start;
}
.side {
  position: sticky;
  top: 96px;
}
.side-title {
  margin: 4px 12px 12px;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
.side-list {
  position: relative;
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.side-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  border-radius: 14px;
  color: var(--text);
  font-weight: 600;
  white-space: nowrap;
}
.side-link:hover {
  background: var(--hover);
  color: var(--text);
}
.side-link.active {
  background: var(--pink-soft);
  color: var(--pink-dark);
}
.side-link:focus-visible {
  border-radius: 14px;
}
.count {
  margin-left: auto;
  min-width: 22px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--pink);
  color: #fff;
  font-size: 0.75rem;
  text-align: center;
}
.content {
  min-width: 0;
}

@media (max-width: 860px) {
  .settings-page {
    grid-template-columns: minmax(0, 1fr);
    gap: 24px;
  }
  .side {
    position: static;
  }
  .side-title {
    display: none;
  }
  .side-list {
    flex-direction: row;
    gap: 6px;
    overflow-x: auto;
    padding: 2px 2px 6px;
    scrollbar-width: none;
  }
  .side-list::-webkit-scrollbar {
    display: none;
  }
  .side-list li {
    flex-shrink: 0;
  }
  .side-link {
    padding: 9px 14px;
    border: 1px solid var(--border);
    background: var(--surface);
    border-radius: 999px;
    font-size: 0.95rem;
    gap: 8px;
  }
  .side-link.active {
    border-color: var(--pink);
  }
  .side-link:focus-visible {
    border-radius: 999px;
  }
  .count {
    margin-left: 2px;
  }
}
</style>
