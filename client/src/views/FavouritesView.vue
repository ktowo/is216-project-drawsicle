<script setup>
import { ref, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { Heart, Landmark } from 'lucide-vue-next';
import PageHeader from '@/components/ui/PageHeader.vue';
import LoadingBlock from '@/components/ui/LoadingBlock.vue';
import ErrorBlock from '@/components/ui/ErrorBlock.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import SubmissionGallery from '@/components/events/SubmissionGallery.vue';
import { api } from '@/api';
import { favourites } from '@/stores/favourites';
import { pluralize } from '@/utils/format';

// Your saved art: gifts you hearted in the museum, on reveal pages and on artists' profiles
const loading = ref(true);
const error = ref('');
const items = ref([]);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const data = await api('/favourites');
    items.value = data.items;
    favourites.ids = new Set(data.ids);
    favourites.loaded = true;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

// Unsaving one here takes it off the page straight away
const shown = computed(() => items.value.filter((i) => favourites.ids.has(i.submission.id)));
</script>

<template>
  <main id="main" class="page" tabindex="-1">
    <PageHeader
      title="Saved art"
      :subtitle="shown.length ? `${pluralize(shown.length, 'gift')} you've hearted. Only you can see this list.` : 'Gifts you heart show up here. Only you can see them.'"
    >
      <RouterLink to="/museum" class="btn btn-outline btn-sm"><Landmark :size="16" aria-hidden="true" /> Browse the museum</RouterLink>
    </PageHeader>

    <LoadingBlock v-if="loading" label="Finding your saved art…" />
    <ErrorBlock v-else-if="error" :message="error" class="mt-6" @retry="load" />
    <EmptyState
      v-else-if="!shown.length"
      :icon="Heart"
      title="Nothing saved yet"
      message="Tap the heart on any gift in the museum, on a reveal page or on an artist's profile to keep it here."
      class="mt-6"
    />
    <SubmissionGallery v-else :items="shown" class="mt-6" />
  </main>
</template>
