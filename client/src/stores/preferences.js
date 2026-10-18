import { reactive, watch } from 'vue';

// Per-browser display choices: colour theme, the sparkle cursor and the screen pets.
// theme: 'light' | 'dark' | null (null = follow the device setting)
const KEY = 'drawsicle-preferences';

function readSaved() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

const saved = readSaved();
const systemDark =
  typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export const preferences = reactive({
  theme: saved.theme === 'light' || saved.theme === 'dark' ? saved.theme : null,
  sparkles: saved.sparkles !== false,
  pets: saved.pets !== false,
  resolvedTheme: 'light', // what's actually showing
});

function applyTheme() {
  const theme = preferences.theme || (systemDark?.matches ? 'dark' : 'light');
  preferences.resolvedTheme = theme;
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#141219' : '#faf7f0');
}

export function toggleTheme() {
  preferences.theme = preferences.resolvedTheme === 'dark' ? 'light' : 'dark';
}

export function toggleSparkles() {
  preferences.sparkles = !preferences.sparkles;
}

export function togglePets() {
  preferences.pets = !preferences.pets;
}

export function initPreferences() {
  applyTheme();
  systemDark?.addEventListener('change', () => {
    if (!preferences.theme) applyTheme();
  });
  watch(
    () => [preferences.theme, preferences.sparkles, preferences.pets],
    () => {
      applyTheme();
      try {
        localStorage.setItem(KEY, JSON.stringify({ theme: preferences.theme, sparkles: preferences.sparkles, pets: preferences.pets }));
      } catch {
        /* private mode: the choice just won't be remembered */
      }
    }
  );
}
