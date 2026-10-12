// Links for the social handles people add in their profile settings.
// Handles are saved without the @ and checked by the server (server/routes/profile-router.js),
// but anything odd is still turned into "no link" here rather than a broken URL.

// Display order on public profiles. Discord has no public profile pages, so it comes last
// and is shown as a handle with a copy button instead of a link.
export const SOCIAL_PLATFORMS = [
  { key: 'twitter', label: 'X / Twitter' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'bluesky', label: 'Bluesky' },
  { key: 'deviantart', label: 'DeviantArt' },
  { key: 'toyhouse', label: 'Toyhou.se' },
  { key: 'tumblr', label: 'Tumblr' },
  { key: 'discord', label: 'Discord' },
];

// Same rule as the server: up to 50 letters, numbers, dots, dashes or underscores
const HANDLE_RE = /^[A-Za-z0-9_.-]{1,50}$/;

export function cleanHandle(handle) {
  return String(handle ?? '')
    .trim()
    .replace(/^@+/, '');
}

export function socialLabel(platform) {
  const known = SOCIAL_PLATFORMS.find((p) => p.key === platform);
  if (known) return known.label;
  const raw = String(platform ?? '').trim();
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : '';
}

// socialUrl('bluesky', 'mika') -> 'https://bsky.app/profile/mika.bsky.social'
// Returns null for Discord, unknown platforms and handles that can't be a real account.
export function socialUrl(platform, handle) {
  const h = cleanHandle(handle);
  if (!HANDLE_RE.test(h)) return null;
  const path = encodeURIComponent(h);

  switch (platform) {
    case 'twitter':
      return `https://x.com/${path}`;
    case 'instagram':
      return `https://www.instagram.com/${path}/`;
    case 'bluesky': {
      // Bluesky handles are domains; a bare name means the default bsky.social one
      const domain = h.includes('.') ? h : `${h}.bsky.social`;
      return `https://bsky.app/profile/${encodeURIComponent(domain.toLowerCase())}`;
    }
    case 'deviantart':
      return `https://www.deviantart.com/${path}`;
    case 'toyhouse':
      return `https://toyhou.se/${path}`;
    case 'tumblr':
      // Blog names are letters, numbers and dashes, so they work as a subdomain.
      // Anything else falls back to the tumblr.com/<name> address.
      return /^[A-Za-z0-9-]+$/.test(h) && !h.startsWith('-') && !h.endsWith('-')
        ? `https://${h.toLowerCase()}.tumblr.com`
        : `https://www.tumblr.com/${path}`;
    default:
      return null;
  }
}

// Filled-in socials in display order: [{ key, label, handle, url }]
export function socialEntries(socials) {
  if (!socials || typeof socials !== 'object') return [];
  return SOCIAL_PLATFORMS.map(({ key, label }) => {
    const handle = cleanHandle(socials[key]);
    return { key, label, handle, url: handle ? socialUrl(key, handle) : null };
  }).filter((entry) => entry.handle && HANDLE_RE.test(entry.handle));
}
