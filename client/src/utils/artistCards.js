// Artist cards for hover cards, fetched once per person while the page is open.
import { api } from '@/api';
import { auth } from '@/stores/auth';

const cache = new Map(); // "viewer:username" -> Promise<card>

// "following" depends on who's looking, so each viewer has their own entries
const keyOf = (username) => `${auth.user?.id || 'guest'}:${String(username || '').toLowerCase()}`;

export function getArtistCard(username) {
  const key = keyOf(username);
  if (!cache.has(key)) {
    const request = api(`/users/${encodeURIComponent(String(username))}/card`).then((res) => res.card);
    // A failed fetch can be tried again next time
    request.catch(() => cache.delete(key));
    cache.set(key, request);
  }
  return cache.get(key);
}

// After following or unfollowing, hover cards should show the new state
export function rememberFollowing(username, following) {
  const key = keyOf(username);
  const request = cache.get(key);
  if (request) cache.set(key, request.then((card) => ({ ...card, following })));
}
