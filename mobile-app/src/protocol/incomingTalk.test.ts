import { describe, expect, it } from 'vitest';

import { parseIncomingTalkState } from './incomingTalk';

describe('parseIncomingTalkState', () => {
  it('reads addressedNow and replyTarget', () => {
    const state = parseIncomingTalkState({
      userId: 4,
      addressedNow: [
        { fromUserId: 9, fromName: 'Pat', targetType: 'user', targetId: 4, at: 1 },
      ],
      replyTarget: { fromUserId: 9, targetType: 'user', targetId: 4 },
    });
    expect(state?.addressedNow[0]?.fromName).toBe('Pat');
    expect(state?.replyTarget?.fromUserId).toBe(9);
  });

  it('unwraps the server { state } envelope and keeps replyTargetType', () => {
    const state = parseIncomingTalkState({
      reason: 'incoming-talk-state',
      state: {
        userId: 4,
        addressedNow: [
          {
            fromUserId: 9,
            fromName: 'beni',
            targetType: 'conference',
            targetId: 2,
            replyTargetType: 'conference',
            replyTargetId: 2,
            at: 10,
          },
        ],
        replyTarget: {
          fromUserId: 9,
          fromName: 'beni',
          targetType: 'conference',
          targetId: 2,
          replyTargetType: 'conference',
          replyTargetId: 2,
        },
      },
    });
    expect(state?.addressedNow).toHaveLength(1);
    expect(state?.replyTarget?.replyTargetType).toBe('conference');
    expect(state?.replyTarget?.replyTargetId).toBe(2);
  });
});
