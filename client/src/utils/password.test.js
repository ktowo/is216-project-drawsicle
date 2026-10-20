import { describe, it, expect } from 'vitest';
import { passwordStrength } from './password.js';

describe('passwordStrength', () => {
  it('calls anything under 8 characters too short', () => {
    expect(passwordStrength('').score).toBe(0);
    expect(passwordStrength('Ab1!xyz').score).toBe(0);
  });

  it('flags common and repetitive passwords whatever their length', () => {
    expect(passwordStrength('password').score).toBe(1);
    expect(passwordStrength('Password123').score).toBe(1);
    expect(passwordStrength('aaaaaaaaaaaa').score).toBe(1);
    expect(passwordStrength('abcd1234').score).toBe(1);
  });

  it('rewards length and a mix of characters', () => {
    expect(passwordStrength('moonteacup').score).toBe(1);
    expect(passwordStrength('moonteacupfox').score).toBe(2);
    expect(passwordStrength('Moon-teacup-7').score).toBe(4);
    expect(passwordStrength('sleepy moth lantern').score).toBe(3);
  });

  it('only gives a tip when the password could be better', () => {
    expect(passwordStrength('moonteacup').tip).toMatch(/12 or more/);
    expect(passwordStrength('Moon-teacup-7').tip).toBe('');
  });
});
