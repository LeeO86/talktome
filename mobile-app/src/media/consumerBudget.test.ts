import { describe, expect, it } from 'vitest';

import type { ActiveProducer } from '../protocol/types';
import { applyConsumerBudget, MAX_RESUMED_CONSUMERS } from './consumerBudget';

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
  it('resumes at most eight consumers', () => {
    const producers = Array.from({ length: 12 }, (_, index) =>
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
    const extras = Array.from({ length: 8 }, (_, index) =>
      producer(`c${index}`, { kind: 'conference', id: 10 + index }),
    );
    const decision = applyConsumerBudget([feed, conference, ...extras, talk], {
      talkTargetKey: 'user-7',
    });
    expect(decision.resume[0]?.producerId).toBe('talk');
    expect(decision.pause.map((item) => item.producerId)).toContain('feed');
  });
});
