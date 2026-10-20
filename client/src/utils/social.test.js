// Run: cd client && pnpm exec vitest run src/utils/social.test.js
import { describe, expect, it } from 'vitest';
import { SOCIAL_PLATFORMS, cleanHandle, socialEntries, socialLabel, socialUrl } from './social.js';

describe('socialUrl', () => {
  it('builds profile links for each platform', () => {
    expect(socialUrl('twitter', 'mika')).toBe('https://x.com/mika');
    expect(socialUrl('instagram', 'mika.draws')).toBe('https://www.instagram.com/mika.draws/');
    expect(socialUrl('deviantart', 'mika')).toBe('https://www.deviantart.com/mika');
    expect(socialUrl('toyhouse', 'mika')).toBe('https://toyhou.se/mika');
    expect(socialUrl('tumblr', 'Mika-Art')).toBe('https://mika-art.tumblr.com');
  });

  it('adds .bsky.social to Bluesky handles without a domain', () => {
    expect(socialUrl('bluesky', 'mika')).toBe('https://bsky.app/profile/mika.bsky.social');
    expect(socialUrl('bluesky', 'mika.example.com')).toBe('https://bsky.app/profile/mika.example.com');
  });

  it('ignores a leading @ and surrounding spaces', () => {
    expect(socialUrl('twitter', '  @mika ')).toBe('https://x.com/mika');
  });

  it('has no link for Discord, unknown platforms or odd handles', () => {
    expect(socialUrl('discord', 'mika')).toBeNull();
    expect(socialUrl('myspace', 'mika')).toBeNull();
    expect(socialUrl('twitter', '')).toBeNull();
    expect(socialUrl('twitter', 'a/b')).toBeNull();
    expect(socialUrl('twitter', 'javascript:alert(1)')).toBeNull();
    expect(socialUrl('twitter', 'x'.repeat(51))).toBeNull();
  });

  it('falls back to tumblr.com/<name> when the name cannot be a subdomain', () => {
    expect(socialUrl('tumblr', 'mika_art')).toBe('https://www.tumblr.com/mika_art');
  });
});

describe('socialLabel and cleanHandle', () => {
  it('names the known platforms', () => {
    expect(socialLabel('twitter')).toBe('X / Twitter');
    expect(socialLabel('toyhouse')).toBe('Toyhou.se');
    expect(socialLabel('mastodon')).toBe('Mastodon');
    expect(socialLabel('')).toBe('');
  });

  it('strips @ signs and spaces', () => {
    expect(cleanHandle(' @@mika ')).toBe('mika');
    expect(cleanHandle(null)).toBe('');
  });
});

describe('socialEntries', () => {
  it('lists filled-in socials in display order with links', () => {
    const entries = socialEntries({ discord: 'mika_d', instagram: 'mika.draws', twitter: '', bluesky: '@mika' });
    expect(entries.map((e) => e.key)).toEqual(['instagram', 'bluesky', 'discord']);
    expect(entries[0].url).toBe('https://www.instagram.com/mika.draws/');
    expect(entries[2]).toMatchObject({ handle: 'mika_d', url: null });
  });

  it('keeps the display order of SOCIAL_PLATFORMS and handles missing input', () => {
    expect(SOCIAL_PLATFORMS[0].key).toBe('twitter');
    expect(SOCIAL_PLATFORMS[SOCIAL_PLATFORMS.length - 1].key).toBe('discord');
    expect(socialEntries(null)).toEqual([]);
    expect(socialEntries('nope')).toEqual([]);
  });
});
