// /showcase: the landing page showcase (server/routes/showcase-router.js)
import { buildCommunities, buildFeed, GIFTS_MAX } from '@shared/showcase.mjs';
import { artistTagsOf } from '@shared/taste.mjs';
import { findUser, submissionPublic, userMini } from '../model.js';

const shown = (e) => e.publicity === 'public' && !['draft', 'cancelled'].includes(e.status) && !e.disabledAt;
const active = (u) => Boolean(u) && (u.status || 'active') === 'active';

export function register(router) {
  router.get('/showcase', (ctx) => {
    const { state } = ctx;
    const events = state.events.filter(shown);
    const ids = new Set(events.map((e) => e.id));
    const accepted = state.applications.filter((a) => ids.has(a.event) && a.status === 'accepted');
    const artistsOf = (eventId) => accepted.filter((a) => a.event === eventId).map((a) => a.user);
    const finished = new Set(events.filter((e) => e.status === 'completed').map((e) => e.id));

    const facts = events.map((e) => ({
      id: e.id,
      name: e.name,
      status: e.status,
      platform: e.platform,
      platformName: e.platformName || '',
      signupDeadline: e.signupDeadline,
      submissionDeadline: e.submissionDeadline,
      completedAt: e.completedAt,
      maxParticipants: e.maxParticipants,
      participants: artistsOf(e.id).length,
      artists: artistsOf(e.id),
    }));

    const agreed = (id) => {
      const u = findUser(state, id);
      return active(u) && Boolean(u.profilePrivacy?.showGifts);
    };
    const characterName = (s) => {
      const app = state.applications.find((a) => a.event === s.event && a.user === s.recipient);
      if (!app || app.offeredCharacters.length !== 1) return '';
      return state.characters.find((c) => c.id === app.offeredCharacters[0])?.name || '';
    };
    const gifts = state.submissions
      .filter((s) => finished.has(s.event) && agreed(s.giver) && agreed(s.recipient))
      .sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)) || b.id.localeCompare(a.id))
      .slice(0, GIFTS_MAX)
      .map((s) => {
        const { id, title, type, images, thumbnails, imageDescriptions, contentWarnings, submittedAt, thanks } = submissionPublic(s);
        const event = state.events.find((e) => e.id === s.event);
        const giver = findUser(state, s.giver);
        return {
          submission: { id, title, type, images, thumbnails, imageDescriptions, contentWarnings, submittedAt },
          event: { id: event.id, name: event.name },
          giver: { ...userMini(giver), cardColor: artistTagsOf(giver.artistTags).cardColor },
          recipient: userMini(findUser(state, s.recipient)),
          characterName: characterName(s),
          thanks: thanks ? { message: thanks.message, reaction: thanks.reaction } : null,
        };
      });

    return {
      stats: {
        exchanges: events.length,
        artists: new Set(accepted.map((a) => a.user)).size,
        giftsRevealed: state.submissions.filter((s) => finished.has(s.event)).length,
        communities: new Set(facts.map((e) => e.platformName.trim().toLowerCase()).filter(Boolean)).size,
      },
      communities: buildCommunities(facts),
      feed: buildFeed(facts, ctx.now),
      gifts,
    };
  });
}
