import { describe, expect, it } from 'vitest';

import { activeFeedKeysFromProducers } from './producers';

describe('activeFeedKeysFromProducers', () => {
  it('lists feed routes that currently have a sender', () => {
    expect(
      activeFeedKeysFromProducers([
        {
          peerId: 'a',
          producerId: '1',
          appData: {},
          route: { kind: 'feed', id: 3 },
        },
        {
          peerId: 'b',
          producerId: '2',
          appData: {},
          route: { kind: 'conference', id: 2 },
        },
        {
          peerId: 'c',
          producerId: '3',
          appData: {},
          route: { kind: 'feed', id: 3 },
        },
      ]),
    ).toEqual(['feed-3']);
  });
});
