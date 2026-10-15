<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import {
  Pencil,
  Link2,
  CalendarPlus,
  Compass,
  House,
  UserRoundSearch,
  CalendarHeart,
  ArrowRight,
  Search,
} from 'lucide-vue-next';
import ProfileHeader from '@/components/profile/ProfileHeader.vue';
import ProfileStats from '@/components/profile/ProfileStats.vue';
import EventCard from '@/components/events/EventCard.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import { auth } from '@/stores/auth';
import { toast } from '@/stores/toast';
import { api } from '@/api';

const route = useRoute();
const router = useRouter();

const state = ref('loading'); // 'loading' | 'ready' | 'notfound' | 'error'
const errorMessage = ref('');
const profile = ref(null);
const organizing = ref([]);
const exchanges = ref([]); // empty when there are none or the artist hides them
const stats = ref({ eventsOrganized: 0 });

const handle = computed(() => String(route.params.username || '').replace(/^@/, ''));
const name = computed(() => profile.value?.displayName || profile.value?.username || 'This artist');

// "Edit your profile" shows when this is the logged-in person's own page
const isMe = computed(() => {
  const me = auth.user;
  if (!me || !profile.value) return false;
  if (me.id && me.id === profile.value.id) return true;
  return Boolean(me.username) && me.username.toLowerCase() === String(profile.value.username || '').toLowerCase();
});

const hiddenExchanges = computed(() => Math.max(0, (stats.value.exchangesCompleted || 0) - exchanges.value.length));
const hiddenEvents = computed(() => Math.max(0, (stats.value.eventsOrganized || 0) - organizing.value.length));

// Latest request wins when someone clicks through profiles quickly
let loadId = 0;
async function load() {
  const id = ++loadId;
  state.value = 'loading';
  errorMessage.value = '';
  try {
    const data = await api(`/users/${encodeURIComponent(handle.value)}`);
    if (id !== loadId) return;
    profile.value = data.profile;
    organizing.value = data.organizing || [];
    exchanges.value = data.exchanges || [];
    stats.value = { eventsOrganized: 0, ...(data.stats || {}) };
    state.value = 'ready';

    // An id or different capitalisation in the link: show the real username in the address bar.
    // The router resets the tab title when it navigates, so the title is set afterwards.
    const real = data.profile?.username;
    if (real && real !== handle.value) {
      await router.replace({ name: 'user', params: { username: real }, hash: route.hash });
      if (id !== loadId) return;
    }
    document.title = `${name.value} · Drawsicle`;
  } catch (e) {
    if (id !== loadId) return;
    profile.value = null;
    organizing.value = [];
    exchanges.value = [];
    if (e.status === 404 || e.code === 'USER_NOT_FOUND') {
      state.value = 'notfound';
      document.title = 'Artist not found · Drawsicle';
    } else {
      state.value = 'error';
      errorMessage.value = e.message || '';
    }
  }
}

onMounted(load);
watch(handle, (next) => {
  // The address bar was just tidied to the real username: nothing new to load
  if (profile.value && next.toLowerCase() === String(profile.value.username || '').toLowerCase()) return;
  load();
});

async function copyLink() {
  const url = new URL(router.resolve({ name: 'user', params: { username: profile.value.username || handle.value } }).href, window.location.origin).toString();
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Profile link copied.');
  } catch {
    toast.info(`Copy this link: ${url}`, { duration: 9000 });
  }
}

// "Look up someone else" box on the not-found state
const lookup = ref('');
const lookupError = ref('');
function goToLookup() {
  const value = lookup.value.trim().replace(/^@/, '');
  if (!/^[A-Za-z0-9_.-]{1,50}$/.test(value)) {
    lookupError.value = 'Usernames use letters, numbers, dots, dashes and underscores.';
    return;
  }
  lookupError.value = '';
  lookup.value = '';
  router.push({ name: 'user', params: { username: value } });
}
</script>

<template>
  <main id="main" class="page profile-page" :aria-busy="state === 'loading' ? 'true' : 'false'">
    <!-- Loading -->
    <div v-if="state === 'loading'" role="status">
      <span class="sr-only">Loading profile…</span>
      <div class="card skeleton-head" aria-hidden="true">
        <span class="sk-avatar" />
        <div class="sk-lines">
          <span class="sk-line w40" />
          <span class="sk-line w25" />
          <span class="sk-line w80" />
          <span class="sk-line w60" />
        </div>
      </div>
    </div>

    <!-- Not found -->
    <div v-else-if="state === 'notfound'" class="card notfound">
      <span class="nf-icon" aria-hidden="true"><UserRoundSearch :size="30" /></span>
      <h1 class="nf-title">We couldn't find @{{ handle }}</h1>
      <p class="nf-text">
        There's no artist with that username. It may have been typed differently, changed, or the account may have been
        closed.
      </p>
      <form class="nf-search" @submit.prevent="goToLookup">
        <label class="label" for="lookup">Try another username</label>
        <div class="nf-row">
          <div class="input-wrap" :class="{ 'is-invalid': lookupError }">
            <Search :size="18" class="input-icon" aria-hidden="true" />
            <input
              id="lookup"
              v-model="lookup"
              class="input"
              placeholder="username"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              :aria-invalid="lookupError ? 'true' : 'false'"
              :aria-describedby="lookupError ? 'lookup-error' : undefined"
            />
          </div>
          <button type="submit" class="btn btn-primary">Go</button>
        </div>
        <p v-if="lookupError" id="lookup-error" class="field-error" role="alert">{{ lookupError }}</p>
      </form>
      <div class="nf-actions">
        <RouterLink :to="{ path: '/events', query: { q: handle } }" class="btn btn-outline btn-sm">
          <Compass :size="16" aria-hidden="true" /> Search events for "{{ handle }}"
        </RouterLink>
        <RouterLink to="/" class="btn btn-ghost btn-sm"><House :size="16" aria-hidden="true" /> Home</RouterLink>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="state === 'error'" class="card pad">
      <ErrorBlock :message="errorMessage" @retry="load" />
    </div>

    <!-- Profile -->
    <template v-else>
      <ProfileHeader :profile="profile">
        <template v-if="isMe">
          <RouterLink to="/profile" class="btn btn-primary btn-sm">
            <Pencil :size="16" aria-hidden="true" /> Edit your profile
          </RouterLink>
        </template>
        <button type="button" class="btn btn-outline btn-sm" @click="copyLink">
          <Link2 :size="16" aria-hidden="true" /> Copy profile link
        </button>
      </ProfileHeader>

      <p v-if="isMe" class="alert alert-info own-note">
        This is how other people see you. Your email, characters and sign-ups are never shown here.
        <RouterLink to="/privacy#visibility">What's public?</RouterLink>
      </p>

      <ProfileStats :stats="stats" class="stats-gap" />

      <section class="events" aria-labelledby="events-heading">
        <header class="events-head">
          <div>
            <h2 id="events-heading" class="section-title">Events organised by {{ name }}</h2>
            <p v-if="organizing.length" class="section-sub">
              Public events{{ hiddenEvents ? `, latest ${organizing.length} of ${stats.eventsOrganized}` : '' }}.
            </p>
          </div>
          <RouterLink
            v-if="hiddenEvents && profile.username"
            :to="{ path: '/events', query: { q: profile.username } }"
            class="see-all"
          >
            See all in the event list <ArrowRight :size="16" aria-hidden="true" />
          </RouterLink>
        </header>

        <ul v-if="organizing.length" class="event-grid">
          <li v-for="event in organizing" :key="event.id">
            <EventCard :event="event" class="h-full" />
          </li>
        </ul>

        <EmptyState
          v-else
          :icon="CalendarHeart"
          :title="isMe ? 'You haven\'t organised a public event yet' : `${name} hasn't organised a public event yet`"
          :message="
            isMe
              ? 'Events you publish show up here so people can find what you run. Drafts and private events stay hidden.'
              : 'When they publish an event it will show up here. In the meantime, see what else is taking sign-ups.'
          "
        >
          <RouterLink v-if="isMe" to="/events/new" class="btn btn-primary btn-sm">
            <CalendarPlus :size="16" aria-hidden="true" /> Create an event
          </RouterLink>
          <RouterLink to="/events" class="btn btn-outline btn-sm">
            <Compass :size="16" aria-hidden="true" /> Browse events
          </RouterLink>
        </EmptyState>
      </section>

      <section v-if="exchanges.length" class="events" aria-labelledby="exchanges-heading">
        <header class="events-head">
          <div>
            <h2 id="exchanges-heading" class="section-title">Exchanges {{ name }} joined</h2>
            <p class="section-sub">
              Finished public exchanges{{
                hiddenExchanges ? `, latest ${exchanges.length} of ${stats.exchangesCompleted}` : ''
              }}.
            </p>
          </div>
        </header>
        <ul class="event-grid">
          <li v-for="event in exchanges" :key="event.id">
            <EventCard :event="event" class="h-full" />
          </li>
        </ul>
      </section>
    </template>
  </main>
</template>

<style scoped>
.profile-page {
  max-width: 1000px;
}
.pad {
  padding: 24px;
}
.stats-gap {
  margin-top: 20px;
}
.own-note {
  margin: 16px 0 0;
  line-height: 1.55;
}
.own-note a {
  font-weight: 700;
  text-decoration: underline;
}
.events {
  margin-top: 40px;
}
.events-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px 16px;
  margin-bottom: 18px;
}
.see-all {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
}
.event-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}
.event-grid > li {
  min-width: 0;
}
.h-full {
  height: 100%;
}

/* Not found */
.notfound {
  max-width: 560px;
  margin: 24px auto 0;
  padding: 44px 32px 36px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.nf-icon {
  width: 68px;
  height: 68px;
  border-radius: 20px;
  display: grid;
  place-items: center;
  background: var(--pink);
  color: #fff;
  box-shadow: 0 6px 16px rgba(236, 106, 147, 0.3);
}
.nf-title {
  margin-top: 20px;
  font-size: clamp(1.5rem, 4vw, 2rem);
  font-weight: 800;
  overflow-wrap: anywhere;
}
.nf-text {
  margin: 10px 0 0;
  max-width: 44ch;
  color: var(--muted);
  line-height: 1.6;
}
.nf-search {
  width: 100%;
  max-width: 380px;
  margin-top: 24px;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.nf-row {
  display: flex;
  gap: 10px;
}
.nf-row .input-wrap {
  flex: 1;
  min-width: 0;
}
.nf-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 22px;
}

/* Loading skeleton */
.skeleton-head {
  display: flex;
  gap: 28px;
  padding: 32px 34px;
}
.sk-avatar {
  flex-shrink: 0;
  width: 112px;
  height: 112px;
  border-radius: 50%;
  background: var(--chip);
}
.sk-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 8px;
}
.sk-line {
  display: block;
  height: 14px;
  border-radius: 8px;
  background: var(--chip);
}
.sk-line.w40 {
  width: 40%;
  height: 26px;
}
.sk-line.w25 {
  width: 25%;
}
.sk-line.w80 {
  width: 80%;
}
.sk-line.w60 {
  width: 60%;
}
@media (prefers-reduced-motion: no-preference) {
  .sk-avatar,
  .sk-line {
    animation: pulse 1.4s ease-in-out infinite;
  }
}
@keyframes pulse {
  50% {
    opacity: 0.55;
  }
}
@media (max-width: 640px) {
  .skeleton-head {
    flex-direction: column;
    align-items: center;
    padding: 26px 18px;
  }
  .sk-lines {
    width: 100%;
  }
  .notfound {
    padding: 36px 18px 28px;
  }
  .event-grid {
    grid-template-columns: 1fr;
  }
}
</style>
