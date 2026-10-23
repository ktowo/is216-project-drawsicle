import { describe, it, expect } from 'vitest';
import { signInMethods } from './signInMethods';

const id = (provider) => ({ provider, identity_id: `${provider}-1` });
const offered = { google: true, discord: true };

describe('ways to sign in, from Supabase identities', () => {
  it('lists email and every offered provider, marking which are connected', () => {
    const rows = signInMethods([id('email'), id('google')], offered);
    expect(rows.map((r) => [r.key, r.connected])).toEqual([
      ['password', true],
      ['google', true],
      ['discord', false],
    ]);
  });

  it('lets people disconnect a sign-in only while another one remains', () => {
    const two = signInMethods([id('email'), id('google')], offered);
    expect(two.find((r) => r.key === 'google').canDisconnect).toBe(true);
    expect(two.find((r) => r.key === 'password').canDisconnect).toBe(true);

    const one = signInMethods([id('discord')], offered);
    expect(one.find((r) => r.key === 'discord').canDisconnect).toBe(false);
  });

  it('offers to connect only providers that are switched on', () => {
    const rows = signInMethods([id('email')], { google: true, discord: false });
    expect(rows.map((r) => r.key)).toEqual(['password', 'google']);
    expect(rows.find((r) => r.key === 'google').canConnect).toBe(true);
    expect(rows.find((r) => r.key === 'password').canConnect).toBe(false); // passwords are set, not connected
  });

  it('still shows a connected provider even if it has since been switched off', () => {
    const rows = signInMethods([id('email'), id('discord')], { google: false, discord: false });
    expect(rows.map((r) => r.key)).toEqual(['password', 'discord']);
  });
});
