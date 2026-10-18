import { reactive } from 'vue';
import { play } from '@/effects/sfx';

// Small pop-up messages. ToastHost (mounted once in App.vue) shows them.
//   import { toast } from '@/stores/toast';
//   toast.success('Saved.');  toast.error(e.message);  toast.info('Link copied.');

const DURATION = 4000;
const MAX_VISIBLE = 4;

export const toastState = reactive({ items: [] });

const timers = new Map();
let nextId = 1;

function startTimer(id, ms = DURATION) {
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => dismiss(id), ms));
}

// quiet: no sound (when whatever happened already played its own)
function show(type, message, { duration = DURATION, quiet = false } = {}) {
  const text = String(message ?? '').trim();
  if (!text) return null;

  // Same message twice in a row (e.g. a double click): restart its timer instead of stacking.
  const last = toastState.items[toastState.items.length - 1];
  if (last && last.type === type && last.message === text) {
    startTimer(last.id, duration);
    return last.id;
  }

  const id = nextId++;
  toastState.items.push({ id, type, message: text, duration });
  if (!quiet) play(type === 'success' ? 'chime' : type === 'error' ? 'bonk' : 'ding');
  while (toastState.items.length > MAX_VISIBLE) dismiss(toastState.items[0].id);
  startTimer(id, duration);
  return id;
}

export function dismiss(id) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  const index = toastState.items.findIndex((t) => t.id === id);
  if (index !== -1) toastState.items.splice(index, 1);
}

// Hovering or focusing a toast keeps it on screen so it can be read.
export function pauseToast(id) {
  clearTimeout(timers.get(id));
}

export function resumeToast(id) {
  const item = toastState.items.find((t) => t.id === id);
  if (item) startTimer(id, Math.min(item.duration, 2500));
}

export const toast = {
  success: (message, options) => show('success', message, options),
  error: (message, options) => show('error', message, options),
  info: (message, options) => show('info', message, options),
  dismiss,
};
