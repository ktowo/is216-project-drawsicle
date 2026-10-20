import { describe, it, expect } from 'vitest';
import { signInMessage, safeRedirect, callbackUrl } from './supabaseAuth';

describe('Supabase sign-in messages', () => {
  it('says the same things the app says today', () => {
    expect(signInMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe('Wrong email or password.');
    expect(signInMessage({ message: 'Invalid login credentials' })).toBe('Wrong email or password.');
    expect(signInMessage({ code: 'email_not_confirmed' })).toMatch(/confirm your email/i);
    expect(signInMessage({ code: 'user_already_exists' })).toMatch(/already an account/i);
    expect(signInMessage({ code: 'over_request_rate_limit' })).toMatch(/too many attempts/i);
  });

  it('falls back to a calm message for anything unexpected', () => {
    expect(signInMessage({ message: 'fetch failed' })).toMatch(/couldn't sign you in/i);
    expect(signInMessage(null)).toMatch(/couldn't sign you in/i);
  });
});

describe('where to go after signing in', () => {
  it('only allows paths on this site', () => {
    expect(safeRedirect('/events/1?tab=gifts')).toBe('/events/1?tab=gifts');
    expect(safeRedirect('//evil.example')).toBe('/dashboard');
    expect(safeRedirect('https://evil.example')).toBe('/dashboard');
    expect(safeRedirect('')).toBe('/dashboard');
    expect(safeRedirect(undefined)).toBe('/dashboard');
  });

  it('builds the callback address on this site, carrying the redirect', () => {
    expect(callbackUrl('https://drawsicle.app', '/', '/events/1')).toBe('https://drawsicle.app/auth/callback?redirect=%2Fevents%2F1');
    expect(callbackUrl('https://x.app', '/app/', '')).toBe('https://x.app/app/auth/callback');
  });
});
