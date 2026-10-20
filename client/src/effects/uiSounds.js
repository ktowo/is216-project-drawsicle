import { play } from './sfx';

// The sounds every page gets without asking: a soft tap for main buttons, a tick for tabs and
// smaller buttons, a pop for chips and switches. Anything can pick its own sound with
// data-sfx="name", or stay quiet with data-sfx="none" (when its own code plays something better).
function soundFor(target) {
  const own = target.closest('[data-sfx]');
  if (own) return own.getAttribute('data-sfx');
  const control = target.closest('button, a, [role="tab"], [role="switch"], input[type="checkbox"], input[type="radio"], summary');
  if (!control || control.disabled || control.getAttribute('aria-disabled') === 'true') return null;
  if (control.matches('input[type="checkbox"], input[type="radio"], [role="switch"]')) return 'toggle';
  // A label wrapping a checkbox clicks it too: let the checkbox make the sound
  if (control.matches('[role="tab"]')) return 'tick';
  if (control.matches('.btn-primary')) return 'tap';
  if (control.matches('button[aria-pressed], .chip, .tag-chip')) return 'pop';
  if (control.matches('summary')) return 'tick';
  if (control.matches('button, .btn')) return 'tick';
  return null; // plain links: no sound
}

export function installUiSounds() {
  document.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented && !event.target.closest?.('[data-sfx]')) return;
      // Clicks on a label are repeated on its checkbox; only sound once
      if (event.target.closest?.('label') && !event.target.matches?.('input')) {
        const input = event.target.closest('label').querySelector('input[type="checkbox"], input[type="radio"]');
        if (input) return;
      }
      const name = soundFor(event.target);
      if (name && name !== 'none') play(name);
    },
    true
  );
}
