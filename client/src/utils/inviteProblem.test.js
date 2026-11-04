import { describe, it, expect } from 'vitest';
import { normInvite, rejectInvite, inviteFieldError } from './inviteProblem.js';

describe('rejectInvite', () => {
  it('gives each invite error its own message', () => {
    expect(rejectInvite('INVITE_REQUIRED', '').message).toBe('Enter the invite code you were given.');
    expect(rejectInvite('INVITE_INVALID', 'nope').message).toMatch(/isn't valid/);
    expect(rejectInvite('INVITE_FULL', 'DEV-6').message).toMatch(/used up/);
  });

  it('remembers the code the way the server compares it', () => {
    expect(rejectInvite('INVITE_INVALID', '  dev-6 ').code).toBe('DEV-6');
  });

  it('ignores errors that are not about the invite code', () => {
    expect(rejectInvite('EMAIL_TAKEN', 'DEV-6')).toBeNull();
    expect(rejectInvite(undefined, 'DEV-6')).toBeNull();
  });
});

describe('inviteFieldError', () => {
  it('shows nothing before the server has turned a code down', () => {
    expect(inviteFieldError(null, '')).toBe('');
  });

  it('stays while the field holds the turned-down code, even with different case or spaces', () => {
    const rejected = rejectInvite('INVITE_INVALID', 'dev-7');
    expect(inviteFieldError(rejected, 'dev-7')).toMatch(/isn't valid/);
    expect(inviteFieldError(rejected, ' DEV-7 ')).toMatch(/isn't valid/);
  });

  it('clears as soon as the code is changed', () => {
    const rejected = rejectInvite('INVITE_INVALID', 'DEV-7');
    expect(inviteFieldError(rejected, 'DEV-6')).toBe('');
  });

  it('a missing code clears once something is typed', () => {
    const rejected = rejectInvite('INVITE_REQUIRED', '');
    expect(inviteFieldError(rejected, '   ')).toMatch(/Enter the invite code/);
    expect(inviteFieldError(rejected, 'D')).toBe('');
  });
});

describe('normInvite', () => {
  it('handles empty values', () => {
    expect(normInvite(undefined)).toBe('');
    expect(normInvite(null)).toBe('');
  });
});
