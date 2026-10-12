<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { Clock } from 'lucide-vue-next';
import { toDate, timeUntil, formatDateTime } from '@/utils/format';

// "Sign-ups close in 3 days" / "Sign-ups closed 2 days ago", coloured by how close it is.
const props = defineProps({
  at: { type: [Date, String, Number], default: null },
  label: { type: String, default: 'Due' },
  // Optional wording once the deadline has passed; otherwise worked out from `label`
  pastLabel: { type: String, default: '' },
});

const now = ref(Date.now());
let timer = null;
onMounted(() => {
  timer = setInterval(() => (now.value = Date.now()), 60 * 1000);
});
onBeforeUnmount(() => clearInterval(timer));

const date = computed(() => toDate(props.at));
const remaining = computed(() => (date.value ? date.value.getTime() - now.value : 0));
const isPast = computed(() => remaining.value <= 0);

const PAST_FORMS = {
  close: 'closed',
  closes: 'closed',
  end: 'ended',
  ends: 'ended',
  open: 'opened',
  opens: 'opened',
  start: 'started',
  starts: 'started',
};

const wording = computed(() => {
  if (!isPast.value) return props.label;
  if (props.pastLabel) return props.pastLabel;
  const words = props.label.split(' ');
  const last = words[words.length - 1];
  const past = PAST_FORMS[last.toLowerCase()];
  if (past) words[words.length - 1] = past;
  return words.join(' ');
});

const tone = computed(() => {
  if (isPast.value) return 'past';
  if (remaining.value <= 24 * 60 * 60 * 1000) return 'danger';
  if (remaining.value <= 3 * 24 * 60 * 60 * 1000) return 'warning';
  return 'neutral';
});

const text = computed(() => `${wording.value} ${timeUntil(date.value, now.value)}`);
</script>

<template>
  <span v-if="date" class="deadline-chip" :class="`tone-${tone}`" :title="formatDateTime(date)">
    <Clock :size="14" aria-hidden="true" />
    <span>{{ text }}</span>
    <span class="sr-only">({{ formatDateTime(date) }})</span>
  </span>
</template>

<style scoped>
.deadline-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 11px;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
}
.tone-neutral {
  background: #f2eadb;
  color: var(--text);
}
.tone-warning {
  background: var(--warning-soft, #fdf3e1);
  color: var(--warning, #b7791f);
}
.tone-danger {
  background: var(--danger-soft);
  color: var(--danger);
}
.tone-past {
  background: transparent;
  color: var(--muted);
  border: 1px dashed var(--border);
}
</style>
