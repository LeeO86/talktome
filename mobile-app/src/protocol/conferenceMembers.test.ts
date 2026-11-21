import { describe, expect, it } from 'vitest';

import {
  excludeSelfConferenceMembers,
  formatLinearLevelDb,
  formatLinearLevelDbShort,
  onlineUserIdsFromPeers,
  sortConferenceMembers,
} from './conferenceMembers';
import { talkTargetFromResponse } from './types';

describe('conference members', () => {
  it('parses members from a conference target payload', () => {
    expect(
      talkTargetFromResponse({
        targetType: 'conference',
        targetId: 2,
        name: 'Traktor',
        members: [
          { userId: 1, name: 'adi' },
          { userId: 1, name: 'dup' },
          { id: 4, name: 'ueli' },
        ],
      }).members,
    ).toEqual([
      { userId: 1, name: 'adi' },
      { userId: 4, name: 'ueli' },
    ]);
  });

  it('drops the signed-in operator and sorts online people first', () => {
    const members = excludeSelfConferenceMembers(
      [
        { userId: 1, name: 'adi' },
        { userId: 9, name: 'zeta' },
        { userId: 3, name: 'beat' },
      ],
      1,
    );
    expect(sortConferenceMembers(members, new Set([9]))).toEqual([
      { userId: 9, name: 'zeta' },
      { userId: 3, name: 'beat' },
    ]);
  });

  it('collects online user ids from peers', () => {
    expect(
      [...onlineUserIdsFromPeers([
        { socketId: 'a', kind: 'user', userId: 9 },
        { socketId: 'b', kind: 'feed', feedId: 2 },
        { socketId: 'c', kind: 'guest' },
      ])],
    ).toEqual([9]);
  });

  it('formats linear levels as dB like the web client', () => {
    expect(formatLinearLevelDb(1)).toBe('0 dB');
    expect(formatLinearLevelDb(0)).toBe('-inf dB');
    expect(formatLinearLevelDb(0.5)).toBe('-6.0 dB');
    expect(formatLinearLevelDbShort(1)).toBe('0');
    expect(formatLinearLevelDbShort(0.5)).toBe('-6');
    expect(formatLinearLevelDbShort(0)).toBe('-∞');
  });
});
