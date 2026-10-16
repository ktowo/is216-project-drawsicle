import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { api } from '@/api';

const EVERY_MS = 2500; // how often a visible page syncs
const HIDDEN_EVERY_MS = 12000; // a background tab keeps its place, but slowly

// Keeps one museum room in step with everyone else (server/routes/museum-rooms.js): sends where
// you are, and hands back who else is here and anything new said in the room.
//
//   const sync = useRoomSync({
//     place: () => ({ kind: 'wing', eventId, room: 0 }),  // null: don't sync
//     signedIn: () => Boolean(auth.user),
//     spot: () => ({ x, y, facing, sitting }),
//     onPeople: (people) => ..., onMessages: (messages) => ...,
//   });
//   await sync.say('/wave');   // throws ApiError (SLOW_DOWN, REPEAT, MUTED...) like api()
//   sync.now();                // sync straight away (after sitting down, say)
export function useRoomSync({ place, signedIn, spot, onPeople, onMessages }) {
  const error = ref('');
  const mutedUntil = ref(null);
  let cursor = null;
  let timer = null;
  let busy = false;
  let stopped = false;
  let lastKey = '';

  const base = () => {
    const p = place();
    return p ? `/museum/rooms/${p.kind}/${p.eventId}/${p.room}` : null;
  };

  async function tick() {
    const url = base();
    if (!url || busy || stopped) return;
    if (url !== lastKey) {
      lastKey = url;
      cursor = null; // a new room: start with its recent history
    }
    busy = true;
    try {
      const data = signedIn()
        ? await api(`${url}/sync`, { method: 'POST', body: { ...spot(), since: cursor } })
        : await api(`${url}/sync${cursor ? `?since=${encodeURIComponent(cursor)}` : ''}`);
      if (url !== base()) return; // moved rooms while waiting
      error.value = '';
      cursor = data.cursor || cursor;
      if ('mutedUntil' in data) mutedUntil.value = data.mutedUntil;
      onPeople(data.people || []);
      if (data.messages?.length) onMessages(data.messages);
    } catch (e) {
      error.value = e.message;
      // Rooms you can't be in won't open by retrying
      if ([401, 403, 404].includes(e.status)) stopped = true;
    } finally {
      busy = false;
    }
  }

  function schedule() {
    clearTimeout(timer);
    if (stopped) return;
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    timer = setTimeout(async () => {
      await tick();
      schedule();
    }, hidden ? HIDDEN_EVERY_MS : EVERY_MS);
  }

  async function now() {
    await tick();
    schedule();
  }

  async function say(text) {
    const url = base();
    if (!url) throw new Error('Not in a room.');
    try {
      const { message } = await api(`${url}/chat`, { method: 'POST', body: { text } });
      onMessages([message]);
      return message;
    } catch (e) {
      if (e.code === 'MUTED') mutedUntil.value = e.data?.mutedUntil || null;
      throw e;
    }
  }

  function leave() {
    if (!signedIn()) return;
    api('/museum/rooms/leave', { method: 'POST' }).catch(() => {});
  }

  const onVisible = () => {
    if (document.visibilityState === 'visible') now();
  };
  const onUnload = () => leave();

  watch(base, (url, old) => {
    if (url && url !== old) {
      stopped = false;
      now();
    }
  });

  onMounted(() => {
    now();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pagehide', onUnload);
  });
  onBeforeUnmount(() => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('pagehide', onUnload);
    leave();
  });

  return { error, mutedUntil, now, say };
}
