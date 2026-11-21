import { describe, expect, it } from 'vitest';

import { parseBleTargetSelection } from './target';

describe('BLE preference parsing', () => {
  it('treats missing or invalid stored targets as Reply', () => {
    expect(parseBleTargetSelection(undefined)).toEqual({ kind: 'reply' });
    expect(parseBleTargetSelection({ kind: 'target' })).toEqual({ kind: 'reply' });
    expect(
      parseBleTargetSelection({ kind: 'target', type: 'conference', id: 4, label: 'All' }),
    ).toEqual({ kind: 'target', type: 'conference', id: 4, label: 'All' });
  });
});
