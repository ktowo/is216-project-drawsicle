<script setup>
import { computed } from 'vue';
import { EVENT_STATUS_LABELS, APPLICATION_STATUS_LABELS } from '@shared/constants.mjs';

// Coloured pill for event / application / match / submission states.
const props = defineProps({
  status: { type: String, default: '' },
  kind: {
    type: String,
    default: 'event',
    validator: (v) => ['event', 'application', 'match', 'submission', 'user'].includes(v),
  },
});

const LABELS = {
  event: EVENT_STATUS_LABELS,
  application: APPLICATION_STATUS_LABELS,
  match: { assigned: 'Not submitted', submitted: 'Submitted' },
  submission: { on_time: 'On time', late: 'Late', verified: 'Verified', missing: 'Missing', overdue: 'Overdue' },
  user: { active: 'Active', deactivated: 'Deactivated', banned: 'Banned' },
};

const TONES = {
  event: { draft: 'muted', open: 'success', matching: 'warning', active: 'brand', completed: 'info', cancelled: 'danger' },
  application: { pending: 'warning', accepted: 'success', waitlisted: 'info', rejected: 'danger', withdrawn: 'muted' },
  match: { assigned: 'warning', submitted: 'success' },
  submission: { on_time: 'success', late: 'warning', verified: 'info', missing: 'muted', overdue: 'danger' },
  user: { active: 'success', deactivated: 'muted', banned: 'danger' },
};

const label = computed(() => {
  const known = LABELS[props.kind]?.[props.status];
  if (known) return known;
  const raw = String(props.status || 'Unknown').replace(/_/g, ' ');
  return raw.charAt(0).toUpperCase() + raw.slice(1);
});
const tone = computed(() => TONES[props.kind]?.[props.status] || 'muted');
</script>

<template>
  <span class="status-badge" :class="`tone-${tone}`">
    <span class="dot" aria-hidden="true" />
    {{ label }}
  </span>
</template>

<style scoped>
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}
.tone-muted {
  background: var(--chip);
  color: var(--muted);
}
.tone-success {
  background: var(--success-soft);
  color: var(--success);
}
.tone-warning {
  background: var(--warning-soft, var(--warning-soft));
  color: var(--warning, var(--warning));
}
.tone-danger {
  background: var(--danger-soft);
  color: var(--danger);
}
.tone-brand {
  background: var(--pink-soft);
  color: var(--pink-dark);
}
.tone-info {
  background: var(--info-soft, var(--blue-soft));
  color: var(--info, var(--blue-ink));
}
</style>
