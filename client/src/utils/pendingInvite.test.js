import { describe, it, expect } from 'vitest';
import { keepInvite, takeInvite, isInviteProblem } from './pendingInvite';

const memory = () => {
  const data = new Map();
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
};

describe('an invite code kept across the Google round trip', () => {
  it('is kept trimmed and upper-cased, handed back once, then gone', () => {
    const store = memory();
    keepInvite('  abc-123 ', store);
    expect(takeInvite(store)).toBe('ABC-123');
    expect(takeInvite(store)).toBe('');
  });

  it('keeps nothing for an empty code, and copes without storage', () => {
    const store = memory();
    keepInvite('   ', store);
    expect(takeInvite(store)).toBe('');
    const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} };
    expect(() => keepInvite('X', broken)).not.toThrow();
    expect(takeInvite(broken)).toBe('');
  });

  it('knows which sign-in errors are about the invite code', () => {
    expect(['INVITE_REQUIRED', 'INVITE_INVALID', 'INVITE_FULL'].every((code) => isInviteProblem({ code }))).toBe(true);
    expect(isInviteProblem({ code: 'ACCOUNT_BANNED' })).toBe(false);
    expect(isInviteProblem(null)).toBe(false);
  });
});
