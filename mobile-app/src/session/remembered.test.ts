import { describe, expect, it } from 'vitest';

import { profileCanAutoConnect, profileIdentity, upsertProfile, type SavedProfile } from './profileModel';

const base = (id: string): SavedProfile => ({
  id,
  serverAddress: 'https://a.example',
  username: 'adi',
  rememberPassword: true,
});

describe('profileIdentity', () => {
  it('normalizes server slash and username case', () => {
    expect(profileIdentity('https://Talk.example/', 'Adi')).toBe(
      profileIdentity('https://talk.example', 'adi'),
    );
  });
});

describe('upsertProfile', () => {
  it('replaces the same id and keeps it first', () => {
    const next = upsertProfile(
      [base('a'), base('b')],
      { ...base('b'), username: 'beni' },
    );
    expect(next.map((item) => item.id)).toEqual(['b', 'a']);
    expect(next[0]?.username).toBe('beni');
  });
});

describe('profileCanAutoConnect', () => {
  it('allows a remembered password or a guest', () => {
    expect(profileCanAutoConnect(base('a'), 'secret')).toBe(true);
    expect(profileCanAutoConnect(base('a'))).toBe(false);
    expect(profileCanAutoConnect({ ...base('a'), guest: { guestId: 'g', guestProfileUserId: 1, name: 'Guest' } })).toBe(
      true,
    );
  });
});
