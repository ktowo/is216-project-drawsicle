<script setup>
import { RouterLink } from 'vue-router';
import { Landmark } from 'lucide-vue-next';
import PageHeader from '@/components/ui/PageHeader.vue';
import FriendsPanel from '@/components/social/FriendsPanel.vue';
</script>

<template>
  <main id="main" class="page" tabindex="-1">
    <PageHeader
      title="Friends"
      subtitle="Follow artists from their profiles. When they follow you back, you're friends, and you can see when they're in the museum."
    >
      <RouterLink to="/museum" class="btn btn-outline btn-sm"><Landmark :size="16" aria-hidden="true" /> Go to the museum</RouterLink>
    </PageHeader>
    <div class="card panel mt-6">
      <FriendsPanel />
    </div>
  </main>
</template>

<style scoped>
.panel {
  max-width: 640px;
  padding: 20px 22px;
}
</style>
