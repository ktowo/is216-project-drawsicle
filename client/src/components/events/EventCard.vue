<script setup>
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { Lock, Users } from 'lucide-vue-next';
import EventBanner from './EventBanner.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import DeadlineChip from '@/components/ui/DeadlineChip.vue';
import { eventLink, nextDeadline, seasonLabel } from '@/utils/events';

// The whole card links to the event page. Anything passed in the default slot
// (role badges, quick links...) sits above that link and stays clickable.
const props = defineProps({
  event: { type: Object, required: true },
  compact: { type: Boolean, default: false },
});

const deadline = computed(() => nextDeadline(props.event));

const organizerNames = computed(() => {
  const names = (props.event.organizers || []).map((o) => o.displayName).filter(Boolean);
  if (!names.length) return '';
  if (names.length <= 2) return names.join(' & ');
  return `${names[0]} & ${names.length - 1} others`;
});

const meta = computed(() =>
  [props.event.season && props.event.season !== 'other' ? seasonLabel(props.event.season) : '', props.event.theme]
    .filter(Boolean)
    .join(' · ')
);

const capacity = computed(() => {
  const count = props.event.participantCount || 0;
  return props.event.maxParticipants ? `${count} / ${props.event.maxParticipants}` : String(count);
});
</script>

<template>
  <article class="card event-card" :class="{ compact }">
    <EventBanner :event="event" :height="compact ? 84 : 132" class="card-banner" />

    <div class="card-body">
      <div class="badges">
        <StatusBadge :status="event.status" />
        <span v-if="event.publicity === 'private'" class="private-tag">
          <Lock :size="13" aria-hidden="true" /> Private
        </span>
      </div>

      <h3 class="card-title">
        <RouterLink :to="eventLink(event)" class="title-link">{{ event.name }}</RouterLink>
      </h3>

      <p v-if="meta" class="meta">{{ meta }}</p>
      <p v-if="organizerNames && !compact" class="organisers">by {{ organizerNames }}</p>

      <div class="footer-row">
        <DeadlineChip v-if="deadline" :at="deadline.at" :label="deadline.label" />
        <span class="count" :title="`${event.participantCount || 0} accepted participants`">
          <Users :size="15" aria-hidden="true" />
          {{ capacity }}
          <span class="sr-only">participants</span>
        </span>
      </div>

      <div v-if="$slots.default" class="card-extra">
        <slot />
      </div>
    </div>
  </article>
</template>

<style scoped>
.event-card {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  transition: transform 0.15s, box-shadow 0.15s;
}
.event-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 2px 4px rgba(90, 65, 30, 0.06), 0 12px 28px rgba(90, 65, 30, 0.09);
}
.event-card:has(.title-link:focus-visible) {
  outline: 3px solid var(--pink);
  outline-offset: 3px;
}
.card-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 20px 20px;
  flex: 1;
  min-width: 0;
}
.badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.private-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--muted);
}
.card-title {
  font-size: 1.3rem;
  font-weight: 700;
  line-height: 1.2;
  overflow-wrap: anywhere;
}
.title-link {
  color: var(--text);
  outline: none;
}
/* Stretches the title link over the whole card */
.title-link::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
}
.event-card:hover .title-link {
  color: var(--pink-dark);
}
.meta,
.organisers {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
  overflow-wrap: anywhere;
}
.footer-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  margin-top: auto;
  padding-top: 6px;
}
.count {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-weight: 600;
  font-size: 0.9rem;
}
/* Slot content floats above the stretched link; only its controls catch clicks */
.card-extra {
  position: relative;
  z-index: 1;
  pointer-events: none;
  padding-top: 10px;
  margin-top: 4px;
  border-top: 1px solid var(--border);
}
.card-extra :deep(:is(a, button, input, select, label, [tabindex])) {
  pointer-events: auto;
}

.compact {
  flex-direction: row;
  align-items: stretch;
}
.compact .card-banner {
  width: 120px;
  flex-shrink: 0;
  height: auto !important;
  min-height: 84px;
}
.compact .card-body {
  padding: 14px 18px 16px;
  gap: 6px;
}
.compact .card-title {
  font-size: 1.15rem;
}
.compact .footer-row {
  justify-content: flex-start;
  padding-top: 2px;
}
@media (max-width: 520px) {
  .compact .card-banner {
    width: 76px;
  }
  .compact .card-body {
    padding: 12px 14px 14px;
  }
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) {
  .event-card,
  .event-card:hover {
    transition: none;
    transform: none;
  }
}
</style>
