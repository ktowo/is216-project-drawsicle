<script setup>
// One number on a stats row. tone colours the value; the default slot holds a small action.
defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], default: '–' },
  sub: { type: String, default: '' },
  tone: {
    type: String,
    default: 'default',
    validator: (v) => ['default', 'brand', 'success', 'warning', 'danger', 'muted'].includes(v),
  },
  icon: { type: [Object, Function], default: null },
});
</script>

<template>
  <div class="card stat-tile" :class="`tone-${tone}`">
    <p class="label-row">
      <component :is="icon" v-if="icon" :size="16" aria-hidden="true" />
      <span>{{ label }}</span>
    </p>
    <p class="value">{{ value }}</p>
    <p v-if="sub" class="sub">{{ sub }}</p>
    <div v-if="$slots.default" class="extra">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.stat-tile {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 18px 20px;
  border-radius: 18px;
}
.label-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
  font-weight: 600;
}
.value {
  margin: 8px 0 0;
  font-family: var(--font-display);
  font-size: 1.9rem;
  font-weight: 700;
  line-height: 1.05;
  overflow-wrap: anywhere;
}
.sub {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 0.85rem;
}
.extra {
  margin-top: auto;
  padding-top: 10px;
}
.tone-brand .value {
  color: var(--pink-dark);
}
.tone-success .value {
  color: var(--success);
}
.tone-warning .value {
  color: var(--warning);
}
.tone-danger {
  border-color: var(--pink-line);
}
.tone-danger .value {
  color: var(--danger);
}
.tone-muted .value {
  color: var(--muted);
}
</style>
