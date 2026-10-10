import { createRouter, createWebHistory } from 'vue-router';
import Home from '../components/Home.vue';
import { auth, loadUser } from '../stores/auth';

const routes = [
  { path: '/', name: 'home', component: Home },

  // Logged-out pages
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue'), meta: { guestOnly: true } },
  { path: '/register', name: 'register', component: () => import('../views/RegisterView.vue'), meta: { guestOnly: true } },
  { path: '/forgot-password', name: 'forgot-password', component: () => import('../views/ForgotPasswordView.vue'), meta: { guestOnly: true } },
  { path: '/reset-password', name: 'reset-password', component: () => import('../views/ResetPasswordView.vue') },

  // Logged-in pages (these get the top bar)
  { path: '/dashboard', name: 'dashboard', component: () => import('../views/DashboardView.vue'), meta: { requiresAuth: true } },
  { path: '/profile', name: 'profile', component: () => import('../views/ProfileView.vue'), meta: { requiresAuth: true } },

  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach(async (to) => {
  if (!auth.checked) await loadUser();

  if (to.meta.requiresAuth && !auth.user) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.meta.guestOnly && auth.user) {
    return { name: 'dashboard' };
  }
});

// Only follow redirects inside our own app (stops ?redirect=https://evil.com)
export function safeRedirect(target) {
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//')
    ? target
    : '/dashboard';
}

export default router;
