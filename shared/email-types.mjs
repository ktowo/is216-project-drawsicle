// The kinds of email people can get, and how each can arrive (docs/specs/supabase-auth-email.md):
//   instant  sent when it happens
//   digest   gathered into one email a day
//   off      not emailed (it still shows in the app)
// Used by the server (services/notify.js), demo mode and the notification settings page.
//   server: const { EMAIL_TYPES, EMAIL_MODES } = require('../../shared/email-types.mjs');
//   client: import { EMAIL_TYPES, EMAIL_MODES } from '@shared/email-types.mjs';

export const EMAIL_MODES = ['instant', 'digest', 'off'];

export const EMAIL_TYPES = [
  { key: 'reminders', legacy: 'emailReminders', label: 'Deadline reminders', defaultMode: 'instant' },
  { key: 'matches', legacy: 'emailMatches', label: 'Matches', defaultMode: 'instant' },
  { key: 'eventUpdates', legacy: 'emailEventUpdates', label: 'Event updates', defaultMode: 'digest' },
];

export const EMAIL_TYPE_KEYS = EMAIL_TYPES.map((t) => t.key);

export const DEFAULT_EMAIL_MODES = Object.fromEntries(EMAIL_TYPES.map((t) => [t.key, t.defaultMode]));

// An older on/off switch as a mode: on is that type's usual mode, off stays off
export function modeFromSwitch(typeKey, on) {
  const type = EMAIL_TYPES.find((t) => t.key === typeKey);
  return on ? type?.defaultMode || 'instant' : 'off';
}

// Every type's mode for someone's notification settings: a mode they chose wins; otherwise an older
// on/off switch that is off means off; otherwise the type's usual mode. So accounts from before the
// modes existed keep their choices without any data being rewritten.
export function emailModesOf(prefs = {}) {
  return Object.fromEntries(
    EMAIL_TYPES.map((t) => {
      const chosen = prefs?.emailModes?.[t.key];
      if (EMAIL_MODES.includes(chosen)) return [t.key, chosen];
      return [t.key, prefs?.[t.legacy] === false ? 'off' : t.defaultMode];
    })
  );
}
