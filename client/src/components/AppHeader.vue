<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import { Palette, UserRound, LogOut, ChevronDown } from 'lucide-vue-next';
import NotificationBell from './NotificationBell.vue';
import UserAvatar from './UserAvatar.vue';
import { auth, logout } from '../stores/auth';

const router = useRouter();
const menuOpen = ref(false);
const menuRoot = ref(null);

async function doLogout() {
  menuOpen.value = false;
  await logout();
  router.push('/login');
}

function onClickOutside(e) {
  if (menuOpen.value && menuRoot.value && !menuRoot.value.contains(e.target)) menuOpen.value = false;
}
onMounted(() => document.addEventListener('click', onClickOutside));
onBeforeUnmount(() => document.removeEventListener('click', onClickOutside));
</script>

<template>
  <header class="topbar">
    <RouterLink to="/dashboard" class="brand">
      <span class="brand-tile"><Palette :size="26" /></span>
      <span class="brand-name">Drawisicle</span>
    </RouterLink>

    <div class="right">
      <NotificationBell />

      <div ref="menuRoot" class="user-menu">
        <button class="user-btn" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">
          <UserAvatar :user="auth.user" :size="44" />
          <span class="user-name">{{ auth.user?.displayName }}</span>
          <ChevronDown :size="16" class="chev" />
        </button>

        <div v-if="menuOpen" class="menu card" role="menu">
          <RouterLink to="/profile" class="menu-item" role="menuitem" @click="menuOpen = false">
            <UserRound :size="18" /> Your profile
          </RouterLink>
          <button class="menu-item" role="menuitem" @click="doLogout">
            <LogOut :size="18" /> Log out
          </button>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 14px 28px;
  background: rgba(255, 253, 250, 0.92);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border);
}
.brand {
  display: flex;
  align-items: center;
  gap: 14px;
  color: var(--text);
}
.brand:hover {
  color: var(--text);
}
.brand-tile {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--pink);
  color: #fff;
  display: grid;
  place-items: center;
}
.brand-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.5rem;
}
.right {
  display: flex;
  align-items: center;
  gap: 18px;
}
.user-menu {
  position: relative;
}
.user-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 0;
  background: none;
  color: var(--text);
  cursor: pointer;
  padding: 4px 8px 4px 4px;
  border-radius: 999px;
}
.user-btn:hover {
  background: #f5eee1;
}
.user-name {
  font-size: 1.05rem;
  font-weight: 500;
}
.chev {
  color: var(--muted);
}
.menu {
  position: absolute;
  right: 0;
  top: calc(100% + 10px);
  min-width: 200px;
  padding: 6px;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 11px 12px;
  border: 0;
  background: none;
  border-radius: 10px;
  color: var(--text);
  font-weight: 500;
  cursor: pointer;
  text-align: left;
}
.menu-item:hover {
  background: #faf3e7;
  color: var(--text);
}
@media (max-width: 640px) {
  .topbar {
    padding: 10px 16px;
  }
  .brand-tile {
    width: 42px;
    height: 42px;
  }
  .brand-name {
    font-size: 1.25rem;
  }
  .user-name,
  .chev {
    display: none;
  }
}
</style>
