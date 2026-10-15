<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { ArrowLeft, CalendarSearch, Hourglass, Lock, Gift, Palette, Images, PartyPopper } from 'lucide-vue-next';
import PageHeader from '@/components/ui/PageHeader.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import ChoiceChips from '@/components/ui/ChoiceChips.vue';
import PersonLink from '@/components/events/PersonLink.vue';
import EventBanner from '@/components/events/EventBanner.vue';
import SubmissionDetails from '@/components/events/SubmissionDetails.vue';
import SubmissionGallery from '@/components/events/SubmissionGallery.vue';
import { api, qs } from '@/api';
import { EVENT_STATUS_LABELS, CREATION_TYPES } from '@shared/constants.mjs';
import { formatDate, pluralize } from '@/utils/format';
import { eventLink, inviteFrom } from '@/utils/events';

const route = useRoute();
const router = useRouter();

const loading = ref(true);
const error = ref('');
const notFound = ref(false);
const blocked = ref(null); // { icon, title, message } when the results can't be shown

const event = ref(null);
const results = ref(null);

const invite = computed(() => inviteFrom(route));
const backTo = computed(() =>
  invite.value ? { path: eventLink(route.params.id), query: { invite: invite.value } } : eventLink(route.params.id)
);

function blockedFor(err, ev) {
  if (err.code === 'NOT_COMPLETED' || err.status === 409) {
    const stage = ev ? EVENT_STATUS_LABELS[ev.status] || ev.status : '';
    return {
      icon: Hourglass,
      title: "The gifts haven't been revealed yet",
      message: ev?.status === 'active'
        ? 'Everyone is still making their gifts. The reveal happens once the organisers close the event.'
        : `The reveal happens when the event is completed.${stage ? ` Right now it is at the "${stage}" stage.` : ''}`,
    };
  }
  return {
    icon: Lock,
    title: 'Only members can see the reveal',
    message: "The gifts from this event are shared with its participants and organisers, and you aren't one of them.",
  };
}

let requestId = 0;
async function load() {
  const id = ++requestId;
  const eventId = route.params.id;
  loading.value = true;
  error.value = '';
  notFound.value = false;
  blocked.value = null;

  const [eventRes, resultsRes] = await Promise.allSettled([
    api(`/events/${eventId}${qs({ invite: invite.value })}`),
    api(`/events/${eventId}/results`),
  ]);
  if (id !== requestId) return;

  const failed = [eventRes, resultsRes].find((r) => r.status === 'rejected');
  if (failed?.reason?.status === 401) {
    router.replace({ name: 'login', query: { redirect: route.fullPath } });
    return;
  }

  if (resultsRes.status === 'fulfilled') {
    results.value = resultsRes.value;
    event.value = resultsRes.value.event || (eventRes.status === 'fulfilled' ? eventRes.value.event : null);
  } else {
    results.value = null;
    event.value = eventRes.status === 'fulfilled' ? eventRes.value.event : null;
    const reason = resultsRes.reason;
    if (eventRes.status === 'rejected' && eventRes.reason.status === 404) notFound.value = true;
    // The page opened through an invite link, but /results only knows members, so the event "isn't there" for them
    else if (reason.status === 404 && event.value) {
      const notYet = event.value.status !== 'completed';
      blocked.value = blockedFor(notYet ? { status: 409, code: 'NOT_COMPLETED' } : { status: 403 }, event.value);
    }
    else if (reason.status === 404) notFound.value = true;
    else if (reason.status === 403 || reason.status === 409) blocked.value = blockedFor(reason, event.value);
    else error.value = reason.message;
  }
  if (event.value) document.title = `The reveal: ${event.value.name} · Drawisicle`;
  loading.value = false;
}

watch(
  () => route.params.id,
  () => {
    if (route.name === 'event-results') load();
  },
  { immediate: true }
);

const received = computed(() => results.value?.received || null);
const given = computed(() => results.value?.given || null);
const gallery = computed(() => results.value?.gallery || []);
const submittedCount = computed(() => gallery.value.filter((g) => g.submission).length);
const nameOf = (user) => user?.displayName || 'Someone';

// Filter the gallery by kind of gift, when there's more than one kind to choose from
const typeFilter = ref('all');
const typeOptions = computed(() => {
  const present = CREATION_TYPES.filter((t) => gallery.value.some((g) => g.submission?.type === t.value));
  return present.length > 1 ? [{ value: 'all', label: 'All gifts' }, ...present] : [];
});
const shownGallery = computed(() =>
  typeFilter.value === 'all' ? gallery.value : gallery.value.filter((g) => g.submission?.type === typeFilter.value)
);

// A burst of paper confetti over the header (CSS only, and none for people who prefer less motion)
const CONFETTI_COLOURS = ['var(--pink)', 'var(--info)', 'var(--success)', 'var(--warning)', 'var(--purple-ink)'];
const confetti = Array.from({ length: 30 }, (_, i) => ({
  round: i % 3 === 0,
  style: {
    left: `${(i * 37 + 5) % 100}%`,
    animationDelay: `${(i % 8) * 0.11}s`,
    animationDuration: `${2.2 + (i % 5) * 0.35}s`,
    background: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
    '--spin': `${(i * 47) % 360}deg`,
    '--drift': `${((i * 29) % 80) - 40}px`,
  },
}));
</script>

<template>
  <main class="page">
    <LoadingBlock v-if="loading" label="Loading the reveal…" />

    <EmptyState
      v-else-if="notFound"
      :icon="CalendarSearch"
      title="Event not found"
      message="It may have been deleted, or it's a private event that needs an invite link."
    >
      <RouterLink to="/events" class="btn btn-primary">Browse events</RouterLink>
    </EmptyState>

    <template v-else-if="error">
      <PageHeader title="The reveal" :back="backTo" back-label="Back to event" />
      <ErrorBlock :message="error" @retry="load" />
    </template>

    <template v-else-if="blocked">
      <PageHeader title="The reveal" :subtitle="event?.name || ''" :back="backTo" back-label="Back to event" />
      <EmptyState :icon="blocked.icon" :title="blocked.title" :message="blocked.message">
        <RouterLink :to="backTo" class="btn btn-primary">Back to the event</RouterLink>
      </EmptyState>
    </template>

    <template v-else-if="results && event">
      <RouterLink :to="backTo" class="back-link"><ArrowLeft :size="16" aria-hidden="true" /> Back to event</RouterLink>

      <header class="card hero">
        <div class="confetti" aria-hidden="true">
          <span v-for="(piece, i) in confetti" :key="i" :class="{ round: piece.round }" :style="piece.style" />
        </div>
        <EventBanner :event="event" :height="150" class="hero-banner" />
        <div class="hero-body">
          <p class="eyebrow"><PartyPopper :size="18" aria-hidden="true" /> The reveal</p>
          <h1 class="title">{{ event.name }}</h1>
          <p class="lead">
            Every Secret Santa is unmasked. See who made what, and for whom.
            <template v-if="event.completedAt"> Revealed {{ formatDate(event.completedAt) }}.</template>
          </p>
          <p v-if="submittedCount" class="stats">{{ pluralize(submittedCount, 'gift') }} revealed</p>
        </div>
      </header>

      <div v-if="received || given" class="mine">
        <section v-if="received" class="card panel gift-card received" aria-labelledby="received-heading">
          <div class="card-head">
            <span class="icon-tile" aria-hidden="true"><Gift :size="22" /></span>
            <div>
              <h2 id="received-heading" class="panel-title">Your gift</h2>
              <p class="from">
                from
                <PersonLink :user="received.giver" :size="26" class="from-person" />
              </p>
            </div>
          </div>
          <SubmissionDetails
            v-if="received.submission"
            :submission="received.submission"
            :caption="`From ${nameOf(received.giver)} to you`"
          />
          <p v-else class="muted">
            {{ nameOf(received.giver) }} didn't submit a gift for you this time. The organisers may be in touch about it.
          </p>
        </section>

        <section v-if="given" class="card panel gift-card" aria-labelledby="given-heading">
          <div class="card-head">
            <span class="icon-tile soft" aria-hidden="true"><Palette :size="22" /></span>
            <div>
              <h2 id="given-heading" class="panel-title">What you made</h2>
              <p class="from">
                for
                <PersonLink :user="given.recipient" :size="26" class="from-person" />
              </p>
            </div>
          </div>
          <SubmissionDetails
            v-if="given.submission"
            :submission="given.submission"
            :caption="`From you to ${nameOf(given.recipient)}`"
          />
          <p v-else class="muted">You didn't submit a gift for {{ nameOf(given.recipient) }}.</p>
        </section>
      </div>

      <section class="gallery-section" aria-labelledby="gallery-heading">
        <div class="gallery-head">
          <h2 id="gallery-heading" class="section-heading">Every gift</h2>
          <p class="muted">Select a picture to see it full size or download it. Use the arrow keys to move between them.</p>
        </div>
        <ChoiceChips
          v-if="typeOptions.length"
          v-model="typeFilter"
          :options="typeOptions"
          :multiple="false"
          label="Show gifts of type"
          class="type-filter"
        />
        <SubmissionGallery v-if="shownGallery.length" :key="typeFilter" :items="shownGallery" />
        <EmptyState
          v-else
          :icon="Images"
          title="No gifts to show"
          message="Nobody submitted a gift in this event."
        />
      </section>
    </template>
  </main>
</template>

<style scoped>
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: var(--muted);
  margin-bottom: 18px;
}
.back-link:hover {
  color: var(--pink-dark);
}
.hero {
  position: relative;
  overflow: hidden;
}
.confetti {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  overflow: hidden;
}
.confetti span {
  position: absolute;
  top: -16px;
  width: 8px;
  height: 14px;
  border-radius: 2px;
  opacity: 0;
  animation-name: confetti-fall;
  animation-timing-function: cubic-bezier(0.25, 0.6, 0.5, 1);
  animation-fill-mode: forwards;
}
.confetti span.round {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}
@keyframes confetti-fall {
  0% {
    opacity: 1;
    transform: translate3d(0, 0, 0) rotate(var(--spin));
  }
  75% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate3d(var(--drift), 380px, 0) rotate(calc(var(--spin) + 540deg));
  }
}
@media (prefers-reduced-motion: reduce) {
  .confetti {
    display: none;
  }
}
.from-person {
  font-weight: 700;
}
.type-filter {
  margin-bottom: 18px;
}
.hero-body {
  padding: 24px 32px 28px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  background: radial-gradient(circle at 50% 0, var(--pink-soft), transparent 70%);
}
.eyebrow {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 14px;
  border-radius: 999px;
  background: var(--pink);
  color: #fff;
  font-weight: 700;
  font-size: 0.9rem;
}
.title {
  font-size: clamp(1.9rem, 5vw, 2.8rem);
  font-weight: 800;
  overflow-wrap: anywhere;
}
.lead {
  margin: 0;
  max-width: 60ch;
  color: var(--muted);
  font-size: 1.05rem;
}
.stats {
  margin: 4px 0 0;
  font-weight: 700;
  color: var(--pink-dark);
}
.mine {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr));
  gap: 24px;
  margin-top: 24px;
  align-items: start;
}
.panel {
  padding: 26px 28px;
}
.gift-card {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}
.received {
  border-color: var(--pink);
  box-shadow: 0 0 0 3px var(--pink-soft), var(--shadow);
}
.card-head {
  display: flex;
  align-items: center;
  gap: 14px;
}
.icon-tile {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: var(--pink);
  color: #fff;
}
.icon-tile.soft {
  background: var(--pink-soft);
  color: var(--pink-dark);
}
.panel-title {
  font-size: 1.35rem;
  font-weight: 700;
}
.from {
  margin: 4px 0 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: var(--muted);
}
.muted {
  margin: 0;
  color: var(--muted);
}
.gallery-section {
  margin-top: 40px;
}
.gallery-head {
  margin-bottom: 18px;
}
.section-heading {
  font-size: 1.7rem;
  font-weight: 800;
  margin-bottom: 4px;
}
@media (max-width: 640px) {
  .hero-body {
    padding: 18px 18px 22px;
  }
  .panel {
    padding: 20px 18px;
  }
  .mine {
    gap: 16px;
    margin-top: 16px;
  }
  .gallery-section {
    margin-top: 28px;
  }
}
</style>
