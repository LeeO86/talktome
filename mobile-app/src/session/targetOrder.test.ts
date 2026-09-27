import { describe, expect, it } from 'vitest';

import { moveTargetOrder, targetOrderPayload } from './targetOrder';

describe('target order', () => {
  it('moves an item and refuses an edge that would drop one', () => {
    expect(moveTargetOrder(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveTargetOrder(['a', 'b'], 0, -1)).toBeNull();
    expect(moveTargetOrder(['a', 'b'], 1, 1)).toBeNull();
  });

  it('sends the complete list the server expects', () => {
    expect(
      targetOrderPayload([
        { type: 'user', id: 9, label: 'Pat', canTalk: true },
        { type: 'conference', id: 2, label: 'Stage', canTalk: false },
      ]),
    ).toEqual([
      { targetType: 'user', targetId: 9 },
      { targetType: 'conference', targetId: 2 },
    ]);
  });
});