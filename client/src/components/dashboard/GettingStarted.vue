<script setup>
import { ref, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { CircleCheck, Circle, ArrowRight, Rocket } from 'lucide-vue-next';
import { auth } from '@/stores/auth';
import { api } from '@/api';

// "Getting started" for new accounts: three steps that make the first exchange go smoothly.
// It disappears for good once all three are done.
const props = defineProps({
  // From the dashboard: events organised and joined
  counts: { type: Object, required: true },
});

const characterCount = ref(null); // null until loaded
onMounted(async () => {
  try {
    const { characters = [] } = await api('/characters?archived=all');
    characterCount.value = characters.length;
  } catch {
    characterCount.value = 0;
  }
});

const steps = computed(() => [
  {
    key: 'profile',
    done: Boolean(auth.user?.profileComplete),
    title: 'Complete your profile',
    text: 'A display name and a short bio, so organisers and your Secret Santa know who you are.',
    to: '/profile',
    action: 'Edit profile',
  },
  {
    key: 'character',
    done: characterCount.value > 0,
    title: 'Add a character',
    text: 'Save references once, then offer them in any event with a click.',
    to: '/characters/new',
    action: 'Add a character',
  },
  {
    key: 'event',
    done: (props.counts.participating || 0) + (props.counts.organizing || 0) > 0,
    title: 'Join or start an exchange',
    text: 'Sign up for an open event, or create your own for your community.',
    to: '/events',
    action: 'Browse events',
  },
]);

const doneCount = computed(() => steps.value.filter((s) => s.done).length);
const show = computed(() => characterCount.value !== null && doneCount.value < steps.value.length);
const nextKey = computed(() => steps.value.find((s) => !s.done)?.key);
</script>

<template>
  <section v-if="show" class="card getting-started" aria-labelledby="start-title">
    <div class="head">
      <span class="head-icon" aria-hidden="true"><Rocket :size="22" /></span>
      <div class="min-w-0 flex-1">
        <h2 id="start-title" class="title">Getting started</h2>
        <p class="sub">{{ doneCount }} of {{ steps.length }} done. This goes away once you've finished.</p>
      </div>
      <span
        class="progress"
        role="progressbar"
        :aria-valuenow="doneCount"
        aria-valuemin="0"
        :aria-valuemax="steps.length"
        :aria-label="`${doneCount} of ${steps.length} steps done`"
      >
        <span :style="{ width: `${(doneCount / steps.length) * 100}%` }" />
      </span>
    </div>
    <ol class="steps">
      <li v-for="step in steps" :key="step.key" class="step" :class="{ done: step.done, next: step.key === nextKey }">
        <span class="mark" aria-hidden="true">
          <CircleCheck v-if="step.done" :size="20" />
          <Circle v-else :size="20" />
        </span>
        <div class="min-w-0 flex-1">
          <p class="step-title">
            {{ step.title }}<span class="sr-only">{{ step.done ? ' (done)' : '' }}</span>
          </p>
          <p v-if="!step.done" class="step-text">{{ step.text }}</p>
        </div>
        <RouterLink
          v-if="!step.done"
          :to="step.to"
          class="btn btn-sm"
          :class="step.key === nextKey ? 'btn-primary' : 'btn-outline'"
        >
          {{ step.action }} <ArrowRight :size="15" aria-hidden="true" />
        </RouterLink>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.getting-started {
  margin-top: 24px;
  padding: 20px 24px;
  background: linear-gradient(135deg, var(--surface) 0%, var(--pink-tint) 100%);
  border-color: var(--pink-line);
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
}
.head-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: var(--pink);
  color: #fff;
  flex-shrink: 0;
}
.title {
  font-size: 1.25rem;
  font-weight: 700;
}
.sub {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 0.92rem;
}
.progress {
  width: 160px;
  height: 8px;
  border-radius: 999px;
  background: var(--border);
  overflow: hidden;
}
.progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--pink);
  transition: width 0.3s;
}
.steps {
  list-style: none;
  margin: 16px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.step {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  padding: 10px 12px;
  border-radius: 14px;
}
.step.next {
  background: color-mix(in srgb, var(--surface) 80%, transparent);
}
.mark {
  display: grid;
  color: var(--subtle);
}
.done .mark {
  color: var(--success);
}
.step-title {
  margin: 0;
  font-weight: 700;
}
.done .step-title {
  color: var(--muted);
  text-decoration: line-through;
  text-decoration-thickness: 1px;
}
.step-text {
  margin: 2px 0 0;
  color: var(--muted);
  font-size: 0.92rem;
}
@media (max-width: 640px) {
  .progress {
    width: 100%;
  }
  .step .btn {
    margin-left: 34px;
  }
}
</style>
