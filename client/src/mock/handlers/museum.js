// /museum: the public museum (server/routes/museum-router.js). One wing per finished public
// exchange, showing the gifts both the artist and the recipient chose to show.
import { isId } from '../db.js';
import { findUser, miniOf, submissionPublic } from '../model.js';
import { httpError } from '../util.js';

const WINGS_MAX = 60;
const isFinished = (event) => event.publicity === 'public' && event.status === 'completed' && !event.disabledAt;

function shown(state, id) {
  const user = findUser(state, id);
  return Boolean(user && (user.status || 'active') === 'active' && user.profilePrivacy?.showGifts);
}

function publicGifts(state, eventIds) {
  const wanted = new Set(eventIds);
  return state.submissions
    .filter((s) => wanted.has(s.event) && shown(state, s.giver) && shown(state, s.recipient))
    .sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt)) || a.id.localeCompare(b.id));
}

function artwork(state, submission, event) {
  const { id, title, type, images, thumbnails, imageDescriptions, contentWarnings, links, submittedAt } =
    submissionPublic(submission);
  return {
    submission: { id, title, type, images, thumbnails, imageDescriptions, contentWarnings, links, submittedAt },
    event: { id: event.id, name: event.name },
    giver: miniOf(state, submission.giver),
    recipient: miniOf(state, submission.recipient),
  };
}

export function register(router) {
  router.get('/museum', (ctx) => {
    const { state } = ctx;
    const events = state.events
      .filter(isFinished)
      .sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')) || b.id.localeCompare(a.id));
    const gifts = publicGifts(state, events.map((e) => e.id));
    const wings = events
      .map((event) => ({ event, list: gifts.filter((s) => s.event === event.id) }))
      .filter(({ list }) => list.length)
      .slice(0, WINGS_MAX)
      .map(({ event, list }) => {
        const cover = list.map((s) => submissionPublic(s)).find((p) => p.images.length && !p.contentWarnings.length);
        return {
          event: { id: event.id, name: event.name, theme: event.theme || '', completedAt: event.completedAt, bannerUrl: event.bannerUrl || null },
          count: list.length,
          cover: cover ? cover.thumbnails[0] : null,
        };
      });
    return { wings };
  });

  router.get('/museum/:eventId', (ctx) => {
    const { state } = ctx;
    const missing = () => httpError(404, "That wing of the museum isn't open.", 'NOT_FOUND');
    const event = isId(ctx.params.eventId) ? state.events.find((e) => e.id === ctx.params.eventId) : null;
    if (!event || !isFinished(event)) throw missing();
    const gifts = publicGifts(state, [event.id]);
    if (!gifts.length) throw missing();
    return {
      event: { id: event.id, name: event.name, theme: event.theme || '', completedAt: event.completedAt, museumTheme: event.museumTheme || 'auto' },
      artworks: gifts.map((s) => artwork(state, s, event)),
    };
  });
}
