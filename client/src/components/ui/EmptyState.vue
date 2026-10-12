<script setup>
// "Nothing here yet" block with an optional icon and action buttons in the default slot.
defineProps({
  icon: { type: [Object, Function], default: null },
  title: { type: String, default: '' },
  message: { type: String, default: '' },
});
</script>

<template>
  <div class="empty-state">
    <span v-if="icon" class="icon-tile" aria-hidden="true">
      <component :is="icon" :size="28" :stroke-width="2" />
    </span>
    <h2 v-if="title" class="title">{{ title }}</h2>
    <p v-if="message" class="message">{{ message }}</p>
    <div v-if="$slots.default" class="actions">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 44px 20px;
  border: 1.5px dashed var(--border);
  border-radius: var(--radius-lg);
  background: rgba(255, 253, 250, 0.6);
}
.icon-tile {
  width: 60px;
  height: 60px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  background: var(--pink-soft);
  color: var(--pink-dark);
  margin-bottom: 16px;
}
.title {
  font-size: 1.35rem;
  font-weight: 700;
}
.message {
  margin: 8px 0 0;
  max-width: 48ch;
  color: var(--muted);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 20px;
}
</style>
