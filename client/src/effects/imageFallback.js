import { demoArtDataUrl } from '@shared/demo-art.mjs';

// When any picture on the page can't load (a moved file, a storage bucket that's down, an old
// link), swap in generated artwork so nothing shows as a broken image. The same address always
// gets the same artwork. Works for <img> and SVG <image> (museum frames).
const FLAG = 'data-image-fallback';

function addressOf(el) {
  if (el instanceof HTMLImageElement) return el.currentSrc || el.getAttribute('src') || '';
  return el.getAttribute('href') || el.getAttribute('xlink:href') || '';
}

function swap(el) {
  if (el.hasAttribute(FLAG)) return; // the fallback itself failed: leave it alone
  const address = addressOf(el);
  if (!address || address.startsWith('data:')) return;
  el.setAttribute(FLAG, address);
  const title = el.getAttribute('alt') || el.getAttribute('aria-label') || '';
  const art = demoArtDataUrl({ seed: address, title, width: 600, height: 450 });
  if (el instanceof HTMLImageElement) {
    el.removeAttribute('srcset');
    el.src = art;
  } else {
    el.setAttribute('href', art);
  }
}

export function installImageFallback(root = document) {
  root.addEventListener(
    'error',
    (event) => {
      const el = event.target;
      if (el instanceof HTMLImageElement || (typeof SVGImageElement !== 'undefined' && el instanceof SVGImageElement)) swap(el);
    },
    true // load errors don't bubble, so listen on the way down
  );
  // Pictures that failed before this ran
  for (const img of root.querySelectorAll?.('img') || []) {
    if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) swap(img);
  }
}
