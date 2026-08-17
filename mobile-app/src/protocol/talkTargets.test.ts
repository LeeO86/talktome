import { describe, expect, it } from 'vitest';

import { firstTalkableTarget, normalizeTalkTargets } from './talkTargets';
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
