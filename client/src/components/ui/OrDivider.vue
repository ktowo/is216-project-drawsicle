<script setup>
defineProps({
  label: { type: String, default: 'OR' },
});
</script>

<template>
  <div class="or-divider" role="separator" :aria-label="label">
    <span aria-hidden="true">{{ label }}</span>
  </div>
</template>

<style scoped>
.or-divider {
  display: flex;
  align-items: center;
  gap: 18px;
  margin: 28px 0;
  color: var(--muted);
  font-size: 0.9rem;
}
.or-divider::before,
.or-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}
</style>
