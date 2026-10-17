<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { Hourglass, Lock, CalendarSearch, Palette } from 'lucide-vue-next';
import PageHeader from '@/components/ui/PageHeader.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import MuseumExperience from '@/components/museum/MuseumExperience.vue';
import DoodleBackdrop from '@/components/museum/DoodleBackdrop.vue';
import MuseumThemePicker from '@/components/museum/MuseumThemePicker.vue';
import { toast } from '@/stores/toast';
import { api } from '@/api';
import { pluralize } from '@/utils/format';
import { eventLink } from '@/utils/events';

// Every gift from one finished exchange, hung in museum rooms for its members to walk round
// (the same gifts as the reveal page, which only members can see)
const route = useRoute();
const router = useRouter();

const loading = ref(true);
const error = ref('');
const blocked = ref(null);
const event = ref(null);
const items = ref([]);

const resultsLink = computed(() => eventLink(route.params.id, '/results'));

// Organisers choose how the rooms look; it shows in the public museum too
const savingDesign = ref(false);
async function chooseDesign(choice) {
  const before = event.value.museumTheme;
  event.value.museumTheme = choice;
  savingDesign.value = true;
  try {
    await api(`/events/${event.value.id}/museum-theme`, { method: 'PUT', body: { museumTheme: choice } });
    toast.success('Room design saved.');
  } catch (e) {
    event.value.museumTheme = before;
    toast.error(e.message);
  } finally {
    savingDesign.value = false;
  }
}

let requestId = 0;
async function load() {
  const id = ++requestId;
  loading.value = true;
  error.value = '';
  blocked.value = null;
  try {
    const data = await api(`/events/${route.params.id}/results`);
    if (id !== requestId) return;
    event.value = data.event;
    items.value = data.gallery || [];
    document.title = `Walk the gallery: ${data.event.name} · Drawsicle`;
  } catch (e) {
    if (id !== requestId) return;
    if (e.status === 401) {
      router.replace({ name: 'login', query: { redirect: route.fullPath } });
      return;
    }
    if (e.status === 409 || e.code === 'NOT_COMPLETED') {
      blocked.value = { icon: Hourglass, title: "The gifts haven't been revealed yet", message: 'The gallery opens at the reveal, once the organisers close the event.' };
    } else if (e.status === 403) {
      blocked.value = { icon: Lock, title: 'Only members can walk this gallery', message: "The gifts from this event are shared with its participants and organisers, and you aren't one of them." };
    } else if (e.status === 404) {
      blocked.value = { icon: CalendarSearch, title: 'Event not found', message: "It may have been deleted, or it's a private event." };
    } else {
      error.value = e.message;
    }
  } finally {
    if (id === requestId) loading.value = false;
  }
}
watch(
  () => route.params.id,
  () => {
    if (route.name === 'event-museum') load();
  },
  { immediate: true }
);

const giftCount = computed(() => items.value.filter((i) => i.submission).length);
</script>

<template>
  <main id="main" class="page museum-page" tabindex="-1">
    <DoodleBackdrop />
    <LoadingBlock v-if="loading" label="Hanging the pictures…" />
    <template v-else-if="blocked">
      <PageHeader title="The gallery" :back="eventLink(route.params.id)" back-label="Back to event" />
      <EmptyState :icon="blocked.icon" :title="blocked.title" :message="blocked.message">
        <RouterLink :to="eventLink(route.params.id)" class="btn btn-primary">Back to the event</RouterLink>
      </EmptyState>
    </template>
    <template v-else-if="error">
      <PageHeader title="The gallery" :back="resultsLink" back-label="Back to the reveal" />
      <ErrorBlock :message="error" @retry="load" />
    </template>
    <template v-else-if="event">
      <PageHeader
        :title="`${event.name}: the gallery`"
        :subtitle="`${pluralize(giftCount, 'gift')} on the walls. Only members of this exchange can come in.`"
        :back="resultsLink"
        back-label="Back to the reveal"
      />
      <EmptyState
        v-if="!giftCount"
        :icon="CalendarSearch"
        title="The walls are bare"
        message="Nobody submitted a gift in this event."
        class="mt-6"
      />
      <details v-if="giftCount && event.viewer?.isOrganizer" class="design card mt-6">
        <summary><Palette :size="16" aria-hidden="true" /> Room design</summary>
        <p class="hint mt-2 mb-3">How the rooms look here and in the public museum. Darker designs light up each picture as it goes up.</p>
        <MuseumThemePicker :model-value="event.museumTheme || 'auto'" :disabled="savingDesign" @update:model-value="chooseDesign" />
      </details>
      <MuseumExperience
        v-if="giftCount"
        :items="items"
        :place="{ kind: 'gallery', eventId: event.id }"
        :theme="event.museumTheme || 'auto'"
        class="mt-6"
      />
    </template>
  </main>
</template>

<style scoped>
/* The page sits over the doodles that fill the screen */
.museum-page > :not(.doodles) {
  position: relative;
  z-index: 1;
}
.design {
  padding: 12px 16px;
}
.design summary {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
  cursor: pointer;
}
.hint {
  color: var(--muted);
  font-size: 0.85rem;
}
</style>
