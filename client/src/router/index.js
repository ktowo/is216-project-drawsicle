import { createRouter, createWebHistory, createWebHashHistory } from 'vue-router';
import { auth, loadUser } from '../stores/auth';
import { can } from '@shared/permissions.mjs';

// meta:
//   requiresAuth  - send guests to /login first
//   guestOnly     - logged-in users go to /dashboard instead
//   hideChrome    - no navbar/footer (full-page auth screens)
//   title         - browser tab title
const routes = [
  { path: '/', name: 'home', component: () => import('../views/HomeView.vue'), meta: { title: 'Art exchanges made easy' } },

  // Logged-out pages
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { guestOnly: true, hideChrome: true, title: 'Log in' } },
  { path: '/register', name: 'register', component: () => import('../views/RegisterView.vue'), meta: { guestOnly: true, hideChrome: true, title: 'Create an account' } },
  { path: '/forgot-password', name: 'forgot-password', component: () => import('../views/ForgotPasswordView.vue'), meta: { guestOnly: true, hideChrome: true, title: 'Forgot password' } },
  { path: '/reset-password', name: 'reset-password', component: () => import('../views/ResetPasswordView.vue'), meta: { hideChrome: true, title: 'Reset password' } },

  // Events (browsing and event pages are public; the rest need an account)
  { path: '/events', name: 'events', component: () => import('../views/EventsView.vue'), meta: { title: 'Browse events' } },
  { path: '/events/new', name: 'event-new', component: () => import('../views/EventFormView.vue'), meta: { requiresAuth: true, title: 'New event' } },
  { path: '/events/:id', name: 'event', component: () => import('../views/EventView.vue'), meta: { title: 'Event' } },
  { path: '/events/:id/edit', name: 'event-edit', component: () => import('../views/EventFormView.vue'), meta: { requiresAuth: true, title: 'Edit event' } },
  { path: '/events/:id/apply', name: 'event-apply', component: () => import('../views/EventApplyView.vue'), meta: { requiresAuth: true, title: 'Sign up' } },
  { path: '/events/:id/manage', name: 'event-manage', component: () => import('../views/EventManageView.vue'), meta: { requiresAuth: true, title: 'Manage event' } },
  { path: '/events/:id/matches', name: 'event-matches', component: () => import('../views/MatchesView.vue'), meta: { requiresAuth: true, title: 'Your match' } },
  { path: '/events/:id/submit', name: 'event-submit', component: () => import('../views/EventSubmitView.vue'), meta: { requiresAuth: true, title: 'Submit your gift' } },
  { path: '/events/:id/results', name: 'event-results', component: () => import('../views/EventResultsView.vue'), meta: { requiresAuth: true, title: 'Results' } },
  { path: '/events/:id/museum', name: 'event-museum', component: () => import('../views/EventMuseumView.vue'), meta: { requiresAuth: true, title: 'The gallery' } },
  { path: '/saved', name: 'saved', component: () => import('../views/FavouritesView.vue'), meta: { requiresAuth: true, title: 'Saved art' } },
  { path: '/avatar', name: 'avatar', component: () => import('../views/AvatarView.vue'), meta: { requiresAuth: true, title: 'Your museum avatar' } },
  { path: '/friends', name: 'friends', component: () => import('../views/FriendsView.vue'), meta: { requiresAuth: true, title: 'Friends' } },
  { path: '/museum', name: 'museum', component: () => import('../views/MuseumView.vue'), meta: { title: 'The museum' } },
  { path: '/museum/:eventId', name: 'museum-wing', component: () => import('../views/MuseumView.vue'), meta: { title: 'The museum' } },

  { path: '/my-events', name: 'my-events', component: () => import('../views/MyEventsView.vue'), meta: { requiresAuth: true, title: 'My events' } },
  { path: '/dashboard', name: 'dashboard', component: () => import('../views/DashboardView.vue'), meta: { requiresAuth: true, title: 'Dashboard' } },

  // Settings: profile, character library, notifications, account (shared side menu)
  {
    path: '/settings',
    component: () => import('../views/SettingsView.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/profile' },
      { path: '/profile', name: 'profile', component: () => import('../views/ProfileView.vue'), meta: { requiresAuth: true, title: 'Your profile' } },
      { path: '/characters', name: 'characters', component: () => import('../views/CharactersView.vue'), meta: { requiresAuth: true, title: 'Character library' } },
      { path: '/characters/new', name: 'character-new', component: () => import('../views/CharacterFormView.vue'), meta: { requiresAuth: true, title: 'New character' } },
      { path: '/characters/:id/edit', name: 'character-edit', component: () => import('../views/CharacterFormView.vue'), meta: { requiresAuth: true, title: 'Edit character' } },
      { path: '/notification', name: 'notifications', component: () => import('../views/NotificationsView.vue'), meta: { requiresAuth: true, title: 'Notifications' }, alias: '/notifications' },
      { path: '/settings/account', name: 'account', component: () => import('../views/AccountView.vue'), meta: { requiresAuth: true, title: 'Account' } },
    ],
  },

  // Public artist profiles
  { path: '/users/:username', name: 'user', component: () => import('../views/UserProfileView.vue'), meta: { title: 'Artist' } },

  // Info pages (linked from the footer)
  { path: '/about', name: 'about', component: () => import('../views/AboutView.vue'), meta: { title: 'About' } },
  { path: '/help', name: 'help', component: () => import('../views/HelpView.vue'), meta: { title: 'Help & FAQ' } },
  { path: '/guidelines', name: 'guidelines', component: () => import('../views/GuidelinesView.vue'), meta: { title: 'Community guidelines' } },
  { path: '/privacy', name: 'privacy', component: () => import('../views/PrivacyView.vue'), meta: { title: 'Privacy' } },
  { path: '/terms', name: 'terms', component: () => import('../views/TermsView.vue'), meta: { title: 'Terms' } },

  // Moderators and admins (shared/permissions.mjs decides which tabs each sees)
  { path: '/admin', name: 'admin', component: () => import('../views/AdminView.vue'), meta: { requiresAuth: true, permission: 'admin.access', title: 'Site admin' } },

  { path: '/forbidden', name: 'forbidden', component: () => import('../views/ForbiddenView.vue'), meta: { title: 'No access' } },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFoundView.vue'), meta: { title: 'Page not found' } },
];

// Hash URLs (/#/events) work on static hosts with no server-side fallback, like GitHub Pages.
const history =
  import.meta.env.VITE_ROUTER_MODE === 'hash'
    ? createWebHashHistory(import.meta.env.BASE_URL)
    : createWebHistory(import.meta.env.BASE_URL);

const router = createRouter({
  history,
  routes,
  // Anchors (/help#matching) stop below the sticky navbar
  scrollBehavior(to, from, saved) {
    if (saved) return saved;
    if (to.hash) return { el: to.hash, top: 92 };
    return { top: 0 };
  },
});

router.beforeEach(async (to) => {
  if (!auth.checked) await loadUser();

  if (to.meta.requiresAuth && !auth.user) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.meta.permission && !can(auth.user, to.meta.permission)) {
    return { name: 'forbidden' };
  }
  if (to.meta.guestOnly && auth.user) {
    return { name: 'dashboard' };
  }
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · Drawsicle` : 'Drawsicle';
});

// Only follow redirects inside our own app (stops ?redirect=https://evil.com)
export function safeRedirect(target) {
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//')
    ? target
    : '/dashboard';
}

export default router;
