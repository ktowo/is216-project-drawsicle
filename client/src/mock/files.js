// Uploaded images in mock mode become data URLs stored with the rest of the demo data.
// Browsers give localStorage roughly 5 MB, so photos are shrunk (longest side 1200 px,
// JPEG quality 0.85) before they are kept. Without a canvas (tests) the file is stored as is.
import { httpError } from './util.js';

export const IMAGE_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const isFile = (value) => value && typeof value === 'object' && typeof value.arrayBuffer === 'function';

// All files under one FormData field
export function filesFrom(form, field) {
  if (!form || typeof form.getAll !== 'function') return [];
  return form.getAll(field).filter((f) => isFile(f) && f.size > 0);
}

export function checkImage(file, { maxBytes, tooBig, typeCode = 'UPLOAD_INVALID', sizeCode = 'FILE_TOO_LARGE' }) {
  if (!IMAGE_TYPES[file.type]) throw httpError(400, 'Use a PNG, JPG, WebP or GIF image.', typeCode);
  if (file.size > maxBytes) throw httpError(400, tooBig, sizeCode);
}

// The browser decides file.type from the extension, so check the first bytes too (like the server does)
export async function looksLikeImage(file) {
  let b;
  try {
    b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  } catch {
    return false;
  }
  if (b.length < 12) return false;
  const text = (from, to) => String.fromCharCode(...b.subarray(from, to));
  switch (file.type) {
    case 'image/png':
      return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, i) => b[i] === byte);
    case 'image/jpeg':
      return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case 'image/gif':
      return ['GIF87a', 'GIF89a'].includes(text(0, 6));
    case 'image/webp':
      return text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP';
    default:
      return false;
  }
}

async function readAsDataUrl(file) {
  if (typeof FileReader === 'function') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error || new Error('Could not read the file.'));
      reader.readAsDataURL(file);
    });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${file.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}

async function shrinkWithCanvas(file, maxSide, quality) {
  if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') return null;
  // Animated GIFs would lose their animation, so they are kept as they are
  if (file.type === 'image/gif') return null;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    // JPEG has no transparency; paper white looks better than black behind PNG cut-outs
    ctx.fillStyle = '#fffdfa';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return null;
  }
}

export async function imageToDataUrl(file, { maxSide = 1200, quality = 0.85 } = {}) {
  const shrunk = await shrinkWithCanvas(file, maxSide, quality);
  if (shrunk) return shrunk;
  try {
    return await readAsDataUrl(file);
  } catch {
    throw httpError(400, "That image couldn't be read. Try another file.", 'UPLOAD_INVALID');
  }
}
