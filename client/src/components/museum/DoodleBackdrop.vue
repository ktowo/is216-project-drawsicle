<script setup>
import { useId } from 'vue';
import DoodlePattern from './DoodlePattern.vue';

// Faint doodles over the whole screen behind a page (the museum's): black on the light theme,
// white on the dark one. Purely decoration, behind everything and never in the way of a click.
const id = `${useId().replace(/[^a-zA-Z0-9_-]/g, '')}-doodles`;
</script>

<template>
  <svg class="doodles" aria-hidden="true" focusable="false">
    <defs>
      <DoodlePattern :id="id" />
    </defs>
    <rect width="100%" height="100%" :fill="`url(#${id})`" />
  </svg>
</template>

<style scoped>
.doodles {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 0;
  width: 100%;
  /* The large viewport height doesn't change as a phone's address bar slides in and out,
     so the pattern is drawn once instead of on every scroll */
  height: 100vh;
  height: 100lvh;
  transform: translateZ(0);
  color: var(--text);
  opacity: 0.045;
  pointer-events: none;
}
</style>
