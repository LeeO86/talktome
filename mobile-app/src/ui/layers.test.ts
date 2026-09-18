import { describe, expect, it } from 'vitest';

import {
  CARD_MAX_HEIGHT,
  CARD_MIN_HEIGHT,
  CARD_PREFERRED_HEIGHT,
  chunkTargets,
  operatorLayout,
  shouldOfferHeaderCollapse,
  targetLayerCount,
  targetLayerSize,
  visibleTargets,
} from './layers';

describe('target layers', () => {
  it('fits 8 portrait rows on an iPhone-sized screen', () => {
    const layout = operatorLayout({ width: 390, height: 844 });
    expect(layout.columns).toBe(1);
    expect(layout.rows).toBe(8);
    expect(layout.layerSize).toBe(8);
    expect(layout.cardHeight).toBeGreaterThanOrEqual(CARD_MIN_HEIGHT);
    expect(layout.cardHeight).toBeLessThanOrEqual(CARD_MAX_HEIGHT);
    expect(targetLayerCount(9, 390, 844)).toBe(2);
    expect(visibleTargets(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], 1, 390, 844)).toEqual(['i']);
  });

  it('uses two landscape columns and a narrower row cap', () => {
    const layout = operatorLayout({ width: 844, height: 390 });
    expect(layout.landscape).toBe(true);
    expect(layout.columns).toBe(2);
    expect(layout.rows).toBe(4);
    expect(layout.layerSize).toBe(8);
    expect(targetLayerCount(9, 844, 390)).toBe(2);
  });

  it('pages sooner on a short screen instead of scrolling', () => {
    const layout = operatorLayout({ width: 320, height: 534 });
    expect(layout.rows).toBeLessThan(8);
    expect(layout.layerSize).toBe(layout.rows);
    expect(targetLayerCount(8, 320, 534)).toBeGreaterThan(1);
  });

  it('fits more rows when the measured list is taller', () => {
    const cramped = operatorLayout({ width: 320, height: 534, availableHeight: 248 });
    const roomy = operatorLayout({ width: 320, height: 534, availableHeight: 390 });
    expect(cramped.rows).toBeLessThanOrEqual(4);
    expect(roomy.rows).toBeGreaterThan(cramped.rows);
  });

  it('compresses cards slightly in a realistic iPhone list height', () => {
    const layout = operatorLayout({ width: 390, height: 844, availableHeight: 575 });
    expect(layout.rows).toBe(8);
    expect(layout.cardHeight).toBeGreaterThanOrEqual(64);
    expect(layout.cardHeight).toBeLessThanOrEqual(CARD_PREFERRED_HEIGHT);
  });

  it('clamps card height so leftover space can sit above the list', () => {
    const layout = operatorLayout({ width: 390, height: 844, availableHeight: 800 });
    expect(layout.rows).toBe(8);
    expect(layout.cardHeight).toBe(CARD_MAX_HEIGHT);
  });

  it('hides paging when everything fits', () => {
    expect(targetLayerCount(7, 390, 844)).toBe(1);
    expect(visibleTargets([1, 2, 3], 0, 390, 844)).toEqual([1, 2, 3]);
  });

  it('chunks a page into landscape columns', () => {
    expect(chunkTargets(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
  });

  it('offers header collapse on small pages or when hiding chrome adds a row', () => {
    expect(
      shouldOfferHeaderCollapse({ rows: 4, availableHeight: 248, headerHeight: 96, maxRows: 8 }),
    ).toBe(true);
    expect(
      shouldOfferHeaderCollapse({ rows: 5, availableHeight: 326, headerHeight: 96, maxRows: 8 }),
    ).toBe(true);
    expect(
      shouldOfferHeaderCollapse({ rows: 8, availableHeight: 636, headerHeight: 96, maxRows: 8 }),
    ).toBe(false);
  });

  it('keeps the iPhone portrait layer size helper at 8', () => {
    expect(targetLayerSize(390, 844)).toBe(8);
  });
});
