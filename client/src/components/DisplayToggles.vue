<script setup>
import { computed } from 'vue';
import { Sparkles, Moon, Sun } from 'lucide-vue-next';
import { preferences, toggleTheme, toggleSparkles } from '@/stores/preferences';

// The sparkle cursor only exists on mouse/trackpad devices, so its switch does too
const hasFinePointer = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches;
const dark = computed(() => preferences.resolvedTheme === 'dark');
</script>

<template>
  <div class="toggles" role="group" aria-label="Display">
    <button
      v-if="hasFinePointer"
      type="button"
      class="toggle"
      :class="{ off: !preferences.sparkles }"
      :aria-pressed="preferences.sparkles"
      :title="preferences.sparkles ? 'Turn off the sparkle cursor' : 'Turn on the sparkle cursor'"
      @click="toggleSparkles"
    >
      <Sparkles :size="19" aria-hidden="true" />
      <span class="sr-only">Sparkle cursor</span>
    </button>
    <button
      type="button"
      class="toggle"
      :aria-pressed="dark"
      :title="dark ? 'Switch to light mode' : 'Switch to dark mode'"
      @click="toggleTheme"
    >
      <Sun v-if="dark" :size="19" aria-hidden="true" />
      <Moon v-else :size="19" aria-hidden="true" />
      <span class="sr-only">Dark mode</span>
    </button>
  </div>
</template>

<style scoped>
.toggles {
  display: flex;
  align-items: center;
  gap: 2px;
}
.toggle {
  position: relative;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 12px;
  background: none;
  color: var(--text);
  cursor: pointer;
}
.toggle:hover {
  background: var(--hover);
}
.toggle:focus-visible {
  outline: 2px solid var(--pink);
  outline-offset: 2px;
}
.toggle[aria-pressed='true'] {
  color: var(--pink);
}
/* A slash through the sparkles when they're off */
.toggle.off {
  color: var(--muted);
}
.toggle.off::after {
  content: '';
  position: absolute;
  width: 22px;
  height: 2px;
  border-radius: 2px;
  background: currentColor;
  transform: rotate(-45deg);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
