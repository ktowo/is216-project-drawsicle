<script setup>
import { CircleSlash, EyeOff } from 'lucide-vue-next';
import { formatDate } from '@/utils/format';

// Shown on event pages that a site admin cancelled or disabled
defineProps({
  event: { type: Object, required: true },
});
</script>

<template>
  <div v-if="event.status === 'cancelled'" class="notice cancelled" role="status">
    <CircleSlash :size="22" aria-hidden="true" class="icon" />
    <div>
      <p class="title">This event was cancelled<template v-if="event.cancelledAt"> on {{ formatDate(event.cancelledAt) }}</template>.</p>
      <p v-if="event.cancelReason" class="reason">Reason from the site admins: {{ event.cancelReason }}</p>
      <p class="hint">The page stays up for reference, but sign-ups, matching and gifts are closed.</p>
    </div>
  </div>
  <div v-if="event.disabled" class="notice disabled" role="status">
    <EyeOff :size="22" aria-hidden="true" class="icon" />
    <div>
      <p class="title">A site admin has disabled this event.</p>
      <p v-if="event.disabledReason" class="reason">Reason: {{ event.disabledReason }}</p>
      <p class="hint">Only its organisers can see it right now, and nothing in it can be changed until it's turned back on.</p>
    </div>
  </div>
</template>

<style scoped>
.notice {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 16px 18px;
  border-radius: var(--radius);
  border: 1.5px solid;
  margin-bottom: 20px;
}
.notice p {
  margin: 0;
}
.notice .title {
  font-weight: 700;
}
.notice .reason {
  margin-top: 4px;
}
.notice .hint {
  margin-top: 6px;
}
.icon {
  flex-shrink: 0;
  margin-top: 1px;
}
.cancelled {
  background: var(--danger-soft);
  border-color: color-mix(in srgb, var(--danger) 35%, transparent);
  color: var(--danger);
}
.cancelled .reason,
.disabled .reason {
  color: var(--text);
}
.disabled {
  background: var(--warning-soft);
  border-color: color-mix(in srgb, var(--warning) 35%, transparent);
  color: var(--warning);
}
</style>
