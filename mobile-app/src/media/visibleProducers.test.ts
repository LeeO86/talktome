import { describe, expect, it } from 'vitest';

import { parseActiveProducer } from '../protocol/producers';
import { filterProducersToVisibleTargets, producerMatchesVisibleTargets } from './visibleProducers';

const conference = { type: 'conference' as const, id: 2, label: 'All', canTalk: true };
const feed = { type: 'feed' as const, id: 8, label: 'PGM', canTalk: false };

describe('visible production audio', () => {
  it('keeps feeds and conferences that are on the current grid', () => {
    const producer = parseActiveProducer({
      peerId: 'a',
      producerId: 'p1',
      appData: { type: 'conference', id: 2 },
    })!;
    expect(producerMatchesVisibleTargets(producer, [conference])).toBe(true);
    expect(producerMatchesVisibleTargets(producer, [feed])).toBe(false);
  });

  it('drops a feed that belongs to another production', () => {
    const producer = parseActiveProducer({
      peerId: 'feed',
      producerId: 'p2',
      appData: { type: 'feed', id: 99 },
    })!;
    expect(filterProducersToVisibleTargets([producer], [feed, conference])).toEqual([]);
  });

  it('always keeps direct talk the server already addressed to this operator', () => {
    const producer = parseActiveProducer({
      peerId: 'peer',
      producerId: 'p3',
      speakerUserId: 9,
      appData: { type: 'user', id: 4, targetPeer: 'me' },
    })!;
    expect(producerMatchesVisibleTargets(producer, [])).toBe(true);
  });

  it('keeps guest talk even when the grid is empty', () => {
    const producer = parseActiveProducer({
      peerId: 'guest',
      producerId: 'p4',
      appData: { type: 'guest', id: 'g-1' },
    })!;
    expect(producerMatchesVisibleTargets(producer, [])).toBe(true);
  });
});
