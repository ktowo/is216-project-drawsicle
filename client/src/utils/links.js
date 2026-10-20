import { REFERENCE_URL_RE } from '@shared/constants.mjs';

// Reference links are web addresses, or the demo's own reference pictures (/demo-refs/...),
// which live under the site's base path (/is216-project-drawsicle/ on GitHub Pages).

export const isReferenceUrl = (url) => REFERENCE_URL_RE.test(String(url ?? '').trim());

export function linkHref(url) {
  const value = String(url ?? '').trim();
  return value.startsWith('/') ? `${import.meta.env.BASE_URL}${value.slice(1)}` : value;
}

// What to call a link that has no label: the site it's on, or "Reference picture"
export function linkText(link) {
  if (link?.label) return link.label;
  const url = String(link?.url ?? '');
  if (url.startsWith('/')) return 'Reference picture';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// Splits free text (wishlists, notes) into plain parts and links, for showing links as links
const IN_TEXT = /(https?:\/\/[^\s<>"')\]]+|\/demo-refs\/[\w.-]+)/gi;
export function splitLinks(text) {
  const parts = [];
  let last = 0;
  for (const m of String(text ?? '').matchAll(IN_TEXT)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ url: m[0] });
    last = m.index + m[0].length;
  }
  if (last < String(text ?? '').length) parts.push({ text: text.slice(last) });
  return parts;
}
