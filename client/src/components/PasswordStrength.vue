<script setup>
import { computed } from 'vue';
import { passwordStrength } from '@/utils/password';

// The meter under a new-password field. Empty until something is typed; it stays in the page
// so screen readers hear each change. (.password-strength + .field in drawsicle.css keeps the
// usual gap before the next field.)
const props = defineProps({
  password: { type: String, default: '' },
});

const result = computed(() => passwordStrength(props.password));
const LEVELS = ['too-short', 'weak', 'okay', 'good', 'strong'];
</script>

<template>
  <div class="password-strength" :class="password ? ['shown', LEVELS[result.score]] : []">
    <div v-if="password" class="bars" aria-hidden="true">
      <span v-for="n in 4" :key="n" class="bar" :class="{ on: n <= result.score }" />
    </div>
    <p class="text" aria-live="polite">
      <template v-if="password">
        <span class="label">Password strength: {{ result.label }}.</span>{{ result.tip ? ` ${result.tip}` : '' }}
      </template>
    </p>
  </div>
</template>

<style scoped>
.password-strength {
  --meter: var(--danger);
}
.shown {
  margin-top: 10px;
}
.weak {
  --meter: var(--danger);
}
.okay {
  --meter: var(--warning);
}
.good,
.strong {
  --meter: var(--success);
}
.bars {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.bar {
  height: 6px;
  border-radius: 999px;
  background: var(--border);
  transition: background 0.2s;
}
.bar.on {
  background: var(--meter);
}
.text {
  margin: 6px 0 0;
  font-size: 0.88rem;
  color: var(--muted);
}
.text:empty {
  margin: 0;
}
.label {
  font-weight: 700;
  color: var(--meter);
}
.too-short .label {
  color: var(--muted);
}
</style>
