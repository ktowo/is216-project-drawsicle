<script setup>
import { CircleCheck, CircleAlert, Info, X } from 'lucide-vue-next';
import { toastState, dismiss, pauseToast, resumeToast } from '@/stores/toast';

const ICONS = { success: CircleCheck, error: CircleAlert, info: Info };
</script>

<template>
  <div class="toast-host" aria-live="polite" aria-relevant="additions">
    <TransitionGroup name="toast" tag="ul" class="toast-list">
      <li
        v-for="t in toastState.items"
        :key="t.id"
        class="toast"
        :class="`toast-${t.type}`"
        @mouseenter="pauseToast(t.id)"
        @mouseleave="resumeToast(t.id)"
        @focusin="pauseToast(t.id)"
        @focusout="resumeToast(t.id)"
      >
        <component :is="ICONS[t.type] || Info" :size="20" class="toast-icon" aria-hidden="true" />
        <p class="toast-text">{{ t.message }}</p>
        <button type="button" class="toast-close" aria-label="Dismiss message" @click="dismiss(t.id)">
          <X :size="16" aria-hidden="true" />
        </button>
      </li>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 100;
  width: min(380px, calc(100vw - 32px));
  pointer-events: none;
}
.toast-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 12px 14px 16px;
  border-radius: 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left-width: 5px;
  box-shadow: 0 10px 30px rgba(60, 40, 20, 0.16);
  color: var(--text);
}
.toast-success {
  border-left-color: var(--success);
}
.toast-success .toast-icon {
  color: var(--success);
}
.toast-error {
  border-left-color: var(--danger);
}
.toast-error .toast-icon {
  color: var(--danger);
}
.toast-info {
  border-left-color: var(--pink);
}
.toast-info .toast-icon {
  color: var(--pink);
}
.toast-icon {
  flex-shrink: 0;
  margin-top: 1px;
}
.toast-text {
  flex: 1;
  margin: 0;
  font-weight: 600;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.toast-close {
  flex-shrink: 0;
  border: 0;
  background: none;
  color: var(--muted);
  padding: 4px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.toast-close:hover {
  background: #f5eee1;
  color: var(--text);
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
.toast-leave-active {
  position: absolute;
  width: 100%;
}
.toast-move {
  transition: transform 0.2s ease;
}

@media (max-width: 640px) {
  .toast-host {
    right: 50%;
    transform: translateX(50%);
    bottom: 16px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active,
  .toast-move {
    transition: none;
  }
}
</style>
