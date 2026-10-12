<script setup>
import { ref, computed } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { Signpost, House, Compass, Search, CircleHelp } from 'lucide-vue-next';
import StatusPage from '@/components/ui/StatusPage.vue';
import { auth } from '@/stores/auth';

const route = useRoute();
const router = useRouter();

const query = ref('');

// Paths that look like an event link get a more specific hint: private events and drafts both read as "not found"
const looksLikeEvent = computed(() => /^\/events\/[^/]+/.test(route.path));
const shownPath = computed(() => {
  const path = route.fullPath || '';
  return path.length > 80 ? `${path.slice(0, 77)}…` : path;
});

function search() {
  const q = query.value.trim();
  router.push(q ? { path: '/events', query: { q } } : { path: '/events' });
}
</script>

<template>
  <StatusPage code="404" :icon="Signpost" title="We couldn't find that page">
    <p v-if="shownPath">
      Nothing lives at <code>{{ shownPath }}</code
      >. The link may be old or mistyped.
    </p>
    <p v-else>The link may be old or mistyped.</p>
    <p v-if="looksLikeEvent">
      If this was an event, it may be private or still a draft. Ask the organiser for the invite link, or search
      below.
    </p>
    <p v-else>If someone shared it with you, ask them to send it again.</p>

    <template #search>
      <form role="search" class="finder" @submit.prevent="search">
        <label class="label" for="nf-search">Search events instead</label>
        <div class="row">
          <div class="input-wrap">
            <Search :size="18" class="input-icon" aria-hidden="true" />
            <input
              id="nf-search"
              v-model="query"
              type="search"
              class="input"
              placeholder="Event name, theme or organiser"
              autocomplete="off"
              enterkeyhint="search"
            />
          </div>
          <button type="submit" class="btn btn-primary">Search</button>
        </div>
      </form>
    </template>

    <template #actions>
      <RouterLink :to="auth.user ? '/dashboard' : '/'" class="btn btn-outline">
        <House :size="18" aria-hidden="true" />
        {{ auth.user ? 'Go to your dashboard' : 'Go to the home page' }}
      </RouterLink>
      <RouterLink to="/events" class="btn btn-outline"><Compass :size="18" aria-hidden="true" /> Browse events</RouterLink>
      <RouterLink to="/help" class="btn btn-ghost"><CircleHelp :size="18" aria-hidden="true" /> Help & FAQ</RouterLink>
    </template>
  </StatusPage>
</template>

<style scoped>
.finder .label {
  display: block;
  margin-bottom: 8px;
  text-align: center;
}
.row {
  display: flex;
  gap: 10px;
}
.row .input-wrap {
  flex: 1;
  min-width: 0;
}
@media (max-width: 480px) {
  .row {
    flex-direction: column;
  }
}
</style>
