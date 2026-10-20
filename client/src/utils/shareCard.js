// The Share card's words and layout (docs/specs/share-card.md). Pure: it gets the event, the size,
// the time and a text-measuring function, and returns what to draw where. The canvas renderer
// (components/share-card/drawShareCard.js) only follows these instructions, so the preview and the
// downloaded image always match, and everything here can be tested without a canvas.
import { platformLabel } from '@/utils/events';
import { pluralize } from '@/utils/format';

export const CARD_SIZES = {
  story: { width: 1080, height: 1920, label: 'Story' },
  wide: { width: 1200, height: 630, label: 'Wide' },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = 24 * 60 * 60 * 1000;

const shortDate = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
const daysLeft = (value, now) => Math.max(0, Math.ceil((new Date(value).getTime() - now) / DAY));

// open → open; matching and active → active (gifts being made); completed → finished.
// Drafts and cancelled events get no card.
export function cardStage(event) {
  switch (event?.status) {
    case 'open':
      return 'open';
    case 'matching':
    case 'active':
      return 'active';
    case 'completed':
      return 'finished';
    default:
      return null;
  }
}

export function cardCommunity(event) {
  if (!event) return '';
  if (event.platform === 'other' || !event.platform) return (event.platformName || '').trim();
  return platformLabel(event.platform) || '';
}

// What the card says, by stage. Numbers are the event's own, worked out at `now`; no urgency.
export function cardText(event, { now = Date.now(), url = '' } = {}) {
  const stage = cardStage(event);
  if (!stage) return null;
  const count = Number(event.participantCount) || 0;
  const columns = [];
  let qrCaption;
  if (stage === 'open') {
    const days = daysLeft(event.signupDeadline, now);
    columns.push({ label: 'Sign-ups close', value: shortDate(event.signupDeadline), note: pluralize(days, 'day') });
    columns.push({ label: 'Spots taken', value: `${count} of ${event.maxParticipants}` });
    qrCaption = 'Scan to sign up';
  } else if (stage === 'active') {
    columns.push({ label: 'Gifts due', value: shortDate(event.submissionDeadline) });
    columns.push({ label: 'Artists', value: String(count) });
    qrCaption = 'Scan to follow along';
  } else {
    columns.push({ label: 'Gifts', value: 'Revealed' });
    columns.push({ label: 'Artists', value: String(count) });
    qrCaption = 'Scan to see the gifts';
  }
  const community = cardCommunity(event);
  if (community) columns.push({ label: 'Community', value: community });

  const kickers = { open: 'Sign-ups open', active: 'Gifts in progress', finished: 'Gifts revealed' };
  const summaries = {
    open: `Sign-ups close ${shortDate(event.signupDeadline)} (${pluralize(daysLeft(event.signupDeadline, now), 'day')}), ${count} of ${event.maxParticipants} spots taken`,
    active: `Gifts due ${shortDate(event.submissionDeadline)}, ${pluralize(count, 'artist')} taking part`,
    finished: `${pluralize(count, 'artist')} took part, gifts revealed`,
  };
  return {
    stage,
    title: event.name || 'An art exchange',
    kicker: `Admit one artist · ${kickers[stage]}`,
    columns,
    qrCaption,
    link: url.replace(/^https?:\/\//, ''),
    // Read out in place of the image
    summary: `${event.name}. ${summaries[stage]}${community ? `, on ${community}` : ''}. ${url}`,
  };
}

// ---------- Text fitting ----------

// Words into lines no wider than maxWidth. A single word wider than the line is cut letter by letter.
export function wrapText(text, maxWidth, measure) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next) <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    if (measure(word) <= maxWidth) {
      line = word;
    } else {
      // Break a very long word (or a URL) wherever it has to
      let piece = '';
      for (const ch of word) {
        if (measure(piece + ch) > maxWidth && piece) {
          lines.push(piece);
          piece = ch;
        } else {
          piece += ch;
        }
      }
      line = piece;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Cuts the last of maxLines and adds "…" so it still fits
function clampLines(lines, maxLines, maxWidth, measure) {
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = `${kept[maxLines - 1]} ${lines.slice(maxLines).join(' ')}`;
  while (last.length > 1 && measure(`${last}…`) > maxWidth) last = last.slice(0, -1).trimEnd();
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

// Biggest font size (stepping down from max to min) at which the text fits in maxLines;
// at the minimum size anything left over is cut with "…".
// measure(text, size) returns the text's width at that size.
export function fitText(text, { maxWidth, maxLines, maxSize, minSize, step = 2, measure }) {
  for (let size = maxSize; size >= minSize; size -= step) {
    const lines = wrapText(text, maxWidth, (t) => measure(t, size));
    if (lines.length <= maxLines) return { size, lines };
  }
  const at = (t) => measure(t, minSize);
  return { size: minSize, lines: clampLines(wrapText(text, maxWidth, at), maxLines, maxWidth, at) };
}

export function fitOneLine(text, maxWidth, measure) {
  return clampLines(wrapText(text, maxWidth, measure), 1, maxWidth, measure)[0] || '';
}

// ---------- Layout ----------

// Sizes for each format, in card pixels (taken from the chosen prototype, style B "Ticket")
const SPEC = {
  story: {
    ticket: { x: 90, y: 140, w: 900, h: 1640, radius: 44 },
    pad: 50,
    banner: 520,
    kicker: 28,
    title: { max: 104, min: 56, lines: 3 },
    label: 22,
    value: 44,
    stub: { h: 520, qr: 270, caption: 36, link: 24, brand: 26 },
  },
  wide: {
    ticket: { x: 40, y: 40, w: 1120, h: 550, radius: 34 },
    pad: 34,
    banner: 140,
    kicker: 17,
    title: { max: 54, min: 30, lines: 3 },
    label: 15,
    value: 28,
    stub: { w: 300, qr: 170, caption: 22, link: 15, brand: 17 },
  },
};

// measure(text, size, weight) → width in card pixels.
// Returns null for events that get no card.
export function layoutShareCard({ event, size = 'story', now = Date.now(), url = '', measure }) {
  const text = cardText(event, { now, url });
  if (!text) return null;
  const { width, height } = CARD_SIZES[size];
  const s = SPEC[size];
  const t = s.ticket;
  const story = size === 'story';

  // The ticket splits into the main part and the stub: below it on Story, to the right on Wide
  const stub = story
    ? { x: t.x, y: t.y + t.h - s.stub.h, w: t.w, h: s.stub.h }
    : { x: t.x + t.w - s.stub.w, y: t.y, w: s.stub.w, h: t.h };
  const main = story ? { x: t.x, y: t.y, w: t.w, h: t.h - s.stub.h } : { x: t.x, y: t.y, w: t.w - s.stub.w, h: t.h };
  const inner = { x: main.x + s.pad, w: main.w - s.pad * 2 };

  let y = main.y + s.pad;
  const banner = { x: inner.x, y, w: inner.w, h: s.banner, radius: story ? 28 : 18 };
  y += s.banner + (story ? 44 : 18);

  const kicker = { text: fitOneLine(text.kicker.toUpperCase(), inner.w, (x) => measure(x, s.kicker, 800)), x: inner.x, y, size: s.kicker };
  y += s.kicker + (story ? 22 : 10);

  const fitted = fitText(text.title, {
    maxWidth: inner.w,
    maxLines: s.title.lines,
    maxSize: s.title.max,
    minSize: s.title.min,
    measure: (x, px) => measure(x, px, 800),
  });
  const lineHeight = Math.round(fitted.size * 1.04);
  const title = { lines: fitted.lines, x: inner.x, y, size: fitted.size, lineHeight };
  y += lineHeight * fitted.lines.length + (story ? 36 : 14);

  // Columns share the width; anything too long for its column is cut with "…"
  const gap = story ? 36 : 26;
  const colW = (inner.w - gap * (text.columns.length - 1)) / text.columns.length;
  const columns = text.columns.map((c, i) => ({
    x: inner.x + i * (colW + gap),
    y,
    w: colW,
    label: fitOneLine(c.label.toUpperCase(), colW, (x) => measure(x, s.label, 700)),
    value: fitOneLine(c.value, colW, (x) => measure(x, s.value, 800)),
    note: c.note ? fitOneLine(c.note, colW, (x) => measure(x, s.label, 600)) : '',
    labelSize: s.label,
    valueSize: s.value,
  }));

  // Stub: QR, caption, the printed link, the brand
  const qrSize = s.stub.qr;
  const stubPad = story ? 40 : 24;
  const qr = story
    ? { x: stub.x + stubPad + 30, y: stub.y + (stub.h - qrSize) / 2 - 10, size: qrSize }
    : { x: stub.x + (stub.w - qrSize) / 2, y: stub.y + 40, size: qrSize };
  const textX = story ? qr.x + qrSize + 44 : stub.x + stubPad;
  const textW = story ? stub.x + stub.w - stubPad - textX : stub.w - stubPad * 2;
  let ty = story ? qr.y + 20 : qr.y + qrSize + 26;
  const caption = { text: fitOneLine(text.qrCaption, textW, (x) => measure(x, s.stub.caption, 800)), x: textX, y: ty, size: s.stub.caption, align: story ? 'left' : 'center', w: textW };
  ty += s.stub.caption + (story ? 18 : 10);
  const linkLines = clampLines(wrapText(text.link, textW, (x) => measure(x, s.stub.link, 500)), 3, textW, (x) => measure(x, s.stub.link, 500));
  const link = { lines: linkLines, x: textX, y: ty, size: s.stub.link, lineHeight: Math.round(s.stub.link * 1.35), align: caption.align, w: textW };
  const brand = story
    ? { text: 'drawsicle', x: textX, y: qr.y + qrSize - s.stub.brand, size: s.stub.brand, align: 'left', w: textW }
    : { text: 'drawsicle', x: stub.x + stubPad, y: stub.y + stub.h - stubPad - s.stub.brand, size: s.stub.brand, align: 'center', w: textW };

  return {
    width,
    height,
    size,
    stage: text.stage,
    summary: text.summary,
    ticket: t,
    stub: { ...stub, side: story ? 'top' : 'left' },
    banner,
    kicker,
    title,
    columns,
    qr,
    caption,
    link,
    brand,
  };
}
