<script setup>
import { RouterLink } from 'vue-router';
import { ArrowLeft } from 'lucide-vue-next';

// Page title row: optional back link, title + subtitle, extra content (badges) and action buttons.
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  back: { type: [String, Object], default: null },
  backLabel: { type: String, default: 'Back' },
});
</script>

<template>
  <header class="page-header">
    <RouterLink v-if="back" :to="back" class="back-link">
      <ArrowLeft :size="16" aria-hidden="true" />
      {{ backLabel }}
    </RouterLink>

    <div class="row">
      <div class="text">
        <h1 class="title">{{ title }}</h1>
        <p v-if="subtitle" class="subtitle">{{ subtitle }}</p>
        <div v-if="$slots.default" class="extra">
          <slot />
        </div>
      </div>

      <div v-if="$slots.actions" class="actions">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>

<style scoped>
.page-header {
  margin-bottom: 28px;
}
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
  color: var(--muted);
  font-weight: 600;
  font-size: 0.95rem;
}
.back-link:hover {
  color: var(--pink-dark);
}
.row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px 24px;
  flex-wrap: wrap;
}
.text {
  min-width: 0;
  flex: 1 1 320px;
}
.title {
  font-size: clamp(1.8rem, 4vw, 2.4rem);
  font-weight: 800;
  overflow-wrap: anywhere;
}
.subtitle {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 1.08rem;
  max-width: 70ch;
}
.extra {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
@media (max-width: 640px) {
  .page-header {
    margin-bottom: 20px;
  }
  .actions {
    width: 100%;
  }
}
</style>
