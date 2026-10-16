<script setup>
import PixelHead from './PixelHead.vue';

// Chat bubbles floating over the room: each appears above whoever spoke, then drifts up a row
// whenever something new is said (or after a while), and fades out at the top.
// bubbles: [{ id, left (% across the room), row, user, name, kind, emote, text }]
defineProps({
  bubbles: { type: Array, default: () => [] },
  maxRows: { type: Number, default: 7 },
});

const ROW_PX = 34;
</script>

<template>
  <div class="bubbles" aria-hidden="true">
    <div
      v-for="b in bubbles"
      :key="b.id"
      class="bubble-wrap"
      :style="{ left: `${b.left}%`, transform: `translate(-50%, ${-b.row * ROW_PX}px)`, opacity: b.row >= maxRows ? 0 : 1 }"
    >
      <div class="bubble" :class="b.kind">
        <PixelHead :user="b.user" :size="22" />
        <span class="text">
          <template v-if="b.kind === 'emote'">
            <em>{{ b.name }} {{ b.text }}</em>
          </template>
          <template v-else>
            <strong>{{ b.name }}:</strong> {{ b.text }}
          </template>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bubbles {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.bubble-wrap {
  position: absolute;
  top: 34%;
  max-width: min(78%, 360px);
  transition: transform 0.45s ease, opacity 0.45s ease;
}
.bubble {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px 3px 4px;
  border: 1.5px solid #2b2230;
  border-radius: 11px;
  background: #fffdf8;
  color: #2b2230;
  font-size: 0.82rem;
  line-height: 1.25;
  box-shadow: 0 2px 0 rgba(43, 34, 48, 0.35);
  animation: pop 0.28s cubic-bezier(0.3, 1.6, 0.6, 1);
  --museum-head-bg: #f3ece6;
}
.text {
  min-width: 0;
  overflow-wrap: anywhere;
}
.bubble.shout {
  border-color: #c4314f;
  background: #fff1f3;
  font-size: 0.95rem;
  font-weight: 800;
  text-transform: uppercase;
}
.bubble.emote {
  border-style: dashed;
  background: #f4efff;
}
@keyframes pop {
  from {
    transform: scale(0.5) translateY(10px);
    opacity: 0;
  }
  to {
    transform: none;
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .bubble-wrap {
    transition: none;
  }
  .bubble {
    animation: none;
  }
}
</style>
