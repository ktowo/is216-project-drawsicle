import { reactive } from 'vue';
import { api } from '../api';
import { auth } from './auth';

// The screen pets someone has out (characters with pet.shown), plus what this browser remembers
// about each one: how full it is and where it was left. Feeding is just for fun, so it lives here
// rather than on the server.
const MEMORY_KEY = 'drawsicle-pets';
const HIDDEN_KEY = 'drawsicle-pets-hidden';
const HUNGER_PER_HOUR = 6; // full to empty in about 17 hours
const TREAT = 34;

export const pets = reactive({
  list: [],
  loaded: false,
  hidden: readHidden(), // put away for this visit with "Hide for now"
});

function readHidden() {
  try {
    return JSON.parse(sessionStorage.getItem(HIDDEN_KEY)) || [];
  } catch {
    return [];
  }
}

function readMemory() {
  try {
    return JSON.parse(localStorage.getItem(MEMORY_KEY)) || {};
  } catch {
    return {};
  }
}

function writeMemory(memory) {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
  } catch {
    /* private mode: they'll just forget */
  }
}

export async function refreshPets() {
  if (!auth.user) {
    pets.list = [];
    pets.loaded = true;
    return;
  }
  try {
    const { pets: list } = await api('/characters/pets');
    pets.list = list;
  } catch {
    /* keep whatever we had */
  } finally {
    pets.loaded = true;
  }
}

export function hidePet(id) {
  if (!pets.hidden.includes(id)) pets.hidden.push(id);
  try {
    sessionStorage.setItem(HIDDEN_KEY, JSON.stringify(pets.hidden));
  } catch {
    /* fine */
  }
}

export function showHiddenPets() {
  pets.hidden = [];
  try {
    sessionStorage.removeItem(HIDDEN_KEY);
  } catch {
    /* fine */
  }
}

// 0-100; new pets start fairly full
export function fullnessOf(id, now = Date.now()) {
  const saved = readMemory()[id];
  if (!saved || typeof saved.full !== 'number') return 70;
  const hours = Math.max(0, now - (saved.at || now)) / 36e5;
  return Math.max(0, Math.round(saved.full - hours * HUNGER_PER_HOUR));
}

// -> the new fullness, or null when they're too full to eat
export function feedPet(id) {
  const now = Date.now();
  const before = fullnessOf(id, now);
  if (before >= 96) return null;
  const memory = readMemory();
  const full = Math.min(100, before + TREAT);
  memory[id] = { ...memory[id], full, at: now };
  writeMemory(memory);
  return full;
}

// Where on the floor a pet was left, as a share of the screen width (so it survives resizing)
export function savedSpot(id) {
  const x = readMemory()[id]?.x;
  return typeof x === 'number' && x >= 0 && x <= 1 ? x : null;
}

export function saveSpot(id, x) {
  const memory = readMemory();
  const full = fullnessOf(id);
  memory[id] = { ...memory[id], full, at: Date.now(), x: Math.round(x * 1000) / 1000 };
  writeMemory(memory);
}
