// Which gifts someone has unwrapped on an event's reveal page, kept in this browser only.
// Losing it (private window, cleared storage) just means the presents are wrapped again.

const keyFor = (eventId) => `drawsicle:unwrapped:${eventId}`;

export function loadUnwrapped(eventId) {
  try {
    const raw = localStorage.getItem(keyFor(eventId));
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function saveUnwrapped(eventId, opened) {
  try {
    localStorage.setItem(keyFor(eventId), JSON.stringify([...opened].slice(-500)));
  } catch {
    // Storage full or blocked: the page still works, it just won't remember
  }
}
