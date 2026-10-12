// Shrinks images in the browser before they are uploaded.
// On Vercel a whole request (every file plus the form fields) must stay under 4.5 MB, and a
// phone photo alone is often bigger than that, so every upload goes through prepareImage()
// and forms that send several files check totalBytes() against MAX_UPLOAD_REQUEST_BYTES.
//
//   const ready = await prepareImage(file);           // throws Error with a friendly message
//   if (totalBytes(newFiles) > MAX_UPLOAD_REQUEST_BYTES) { ...refuse... }
import { LIMITS } from '@shared/constants.mjs';

// Stays under Vercel's 4.5 MB request cap, leaving room for the other form fields
export const MAX_UPLOAD_REQUEST_BYTES = 4 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

// For <input type="file" :accept="IMAGE_ACCEPT">
export const IMAGE_ACCEPT = ACCEPTED_IMAGE_TYPES.join(',');

const EXTENSION_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

// Files this small are sent as they are; re-encoding them gains little
const SMALL_ENOUGH_BYTES = 1024 * 1024;

// Decoding a huge file can run a phone out of memory, so very large originals are refused
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

// One file can never be bigger than the whole request may be
const MAX_FILE_BYTES = Math.min(LIMITS.imageBytes, MAX_UPLOAD_REQUEST_BYTES);

// '850 KB', '3.2 MB'
export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// The image type of a file, or '' when it isn't one we accept.
// Some systems leave file.type empty, so the extension is used as a fallback.
export function imageTypeOf(file) {
  if (!file) return '';
  if (file.type) return ACCEPTED_IMAGE_TYPES.includes(file.type) ? file.type : '';
  const ext = String(file.name || '').split('.').pop().toLowerCase();
  return EXTENSION_TYPES[ext] || '';
}

export function isAcceptedImage(file) {
  return Boolean(imageTypeOf(file));
}

export function totalBytes(files) {
  return Array.from(files || []).reduce((sum, file) => sum + (Number(file?.size) || 0), 0);
}

const displayName = (file) => file?.name || 'That file';

function renamed(name, ext) {
  const base = String(name || 'image').replace(/\.[^./\\]+$/, '') || 'image';
  return `${base}.${ext}`;
}

// Same bytes, but with a proper type so the server's type check accepts it
function withType(file, type) {
  if (file.type === type) return file;
  return new File([file], file.name || renamed('image', type.split('/')[1]), {
    type,
    lastModified: file.lastModified,
  });
}

function tooBig(file) {
  return new Error(
    `${displayName(file)} is still bigger than ${formatBytes(MAX_FILE_BYTES)} after shrinking it. Try a smaller image.`
  );
}

// -> { source, width, height, release() }. createImageBitmap applies the photo's EXIF rotation.
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close?.() };
    } catch {
      // Older Safari doesn't take the options object; the <img> route below still works
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// Draws the image at most maxSide pixels on its long edge and encodes it as WebP
// (keeps transparency), or JPEG on a white background where WebP encoding isn't supported.
async function encode(image, maxSide, quality) {
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image.source, 0, 0, width, height);

  try {
    // Browsers that can't make WebP quietly hand back a PNG instead
    const webp = await toBlob(canvas, 'image/webp', quality);
    if (webp && webp.type === 'image/webp') return { blob: webp, ext: 'webp', resized: scale < 1 };

    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    const jpeg = await toBlob(canvas, 'image/jpeg', quality);
    return jpeg ? { blob: jpeg, ext: 'jpg', resized: scale < 1 } : null;
  } finally {
    canvas.width = 0; // frees the pixels straight away on mobile browsers
  }
}

export async function prepareImage(file, { maxSide = 2000, quality = 0.85 } = {}) {
  if (!file || typeof file.size !== 'number') throw new Error('Choose an image file.');

  const type = imageTypeOf(file);
  if (!type) throw new Error(`${displayName(file)} isn't a PNG, JPG, WebP or GIF image.`);
  if (!file.size) throw new Error(`${displayName(file)} is empty.`);

  // GIFs may be animated and a canvas would keep only the first frame
  if (type === 'image/gif' || file.size <= SMALL_ENOUGH_BYTES) {
    if (file.size > MAX_FILE_BYTES) throw tooBig(file);
    return withType(file, type);
  }

  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error(`${displayName(file)} is too large to upload (${formatBytes(file.size)}). Try one under 40 MB.`);
  }

  let image;
  try {
    image = await decode(file);
  } catch {
    throw new Error(`${displayName(file)} couldn't be read. It may be damaged, or saved in a format we don't support.`);
  }

  try {
    // A second, smaller try for the rare image that is still too big
    const attempts = [
      { side: maxSide, q: quality },
      { side: Math.round(maxSide * 0.75), q: Math.min(quality, 0.72) },
    ];
    let best = null;
    for (const attempt of attempts) {
      const result = await encode(image, attempt.side, attempt.q);
      if (!result) break;
      best = result;
      if (result.blob.size <= MAX_FILE_BYTES) break;
    }

    if (!best) {
      // The browser couldn't encode it at all: send the original if it fits
      if (file.size <= MAX_FILE_BYTES) return withType(file, type);
      throw tooBig(file);
    }

    // Already well compressed and not resized: the original is the better file
    if (!best.resized && best.blob.size >= file.size && file.size <= MAX_FILE_BYTES) return withType(file, type);
    if (best.blob.size > MAX_FILE_BYTES) throw tooBig(file);

    return new File([best.blob], renamed(file.name, best.ext), {
      type: best.blob.type,
      lastModified: file.lastModified || Date.now(),
    });
  } finally {
    image.release();
  }
}

// Runs several files through prepareImage, keeping the ones that worked.
//   const { files, errors } = await prepareImages(picked);
export async function prepareImages(list, options) {
  const files = [];
  const errors = [];
  for (const file of Array.from(list || [])) {
    try {
      files.push(await prepareImage(file, options));
    } catch (e) {
      errors.push(e.message);
    }
  }
  return { files, errors };
}
