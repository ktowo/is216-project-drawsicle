<script setup>
import { computed } from 'vue';
import { Check } from 'lucide-vue-next';
import { statusOrder } from '@/utils/events';

const props = defineProps({
  status: { type: String, default: 'draft' },
});

const STEPS = [
  { key: 'draft', label: 'Draft', detail: 'The organisers are still planning this event.' },
  { key: 'open', label: 'Sign-ups', detail: 'Artists are signing up and choosing what to offer.' },
  { key: 'matching', label: 'Matching', detail: 'Sign-ups are closed and everyone is being paired up.' },
  { key: 'active', label: 'Making gifts', detail: 'Everyone knows their recipient and is making their gift.' },
  { key: 'completed', label: 'Reveal', detail: 'Gifts are revealed and the event is complete.' },
];

const current = computed(() => Math.min(statusOrder(props.status), STEPS.length - 1));
const currentStep = computed(() => STEPS[current.value]);

function stateOf(index) {
  if (index < current.value || (index === current.value && props.status === 'completed')) return 'done';
  return index === current.value ? 'current' : 'upcoming';
}
</script>

<template>
  <div class="stepper">
    <ol class="steps" aria-label="Event progress">
      <li
        v-for="(step, i) in STEPS"
        :key="step.key"
        class="step"
        :class="stateOf(i)"
        :aria-current="i === current ? 'step' : undefined"
      >
        <span class="dot" aria-hidden="true">
          <Check v-if="stateOf(i) === 'done'" :size="14" :stroke-width="3" />
          <span v-else>{{ i + 1 }}</span>
        </span>
        <span class="step-label">{{ step.label }}</span>
        <span class="sr-only">
          {{ stateOf(i) === 'done' ? '(done)' : stateOf(i) === 'current' ? '(current stage)' : '' }}
        </span>
      </li>
    </ol>
    <p class="now"><strong>Now:</strong> {{ currentStep.detail }}</p>
  </div>
</template>

<style scoped>
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
}
.step {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  min-width: 0;
}
/* Connector line to the previous step */
.step + .step::before {
  content: '';
  position: absolute;
  top: 15px;
  right: 50%;
  width: 100%;
  height: 3px;
  background: var(--border);
  z-index: 0;
}
.step.done + .step::before,
.step.done + .step.current::before {
  background: var(--pink);
}
.dot {
  position: relative;
  z-index: 1;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 0.85rem;
  font-weight: 700;
  background: var(--surface);
  border: 2px solid var(--border);
  color: var(--muted);
}
.step.done .dot {
  background: var(--pink);
  border-color: var(--pink);
  color: #fff;
}
.step.current .dot {
  border-color: var(--pink);
  color: var(--pink-dark);
  box-shadow: 0 0 0 4px var(--pink-soft);
}
.step-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--muted);
  line-height: 1.2;
  overflow-wrap: anywhere;
}
.step.current .step-label {
  color: var(--text);
}
.now {
  margin: 16px 0 0;
  color: var(--muted);
  font-size: 0.95rem;
}
.now strong {
  color: var(--text);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@media (max-width: 420px) {
  .step-label {
    font-size: 0.72rem;
  }
  .dot {
    width: 28px;
    height: 28px;
  }
  .step + .step::before {
    top: 13px;
  }
}
</style>
