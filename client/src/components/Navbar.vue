<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import {
  Palette,
  Plus,
  Menu,
  X,
  ChevronDown,
  UserRound,
  BookHeart,
  Bell,
  Settings,
  LogOut,
  Compass,
  LayoutDashboard,
  CalendarHeart,
  CircleHelp,
  Eye,
  ShieldCheck,
  UsersRound,
  Landmark,
  Users,
  Shirt,
  Heart,
} from 'lucide-vue-next';
import { can } from '@shared/permissions.mjs';
import NotificationBell from './NotificationBell.vue';
import DisplayToggles from './DisplayToggles.vue';
import UserAvatar from './UserAvatar.vue';
import { auth, logout } from '@/stores/auth';
import { notifications } from '@/stores/notifications';
import { toast } from '@/stores/toast';

const route = useRoute();
const router = useRouter();

const userMenuOpen = ref(false);
const mobileOpen = ref(false);
const userMenuRoot = ref(null);
const userMenuButton = ref(null);
const userMenuPanel = ref(null);
const mobilePanel = ref(null);
const hamburger = ref(null);
const header = ref(null);

const homeLink = computed(() => (auth.user ? '/dashboard' : '/'));

// Send people back to where they were after logging in (not from the home page itself)
const loginLink = computed(() =>
  route.name && route.name !== 'home' && route.name !== 'not-found'
    ? { name: 'login', query: { redirect: route.fullPath } }
    : { name: 'login' }
);

// Moderators get the same page with fewer tabs
const adminLabel = computed(() => (auth.user?.role === 'admin' ? 'Site admin' : 'Moderation'));

// The public page only exists once someone has a username
const accountLinks = computed(() => [
  ...(can(auth.user, 'admin.access') ? [{ to: '/admin', label: adminLabel.value, icon: ShieldCheck }] : []),
  { to: '/profile', label: 'Your profile', icon: UserRound },
  { to: '/friends', label: 'Friends', icon: Users },
  { to: '/saved', label: 'Saved art', icon: Heart },
  { to: '/avatar', label: 'Museum avatar', icon: Shirt },
  ...(auth.user?.username
    ? [{ to: `/users/${encodeURIComponent(auth.user.username)}`, label: 'View public profile', icon: Eye }]
    : []),
  { to: '/characters', label: 'Character library', icon: BookHeart },
  { to: '/notification', label: 'Notifications', icon: Bell },
  { to: '/settings/account', label: 'Account settings', icon: Settings },
]);

// Browse events stays lit on event pages, but not on /events/new (that has its own button)
const browseActive = computed(() => route.name === 'events' || route.name === 'event');

function closeMenus() {
  userMenuOpen.value = false;
  mobileOpen.value = false;
}

async function doLogout() {
  closeMenus();
  await logout();
  toast.info("You're logged out. See you soon!");
  await router.push('/');
  // Already on the home page: the route didn't change, so put focus somewhere sensible
  await nextTick();
  skipToContent();
}

// Every page renders a <main>, but not all of them give it an id, so focus it directly
function skipToContent() {
  const main = document.querySelector('main');
  if (!main) return;
  if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
  main.focus();
}

// composedPath() is taken when the click happens. e.target can be an icon that Vue has already swapped
// out by the time this document-level listener runs, which made the hamburger close itself.
function onClickOutside(e) {
  const path = e.composedPath ? e.composedPath() : [];
  const inside = (el) => Boolean(el) && (path.length ? path.includes(el) : el.contains(e.target));
  if (userMenuOpen.value && !inside(userMenuRoot.value)) userMenuOpen.value = false;
  if (mobileOpen.value && !inside(mobilePanel.value) && !inside(hamburger.value)) mobileOpen.value = false;
}

function onKeydown(e) {
  if (e.key !== 'Escape') return;
  if (userMenuOpen.value) {
    userMenuOpen.value = false;
    userMenuButton.value?.focus();
  }
  if (mobileOpen.value) {
    mobileOpen.value = false;
    hamburger.value?.focus();
  }
}

// Arrow keys move through the account menu like a menu; Tab still works as normal
function menuItems() {
  return userMenuPanel.value ? [...userMenuPanel.value.querySelectorAll('a[href], button:not([disabled])')] : [];
}
async function openUserMenu(focusFirst = false) {
  userMenuOpen.value = true;
  if (focusFirst) {
    await nextTick();
    menuItems()[0]?.focus();
  }
}
function onUserButtonKeydown(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    openUserMenu(true);
  }
}
function onMenuKeydown(e) {
  const items = menuItems();
  if (!items.length) return;
  const index = items.indexOf(document.activeElement);
  let next = null;
  if (e.key === 'ArrowDown') next = (index + 1) % items.length;
  else if (e.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
  else if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = items.length - 1;
  if (next === null) return;
  e.preventDefault();
  items[next].focus();
}

// Tabbing out of the header closes whatever menu was open
function onFocusOut(e) {
  const to = e.relatedTarget;
  if (to && header.value && !header.value.contains(to)) closeMenus();
}

// The mobile panel shouldn't stay open if the window is widened past the breakpoint
let mediaQuery = null;
function onBreakpoint(e) {
  if (e.matches) mobileOpen.value = false;
}

onMounted(() => {
  document.addEventListener('click', onClickOutside);
  document.addEventListener('keydown', onKeydown);
  mediaQuery = window.matchMedia('(min-width: 1200px)');
  mediaQuery.addEventListener?.('change', onBreakpoint);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside);
  document.removeEventListener('keydown', onKeydown);
  mediaQuery?.removeEventListener?.('change', onBreakpoint);
});

watch(() => route.fullPath, closeMenus);

// Google/Discord sign-in lands on /dashboard?reactivated=1 when it woke up a deactivated
// account. The navbar is on every page, so it says hello and tidies the URL.
watch(
  () => route.query.reactivated,
  (value) => {
    if (value !== '1' || !auth.user) return;
    toast.success('Welcome back, your account is active again.');
    const query = { ...route.query };
    delete query.reactivated;
    router.replace({ query, hash: route.hash });
  },
  { immediate: true }
);
</script>

<template>
  <header ref="header" class="topbar" @focusout="onFocusOut">
    <a href="#main" class="skip-link" @click.prevent="skipToContent">Skip to content</a>
    <div class="bar">
      <RouterLink :to="homeLink" class="brand" aria-label="Drawsicle home">
        <span class="brand-tile"><Palette :size="24" aria-hidden="true" /></span>
        <span class="brand-name">Drawsicle</span>
      </RouterLink>

      <nav class="desktop-nav" aria-label="Main">
        <RouterLink
          to="/events"
          class="nav-link"
          :class="{ 'is-active': browseActive }"
          active-class=""
          exact-active-class=""
          :aria-current="browseActive ? 'page' : undefined"
        >
          Browse events
        </RouterLink>
        <RouterLink to="/discover" class="nav-link">Discover</RouterLink>
        <RouterLink to="/museum" class="nav-link">Museum</RouterLink>
        <template v-if="auth.user">
          <RouterLink to="/dashboard" class="nav-link">Dashboard</RouterLink>
          <RouterLink to="/my-events" class="nav-link">My events</RouterLink>
          <RouterLink v-if="can(auth.user, 'admin.access')" to="/admin" class="nav-link admin-link">
            <ShieldCheck :size="16" aria-hidden="true" /> {{ auth.user.role === 'admin' ? 'Admin' : 'Moderation' }}
          </RouterLink>
        </template>
        <RouterLink v-else to="/help" class="nav-link">Help</RouterLink>
      </nav>

      <div class="right">
        <DisplayToggles />
        <template v-if="auth.user">
          <RouterLink to="/events/new" class="btn btn-primary btn-sm new-btn desktop-only" title="New event">
            <Plus :size="18" aria-hidden="true" />
            <span class="new-label">New event</span>
          </RouterLink>

          <NotificationBell />

          <div ref="userMenuRoot" class="user-menu desktop-only">
            <button
              ref="userMenuButton"
              type="button"
              class="user-btn"
              :aria-expanded="userMenuOpen ? 'true' : 'false'"
              aria-controls="user-menu-panel"
              @click="userMenuOpen = !userMenuOpen"
              @keydown="onUserButtonKeydown"
            >
              <UserAvatar :user="auth.user" :size="38" />
              <span class="user-name">{{ auth.user.displayName }}</span>
              <span class="sr-only">Account menu</span>
              <ChevronDown :size="16" class="chev" :class="{ flipped: userMenuOpen }" aria-hidden="true" />
            </button>

            <div
              v-if="userMenuOpen"
              id="user-menu-panel"
              ref="userMenuPanel"
              class="menu card"
              @keydown="onMenuKeydown"
            >
              <div class="menu-user">
                <span class="menu-user-name">{{ auth.user.displayName }}</span>
                <span v-if="auth.user.username" class="menu-user-handle">@{{ auth.user.username }}</span>
              </div>
              <ul class="menu-list">
                <li v-for="item in accountLinks" :key="item.to">
                  <RouterLink :to="item.to" class="menu-item" @click="userMenuOpen = false">
                    <component :is="item.icon" :size="18" aria-hidden="true" />
                    {{ item.label }}
                  </RouterLink>
                </li>
                <li class="menu-sep" aria-hidden="true" />
                <li>
                  <RouterLink to="/help" class="menu-item" @click="userMenuOpen = false">
                    <CircleHelp :size="18" aria-hidden="true" /> Help
                  </RouterLink>
                </li>
                <li>
                  <button type="button" class="menu-item" @click="doLogout">
                    <LogOut :size="18" aria-hidden="true" /> Log out
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </template>

        <template v-else-if="auth.checked">
          <RouterLink :to="loginLink" class="nav-link desktop-only">Log in</RouterLink>
          <RouterLink to="/register" class="btn btn-primary btn-sm desktop-only">Sign up</RouterLink>
        </template>

        <button
          ref="hamburger"
          type="button"
          class="hamburger mobile-only"
          :aria-expanded="mobileOpen ? 'true' : 'false'"
          aria-controls="mobile-menu"
          :aria-label="mobileOpen ? 'Close menu' : 'Open menu'"
          @click="mobileOpen = !mobileOpen"
        >
          <X v-if="mobileOpen" :size="24" aria-hidden="true" />
          <Menu v-else :size="24" aria-hidden="true" />
        </button>
      </div>
    </div>

    <Transition name="drop">
      <nav v-if="mobileOpen" id="mobile-menu" ref="mobilePanel" class="mobile-panel" aria-label="Menu">
        <div v-if="auth.user" class="mobile-user">
          <UserAvatar :user="auth.user" :size="44" />
          <div class="mobile-user-text">
            <span class="menu-user-name">{{ auth.user.displayName }}</span>
            <span class="menu-user-handle">{{ auth.user.username ? `@${auth.user.username}` : auth.user.email }}</span>
          </div>
        </div>

        <ul class="mobile-list">
          <li>
            <RouterLink to="/events" class="mobile-link" :class="{ 'is-active': browseActive }" active-class="" exact-active-class="">
              <Compass :size="20" aria-hidden="true" /> Browse events
            </RouterLink>
          </li>
          <li>
            <RouterLink to="/discover" class="mobile-link">
              <UsersRound :size="20" aria-hidden="true" /> Discover artists
            </RouterLink>
          </li>
          <li>
            <RouterLink to="/museum" class="mobile-link">
              <Landmark :size="20" aria-hidden="true" /> Museum
            </RouterLink>
          </li>
          <template v-if="auth.user">
            <li>
              <RouterLink to="/dashboard" class="mobile-link">
                <LayoutDashboard :size="20" aria-hidden="true" /> Dashboard
              </RouterLink>
            </li>
            <li>
              <RouterLink to="/my-events" class="mobile-link">
                <CalendarHeart :size="20" aria-hidden="true" /> My events
              </RouterLink>
            </li>
            <li>
              <RouterLink to="/events/new" class="mobile-link">
                <Plus :size="20" aria-hidden="true" /> New event
              </RouterLink>
            </li>
            <li class="mobile-sep" aria-hidden="true" />
            <li v-for="item in accountLinks" :key="item.to">
              <RouterLink :to="item.to" class="mobile-link">
                <component :is="item.icon" :size="20" aria-hidden="true" />
                {{ item.label }}
                <span
                  v-if="item.to === '/notification' && notifications.unreadCount"
                  class="count-pill"
                >
                  {{ notifications.unreadCount }} new
                </span>
              </RouterLink>
            </li>
            <li class="mobile-sep" aria-hidden="true" />
            <li>
              <RouterLink to="/help" class="mobile-link"><CircleHelp :size="20" aria-hidden="true" /> Help</RouterLink>
            </li>
            <li>
              <button type="button" class="mobile-link" @click="doLogout">
                <LogOut :size="20" aria-hidden="true" /> Log out
              </button>
            </li>
          </template>
          <template v-else>
            <li>
              <RouterLink to="/help" class="mobile-link"><CircleHelp :size="20" aria-hidden="true" /> Help</RouterLink>
            </li>
            <li class="mobile-sep" aria-hidden="true" />
            <li class="mobile-auth">
              <RouterLink :to="loginLink" class="btn btn-outline btn-block">Log in</RouterLink>
              <RouterLink to="/register" class="btn btn-primary btn-block">Sign up</RouterLink>
            </li>
          </template>
        </ul>
      </nav>
    </Transition>
  </header>
</template>

<style scoped>
.topbar {
  position: sticky;
  top: 0;
  z-index: 40;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border);
}
.bar {
  max-width: 1280px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 28px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text);
  flex-shrink: 0;
}
.brand:hover {
  color: var(--text);
}
.brand-tile {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: var(--pink);
  color: #fff;
  display: grid;
  place-items: center;
  box-shadow: 0 3px 10px rgba(236, 106, 147, 0.28);
}
.brand-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.45rem;
}
.desktop-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 12px;
}
.nav-link {
  padding: 8px 13px;
  border-radius: 12px;
  color: var(--text);
  font-weight: 600;
  white-space: nowrap;
}
.nav-link:hover {
  background: var(--hover);
  color: var(--text);
}
.nav-link.router-link-active,
.nav-link.is-active {
  background: var(--pink-soft);
  color: var(--pink-dark);
}
.right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}
.new-btn {
  white-space: nowrap;
}
.user-menu {
  position: relative;
}
.user-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  border: 0;
  background: none;
  color: var(--text);
  cursor: pointer;
  padding: 4px 10px 4px 4px;
  border-radius: 999px;
}
.user-btn:hover,
.user-btn[aria-expanded='true'] {
  background: var(--hover);
}
.user-btn:focus-visible {
  border-radius: 999px;
}
.user-name {
  font-weight: 600;
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chev {
  color: var(--muted);
  transition: transform 0.15s;
}
.chev.flipped {
  transform: rotate(180deg);
}
.menu {
  position: absolute;
  right: 0;
  top: calc(100% + 10px);
  min-width: 240px;
  padding: 6px;
  z-index: 60;
}
.menu-user {
  display: flex;
  flex-direction: column;
  padding: 10px 12px 12px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 6px;
}
.menu-user-name {
  font-weight: 700;
  overflow-wrap: anywhere;
}
.menu-user-handle {
  color: var(--muted);
  font-size: 0.88rem;
  overflow-wrap: anywhere;
}
.menu-list,
.mobile-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  background: none;
  border-radius: 10px;
  color: var(--text);
  font-weight: 500;
  cursor: pointer;
  text-align: left;
}
.menu-item:hover {
  background: var(--hover);
  color: var(--text);
}
.menu-item.router-link-active {
  color: var(--pink-dark);
}
.menu-sep,
.mobile-sep {
  height: 1px;
  background: var(--border);
  margin: 6px 4px;
}
.hamburger {
  border: 0;
  background: none;
  color: var(--text);
  padding: 8px;
  border-radius: 12px;
  cursor: pointer;
  display: grid;
  place-items: center;
}
.hamburger:hover,
.hamburger[aria-expanded='true'] {
  background: var(--hover);
}

.mobile-panel {
  border-top: 1px solid var(--border);
  padding: 12px 16px 18px;
  max-height: calc(100vh - 66px);
  max-height: calc(100dvh - 66px);
  overflow-y: auto;
}
.mobile-user {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 8px 14px;
}
.mobile-user-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.mobile-link {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 10px;
  border: 0;
  background: none;
  border-radius: 12px;
  color: var(--text);
  font-weight: 600;
  font-size: 1.02rem;
  text-align: left;
  cursor: pointer;
}
.mobile-link:hover {
  background: var(--hover);
  color: var(--text);
}
.mobile-link.router-link-active,
.mobile-link.is-active {
  background: var(--pink-soft);
  color: var(--pink-dark);
}
.count-pill {
  margin-left: auto;
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--pink);
  color: #fff;
  font-size: 0.78rem;
}
.mobile-auth {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding-top: 8px;
}

.mobile-only {
  display: none;
}

@media (max-width: 1260px) {
  .user-name {
    display: none;
  }
  .nav-link {
    padding: 8px 9px;
  }
  .user-btn {
    padding-right: 8px;
  }
}
@media (max-width: 1080px) {
  .new-label {
    display: none;
  }
  .new-btn {
    padding: 9px 11px;
  }
  .bar {
    padding: 12px 20px;
  }
  .desktop-nav {
    margin-left: 4px;
  }
}
/* Museum and Moderation made the bar longer: switch to the menu a little earlier */
@media (max-width: 1199.98px) {
  .desktop-nav,
  .desktop-only {
    display: none;
  }
  .mobile-only {
    display: grid;
  }
  .bar {
    padding: 9px 16px;
    gap: 8px;
  }
  .right {
    gap: 4px;
  }
  .brand-tile {
    width: 40px;
    height: 40px;
  }
  .brand-name {
    font-size: 1.25rem;
  }
}

.drop-enter-active,
.drop-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.drop-enter-from,
.drop-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
@media (prefers-reduced-motion: reduce) {
  .drop-enter-active,
  .drop-leave-active,
  .chev {
    transition: none;
  }
}
.admin-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
