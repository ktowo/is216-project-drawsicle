<script setup>
import { ref, computed } from 'vue';
import { EyeOff, Eye } from 'lucide-vue-next';
import { CONTENT_WARNINGS, labelFor } from '@shared/constants.mjs';

// Covers pictures that carry content warnings until the viewer chooses to see them.
//   <ContentWarningGate :warnings="submission.contentWarnings"> ...images... </ContentWarningGate>
// With no warnings it just shows what's inside.
const props = defineProps({
  warnings: { type: Array, default: () => [] },
  compact: { type: Boolean, default: false }, // smaller text, for gallery tiles
});

const revealed = ref(false);
const labels = computed(() => props.warnings.map((w) => labelFor(CONTENT_WARNINGS, w)));
const covered = computed(() => labels.value.length > 0 && !revealed.value);
</script>

<template>
  <div class="cw" :class="{ covered, compact }">
    <div class="cw-content" :aria-hidden="covered ? 'true' : undefined" :inert="covered || undefined">
      <slot />
    </div>
    <div v-if="covered" class="cw-cover">
      <EyeOff :size="compact ? 18 : 24" aria-hidden="true" />
      <p class="cw-title">Content warning</p>
      <p class="cw-list">{{ labels.join(', ') }}</p>
      <button type="button" class="btn btn-outline btn-xs cw-btn" @click.stop="revealed = true">
        <Eye :size="14" aria-hidden="true" /> Show anyway
      </button>
    </div>
  </div>
</template>

<style scoped>
.cw {
  position: relative;
  min-width: 0;
}
.covered .cw-content {
  filter: blur(22px) saturate(0.6);
  pointer-events: none;
  user-select: none;
}
.cw-cover {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 12px;
  text-align: center;
  background: color-mix(in srgb, var(--surface) 55%, transparent);
  color: var(--text);
  border-radius: 14px;
}
.cw-title {
  margin: 4px 0 0;
  font-weight: 800;
}
.cw-list {
  margin: 0 0 6px;
  font-size: 0.9rem;
  color: var(--muted);
}
.compact .cw-title {
  font-size: 0.85rem;
  margin: 0;
}
.compact .cw-list {
  font-size: 0.78rem;
  margin-bottom: 4px;
}
.cw-btn {
  background: var(--surface);
}
</style>
