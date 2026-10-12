<script>
// Shared by every open modal so closing a nested dialog doesn't unlock page scrolling too early
const scrollLock = { count: 0, overflow: '' };
</script>

<script setup>
import { ref, watch, nextTick, onBeforeUnmount, useId } from 'vue';
import { X } from 'lucide-vue-next';

// Dialog rendered at the end of <body>. Closes on Esc, backdrop click or the x button
// (the parent decides by listening to `close`). Keeps keyboard focus inside while open.
const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  size: { type: String, default: 'md', validator: (v) => ['sm', 'md', 'lg'].includes(v) },
});
const emit = defineEmits(['close']);

const titleId = `modal-title-${useId()}`;
const panel = ref(null);
let previousFocus = null;
let pressStartedOnBackdrop = false;

function lockScroll() {
  if (scrollLock.count === 0) {
    scrollLock.overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLock.count++;
}

function unlockScroll() {
  scrollLock.count = Math.max(0, scrollLock.count - 1);
  if (scrollLock.count === 0) document.body.style.overflow = scrollLock.overflow;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables() {
  return panel.value ? [...panel.value.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null) : [];
}

let locked = false;

async function onOpen() {
  previousFocus = document.activeElement;
  if (!locked) {
    lockScroll();
    locked = true;
  }
  document.addEventListener('keydown', onKeydown);
  await nextTick();
  // Prefer the first form control; otherwise the panel itself so screen readers read the title
  const first = panel.value?.querySelector('input:not([disabled]), textarea:not([disabled]), select:not([disabled])');
  (first || panel.value)?.focus();
}

function onClose() {
  document.removeEventListener('keydown', onKeydown);
  if (locked) {
    unlockScroll();
    locked = false;
  }
  if (previousFocus && typeof previousFocus.focus === 'function' && document.contains(previousFocus)) {
    previousFocus.focus();
  }
  previousFocus = null;
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    emit('close');
    return;
  }
  if (e.key !== 'Tab') return;
  const items = focusables();
  if (!items.length) {
    e.preventDefault();
    panel.value?.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.value)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

// Only a click that both starts and ends on the backdrop closes it (not a text selection drag)
function onBackdropDown(e) {
  pressStartedOnBackdrop = e.target === e.currentTarget;
}
function onBackdropUp(e) {
  if (pressStartedOnBackdrop && e.target === e.currentTarget) emit('close');
  pressStartedOnBackdrop = false;
}

watch(
  () => props.open,
  (isOpen) => (isOpen ? onOpen() : onClose()),
  { immediate: true }
);

onBeforeUnmount(() => {
  if (props.open) onClose();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="modal-backdrop" @mousedown="onBackdropDown" @mouseup="onBackdropUp">
        <div
          ref="panel"
          class="modal-panel card"
          :class="`size-${size}`"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="title ? titleId : undefined"
          tabindex="-1"
        >
          <header class="modal-head">
            <h2 v-if="title" :id="titleId" class="modal-title">{{ title }}</h2>
            <button type="button" class="close-btn" aria-label="Close" @click="emit('close')">
              <X :size="20" aria-hidden="true" />
            </button>
          </header>

          <div class="modal-body">
            <slot />
          </div>

          <footer v-if="$slots.footer" class="modal-foot">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px 16px;
  background: rgba(47, 45, 43, 0.42);
  backdrop-filter: blur(2px);
  overflow-y: auto;
}
.modal-panel {
  width: 100%;
  max-height: calc(100vh - 40px);
  display: flex;
  flex-direction: column;
  outline: none;
  box-shadow: 0 20px 50px rgba(60, 40, 20, 0.22);
}
.size-sm {
  max-width: 440px;
}
.size-md {
  max-width: 580px;
}
.size-lg {
  max-width: 820px;
}
.modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 22px 24px 0;
}
.modal-title {
  font-size: 1.4rem;
  font-weight: 700;
  padding-top: 2px;
}
.close-btn {
  margin-left: auto;
  border: 0;
  background: none;
  color: var(--muted);
  border-radius: 10px;
  padding: 6px;
  display: grid;
  place-items: center;
  cursor: pointer;
}
.close-btn:hover {
  background: #f5eee1;
  color: var(--text);
}
.modal-body {
  padding: 14px 24px 22px;
  overflow-y: auto;
}
.modal-foot {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px 22px;
  border-top: 1px solid var(--border);
}
@media (max-width: 480px) {
  .modal-backdrop {
    align-items: flex-end;
    padding: 12px 8px;
  }
  .modal-head {
    padding: 18px 18px 0;
  }
  .modal-body {
    padding: 12px 18px 18px;
  }
  .modal-foot {
    padding: 14px 18px 18px;
  }
  .modal-foot :slotted(.btn) {
    flex: 1 1 auto;
  }
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.15s ease;
}
.modal-enter-active .modal-panel,
.modal-leave-active .modal-panel {
  transition: transform 0.15s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .modal-panel,
.modal-leave-to .modal-panel {
  transform: translateY(8px) scale(0.98);
}
@media (prefers-reduced-motion: reduce) {
  .modal-enter-active,
  .modal-leave-active,
  .modal-enter-active .modal-panel,
  .modal-leave-active .modal-panel {
    transition: none;
  }
}
</style>
