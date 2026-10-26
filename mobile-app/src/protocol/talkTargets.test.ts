import { describe, expect, it } from 'vitest';

import { canTalkToTarget, firstTalkableTarget, normalizeTalkTargets } from './talkTargets';
import type { TalkTarget } from './types';

const targets: TalkTarget[] = [
  { type: 'user', id: 11, label: 'Stage Left', canTalk: true },
  { type: 'conference', id: 2, label: 'All', canTalk: false },
  { type: 'feed', id: 5, label: 'Program', canTalk: true },
  { type: 'user', id: 11, label: 'Stage Left', canTalk: true },
];

describe('normalizeTalkTargets', () => {
  it('drops feeds and duplicates', () => {
    expect(normalizeTalkTargets(targets)).toEqual([
      { type: 'user', id: 11 },
      { type: 'conference', id: 2 },
    ]);
  });
});

describe('firstTalkableTarget', () => {
  it('skips listen-only and feeds', () => {
    expect(firstTalkableTarget(targets)?.id).toBe(11);
  });
});

describe('canTalkToTarget', () => {
  it('requires a live peer for users and guests', () => {
    const user: TalkTarget = { type: 'user', id: 11, label: 'Stage Left', canTalk: true };
    const guest: TalkTarget = { type: 'guest', id: 'sock-1', label: 'Guest', canTalk: true };
    const conference: TalkTarget = { type: 'conference', id: 2, label: 'All', canTalk: true };
    expect(canTalkToTarget(user, [])).toBe(false);
    expect(canTalkToTarget(user, [{ socketId: 's1', userId: 11, kind: 'user' }])).toBe(true);
    expect(canTalkToTarget(guest, [{ socketId: 'sock-1', kind: 'guest' }])).toBe(true);
    expect(canTalkToTarget(conference, [])).toBe(true);
  });
});
