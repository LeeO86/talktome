import { describe, expect, it } from 'vitest';

import { addTalkTarget, removeTalkTarget, sameTalkTargets, talkTargetKeys } from './talkSet';
import type { TalkTarget } from '../protocol';

const alice: TalkTarget = { type: 'user', id: 1, label: 'Alice', canTalk: true };
const all: TalkTarget = { type: 'conference', id: 2, label: 'All', canTalk: true };

describe('talkSet', () => {
  it('adds unique targets and reports keys', () => {
    const next = addTalkTarget(addTalkTarget([alice], all), alice);
    expect(talkTargetKeys(next)).toEqual(['user-1', 'conference-2']);
    expect(sameTalkTargets(next, [alice, all])).toBe(true);
  });

  it('removes by identity', () => {
    expect(removeTalkTarget([alice, all], alice)).toEqual([all]);
  });
});
