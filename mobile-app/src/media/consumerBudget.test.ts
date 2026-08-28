import { describe, expect, it } from 'vitest';

import type { ActiveProducer } from '../protocol/types';
import { applyConsumerBudget, MAX_RESUMED_CONSUMERS, shouldReplaceRemoteConsumer } from './consumerBudget';

function producer(
  id: string,
  route: ActiveProducer['route'],
  speakerUserId?: number,
): ActiveProducer {
  return {
    peerId: `peer-${id}`,
    producerId: id,
    speakerUserId,
    appData: {},
    route,
  };
}

describe('applyConsumerBudget', () => {
  it('resumes at most the configured consumer budget', () => {
    const producers = Array.from({ length: MAX_RESUMED_CONSUMERS + 4 }, (_, index) =>
      producer(`p${index}`, { kind: 'conference', id: index }),
    );
    const decision = applyConsumerBudget(producers);
    expect(decision.resume).toHaveLength(MAX_RESUMED_CONSUMERS);
    expect(decision.pause).toHaveLength(4);
    expect(decision.overBudget).toBe(true);
  });

  it('keeps the selected talk target ahead of listen-only conferences and feeds', () => {
    const talk = producer('talk', { kind: 'directUser', targetPeerId: 'x' }, 7);
    const conference = producer('conf', { kind: 'conference', id: 1 });
    const feed = producer('feed', { kind: 'feed', id: 3 });
    const extras = Array.from({ length: MAX_RESUMED_CONSUMERS }, (_, index) =>
      producer(`c${index}`, { kind: 'conference', id: 10 + index }),
    );
    const decision = applyConsumerBudget([feed, conference, ...extras, talk], {
      talkTargetKey: 'user-7',
    });
    expect(decision.resume[0]?.producerId).toBe('talk');
    expect(decision.pause.map((item) => item.producerId)).toContain('feed');
  });

  it('keeps a locked talk target when the current talk key is empty', () => {
    const locked = producer('locked', { kind: 'directUser', targetPeerId: 'y' }, 9);
    const extras = Array.from({ length: 8 }, (_, index) =>
      producer(`c${index}`, { kind: 'conference', id: 20 + index }),
    );
    const decision = applyConsumerBudget([locked, ...extras], {
      lockedTargetKey: 'user-9',
    });
    expect(decision.resume[0]?.producerId).toBe('locked');
  });
});

describe('shouldReplaceRemoteConsumer', () => {
  it('replaces a talk consumer when the same producer is re-announced to a new conference', () => {
    const first = producer('talk-1', { kind: 'conference', id: 1 });
    first.appData = { type: 'conference', id: 1 };
    const second = producer('talk-1', { kind: 'conference', id: 2 });
    second.appData = { type: 'conference', id: 2 };
    expect(shouldReplaceRemoteConsumer({ producer: first }, second)).toBe(true);
    expect(shouldReplaceRemoteConsumer({ producer: second }, second)).toBe(false);
    expect(shouldReplaceRemoteConsumer({ producer: first, closed: true }, first)).toBe(true);
  });
});
