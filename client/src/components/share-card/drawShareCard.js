// Draws a Share card onto a canvas, following layoutShareCard() (utils/shareCard.js) exactly.
// Always the light palette. The banner is optional: without one (or when the browser won't let
// us use it) the seasonal gradient stands in.
import QRCode from 'qrcode';
import { layoutShareCard } from '@/utils/shareCard';

// Same season colours as the event banner placeholder (components/events/EventBanner.vue)
export const SEASON_COLOURS = {
  winter: ['#cfe3f8', '#a7c7ee', '#eef5fd'],
  spring: ['#d6efcb', '#f9cfe0', '#fff5d9'],
  summer: ['#ffe29a', '#ffbb8c', '#fff3d4'],
  autumn: ['#f5c48f', '#e39a6c', '#fbe6cd'],
  valentine: ['#fbc3d6', '#f08cae', '#fde6ee'],
  halloween: ['#f6b26b', '#bba0dc', '#fbe2c5'],
  christmas: ['#f3a7a7', '#a9d6b2', '#fdebea'],
  other: ['#fbd5e2', '#f4b8cc', '#faf3e8'],
};

const INK = '#2f2d2b';
const MUTED = '#6f645b';
const ACCENT = '#a33b62';
const PAPER = '#fffaf3';
const STUB = '#fdf0d2';
const PERFORATION = '#e3cfae';

function fontFamily() {
  return getComputedStyle(document.body).fontFamily || 'sans-serif';
}

// A measuring function for the layout, using the page's font
export function canvasMeasure(ctx) {
  const family = fontFamily();
  return (text, size, weight = 400) => {
    ctx.font = `${weight} ${size}px ${family}`;
    return ctx.measureText(text).width;
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function seasonGradient(ctx, colours, x, y, w, h) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, colours[0]);
  g.addColorStop(0.55, colours[1]);
  g.addColorStop(1, colours[2]);
  return g;
}

// Image scaled to cover the box, centred
function drawCover(ctx, img, box) {
  const scale = Math.max(box.w / img.naturalWidth, box.h / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  ctx.drawImage(img, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
}

function text(ctx, value, { x, y, size, weight = 400, colour = INK, align = 'left', w = 0, family }) {
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.fillStyle = colour;
  ctx.textBaseline = 'top';
  ctx.textAlign = align === 'center' ? 'center' : 'left';
  ctx.fillText(value, align === 'center' ? x + w / 2 : x, y);
}

function drawQr(ctx, url, box) {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const count = qr.modules.size;
  const quiet = 2;
  const cell = box.size / (count + quiet * 2);
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, box.x, box.y, box.size, box.size, 16);
  ctx.fill();
  ctx.fillStyle = INK;
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.modules.get(row, col)) {
        // Slightly oversized cells so neighbours touch without hairline gaps
        ctx.fillRect(box.x + (col + quiet) * cell, box.y + (row + quiet) * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
  }
}

// Draws the card and returns its layout (null when the event gets no card).
// banner: a loaded HTMLImageElement, or null for the seasonal fallback.
export function drawShareCard(canvas, { event, size, url, banner = null, now = Date.now() }) {
  const ctx = canvas.getContext('2d');
  const card = layoutShareCard({ event, size, now, url, measure: canvasMeasure(ctx) });
  if (!card) return null;
  const family = fontFamily();
  const colours = SEASON_COLOURS[event.season] || SEASON_COLOURS.other;
  canvas.width = card.width;
  canvas.height = card.height;

  // Background: the season's colours
  ctx.fillStyle = seasonGradient(ctx, colours, 0, 0, card.width, card.height);
  ctx.fillRect(0, 0, card.width, card.height);

  // The ticket, with a soft shadow
  const t = card.ticket;
  ctx.save();
  ctx.shadowColor = 'rgba(60, 40, 20, 0.22)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  ctx.fillStyle = PAPER;
  roundRect(ctx, t.x, t.y, t.w, t.h, t.radius);
  ctx.fill();
  ctx.restore();

  // Stub: its own colour, clipped to the ticket's rounded corners
  const s = card.stub;
  ctx.save();
  roundRect(ctx, t.x, t.y, t.w, t.h, t.radius);
  ctx.clip();
  ctx.fillStyle = STUB;
  ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.restore();

  // Perforation: a dashed tear line with a notch cut out at each end
  ctx.save();
  ctx.strokeStyle = PERFORATION;
  ctx.lineWidth = 6;
  ctx.setLineDash([18, 14]);
  ctx.beginPath();
  if (s.side === 'top') {
    ctx.moveTo(s.x + 34, s.y);
    ctx.lineTo(s.x + s.w - 34, s.y);
  } else {
    ctx.moveTo(s.x, s.y + 34);
    ctx.lineTo(s.x, s.y + s.h - 34);
  }
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = seasonGradient(ctx, colours, 0, 0, card.width, card.height);
  const notches = s.side === 'top' ? [[s.x, s.y], [s.x + s.w, s.y]] : [[s.x, s.y], [s.x, s.y + s.h]];
  for (const [nx, ny] of notches) {
    ctx.beginPath();
    ctx.arc(nx, ny, 22, 0, Math.PI * 2);
    ctx.fill();
  }

  // Banner (or the seasonal gradient)
  const b = card.banner;
  ctx.save();
  roundRect(ctx, b.x, b.y, b.w, b.h, b.radius);
  ctx.clip();
  if (banner) drawCover(ctx, banner, b);
  else {
    ctx.fillStyle = seasonGradient(ctx, colours, b.x, b.y, b.w, b.h);
    ctx.fillRect(b.x, b.y, b.w, b.h);
  }
  ctx.restore();

  // Words
  text(ctx, card.kicker.text, { ...card.kicker, weight: 800, colour: ACCENT, family });
  card.title.lines.forEach((line, i) => {
    text(ctx, line, { x: card.title.x, y: card.title.y + i * card.title.lineHeight, size: card.title.size, weight: 800, family });
  });
  for (const c of card.columns) {
    text(ctx, c.label, { x: c.x, y: c.y, size: c.labelSize, weight: 700, colour: MUTED, family });
    text(ctx, c.value, { x: c.x, y: c.y + c.labelSize + 8, size: c.valueSize, weight: 800, family });
    if (c.note) text(ctx, c.note, { x: c.x, y: c.y + c.labelSize + c.valueSize + 16, size: c.labelSize, weight: 600, colour: MUTED, family });
  }

  // Stub contents
  drawQr(ctx, url, card.qr);
  text(ctx, card.caption.text, { ...card.caption, weight: 800, family });
  card.link.lines.forEach((line, i) => {
    text(ctx, line, { x: card.link.x, y: card.link.y + i * card.link.lineHeight, size: card.link.size, weight: 500, colour: MUTED, align: card.link.align, w: card.link.w, family });
  });
  text(ctx, card.brand.text, { ...card.brand, weight: 800, colour: ACCENT, family });

  return card;
}

// Loads the banner for drawing. Resolves to null (seasonal fallback) if there's none or it fails.
export function loadBanner(src) {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// The finished PNG. If the banner made the canvas unreadable ("tainted"), the caller redraws
// without it and tries again.
export function canvasToPng(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not make the image.'))), 'image/png');
    } catch (err) {
      reject(err);
    }
  });
}
