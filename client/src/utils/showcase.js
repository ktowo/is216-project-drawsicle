// Words for the landing page showcase (GET /api/showcase), so the feed table and the floating
// card describe an exchange the same way.
import { timeUntil, pluralize } from './format.js';

const KINDS = {
  open: { pill: 'Sign-ups open', action: 'Sign up' },
  matching: { pill: 'Matching', action: 'Take a look' },
  active: { pill: 'Making gifts', action: 'See the exchange' },
  revealed: { pill: 'Revealed', action: 'See the gifts' },
};

// row: { kind, at, spotsLeft?, artists } → { pill, detail, when, action }
export function describeFeedRow(row, now = Date.now()) {
  const kind = KINDS[row.kind] || KINDS.active;
  const artists = pluralize(row.artists || 0, 'artist');
  let detail = artists;
  let when = '';
  if (row.kind === 'open') {
    detail = row.spotsLeft === null || row.spotsLeft === undefined ? `${artists} joined` : `${pluralize(row.spotsLeft, 'spot')} left`;
    when = `closes ${timeUntil(row.at, now)}`;
  } else if (row.kind === 'matching') {
    when = 'matches coming soon';
  } else if (row.kind === 'active') {
    when = `gifts due ${timeUntil(row.at, now)}`;
  } else if (row.kind === 'revealed') {
    when = `revealed ${timeUntil(row.at, now)}`;
  }
  return { pill: kind.pill, detail, when, action: kind.action };
}

// Every picture of every gift, for the gallery (a gift with two images gets two tiles)
export function galleryTiles(gifts, max = 12) {
  const tiles = [];
  for (const g of gifts) {
    const images = g.submission.images || [];
    images.forEach((image, i) => {
      tiles.push({
        key: `${g.submission.id}-${i}`,
        gift: g,
        image: g.submission.thumbnails?.[i] || image,
        alt: g.submission.imageDescriptions?.[i] || g.submission.title || 'A gift',
      });
    });
  }
  return tiles.slice(0, max);
}
