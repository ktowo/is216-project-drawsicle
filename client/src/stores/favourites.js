import { reactive, watch } from 'vue';
import { api } from '../api';
import { auth } from './auth';

// Which gifts you've saved ("Saved art"), so every heart button on the site agrees.
// Loaded the first time a heart is shown; cleared when someone else logs in.
//
//   await loadFavourites();  isFavourite(id);  await toggleFavourite(id) // throws ApiError
export const favourites = reactive({ ids: new Set(), loaded: false });
let loading = null;

export function loadFavourites() {
  if (!auth.user || favourites.loaded) return Promise.resolve();
  loading ||= api('/favourites')
    .then(({ ids }) => {
      favourites.ids = new Set(ids);
      favourites.loaded = true;
    })
    .catch(() => {
      // Hearts show as unsaved; saving still works
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

export const isFavourite = (id) => favourites.ids.has(id);

// Save or unsave straight away on screen, and put it back if the server says no
export async function toggleFavourite(id) {
  const saving = !favourites.ids.has(id);
  if (saving) favourites.ids.add(id);
  else favourites.ids.delete(id);
  try {
    await api(`/favourites/${id}`, { method: saving ? 'PUT' : 'DELETE' });
  } catch (e) {
    if (saving) favourites.ids.delete(id);
    else favourites.ids.add(id);
    throw e;
  }
  return saving;
}

watch(
  () => auth.user?.id,
  () => {
    favourites.ids = new Set();
    favourites.loaded = false;
  }
);
