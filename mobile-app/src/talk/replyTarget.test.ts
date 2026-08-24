import { describe, expect, it } from 'vitest';

import { incomingHighlightsTarget, resolveReplyTalkTarget } from './replyTarget';
import type { IncomingTalkState, TalkTarget } from '../protocol';

const traktor: TalkTarget = { type: 'conference', id: 2, label: 'Traktor', canTalk: true };
const beni: TalkTarget = { type: 'user', id: 9, label: 'beni', canTalk: true };

describe('resolveReplyTalkTarget', () => {
  it('unwraps replyTargetType from a live incoming entry', () => {
    const incoming: IncomingTalkState = {
      addressedNow: [
        {
          fromUserId: 9,
          fromName: 'beni',
          targetType: 'user',
          targetId: 4,
          replyTargetType: 'user',
          replyTargetId: 9,
          at: 2,
        },
      ],
      replyTarget: {
        fromUserId: 9,
        fromName: 'beni',
        targetType: 'user',
        targetId: 4,
        replyTargetType: 'user',
        replyTargetId: 9,
      },
    };
    expect(resolveReplyTalkTarget({ incoming, targets: [traktor, beni], peers: [] })?.label).toBe('beni');
  });

  it('keeps the last incoming reply when incoming is idle', () => {
    expect(
      resolveReplyTalkTarget({
        incoming: { addressedNow: [] },
        targets: [traktor, beni],
        peers: [],
        lastReply: beni,
        fallback: traktor,
      }),
    ).toEqual(beni);
  });

  it('does not use a spoken destination when a sticky reply already exists', () => {
    expect(
      resolveReplyTalkTarget({
        incoming: { addressedNow: [] },
        targets: [traktor, beni],
        peers: [],
        lastReply: traktor,
      }),
    ).toEqual(traktor);
  });

  it('prefers live incoming over the sticky reply', () => {
    const incoming: IncomingTalkState = {
      addressedNow: [],
      replyTarget: {
        fromUserId: 9,
        fromName: 'beni',
        targetType: 'user',
        targetId: 4,
        replyTargetType: 'user',
        replyTargetId: 9,
      },
    };
    expect(
      resolveReplyTalkTarget({
        incoming,
        targets: [traktor, beni],
        peers: [],
        lastReply: traktor,
        fallback: traktor,
      }),
    ).toEqual(beni);
  });

  it('falls back to the first talkable target when nothing has spoken to us yet', () => {
    expect(
      resolveReplyTalkTarget({
        incoming: { addressedNow: [] },
        targets: [traktor, beni],
        peers: [],
        lastReply: null,
        fallback: traktor,
      }),
    ).toEqual(traktor);
  });

  it('refreshes the sticky reply against the current target list', () => {
    const staleTraktor: TalkTarget = { type: 'conference', id: 2, label: 'Old Traktor', canTalk: true };
    expect(
      resolveReplyTalkTarget({
        incoming: { addressedNow: [] },
        targets: [traktor],
        peers: [],
        lastReply: staleTraktor,
      }),
    ).toEqual(traktor);
  });

  it('highlights the speaker row for a direct incoming talk', () => {
    expect(
      incomingHighlightsTarget(
        { fromUserId: 9, targetType: 'user', targetId: 4, replyTargetType: 'user', replyTargetId: 9 },
        beni,
      ),
    ).toBe(true);
  });

  it('does not highlight the person being talked to', () => {
    const schniedel: TalkTarget = { type: 'user', id: 4, label: 'Schniedel', canTalk: true };
    expect(
      incomingHighlightsTarget(
        { fromUserId: 9, targetType: 'user', targetId: 4, replyTargetType: 'user', replyTargetId: 4 },
        schniedel,
      ),
    ).toBe(false);
    expect(
      incomingHighlightsTarget(
        { fromUserId: 9, targetType: 'user', targetId: 4, replyTargetType: 'user', replyTargetId: 4 },
        beni,
      ),
    ).toBe(true);
  });

  it('highlights the conference card, not a member user card', () => {
    expect(
      incomingHighlightsTarget(
        { fromUserId: 9, fromName: 'beni', targetType: 'conference', targetId: 2 },
        traktor,
      ),
    ).toBe(true);
    expect(
      incomingHighlightsTarget(
        { fromUserId: 9, fromName: 'beni', targetType: 'conference', targetId: 2 },
        beni,
      ),
    ).toBe(false);
  });
});
