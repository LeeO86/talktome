import { describe, expect, it } from 'vitest';

import { targetLayerCount, targetLayerSize, visibleTargets } from './layers';

describe('target layers', () => {
  it('uses 8 rows on a phone in portrait', () => {
    expect(targetLayerSize(390, 844)).toBe(8);
    expect(targetLayerCount(9, 390, 844)).toBe(2);
    expect(visibleTargets(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], 1, 390, 844)).toEqual(['i']);
  });

  it('uses 6 rows on a phone in landscape', () => {
    expect(targetLayerSize(844, 390)).toBe(6);
    expect(targetLayerCount(7, 844, 390)).toBe(2);
  });

  it('hides paging when everything fits', () => {
    expect(targetLayerCount(7, 390, 844)).toBe(1);
    expect(visibleTargets([1, 2, 3], 0, 390, 844)).toEqual([1, 2, 3]);
  });
});
