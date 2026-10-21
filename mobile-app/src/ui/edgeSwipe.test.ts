import { describe, expect, it } from 'vitest';

import { edgeSwipeFinishDuration, shouldCompleteEdgeSwipe, shouldStartEdgeSwipe } from './edgeSwipe';

describe('shouldStartEdgeSwipe', () => {
  it('starts on a short rightward move', () => {
    expect(shouldStartEdgeSwipe(6, 2)).toBe(true);
    expect(shouldStartEdgeSwipe(12, -12)).toBe(true);
  });

  it('waits out finger jitter', () => {
    expect(shouldStartEdgeSwipe(3, 0)).toBe(false);
  });

  it('ignores mostly vertical and leftward moves', () => {
    expect(shouldStartEdgeSwipe(10, 20)).toBe(false);
    expect(shouldStartEdgeSwipe(-20, 0)).toBe(false);
  });
});

describe('shouldCompleteEdgeSwipe', () => {
  it('goes back past halfway', () => {
    expect(shouldCompleteEdgeSwipe(201, 0, 400)).toBe(true);
    expect(shouldCompleteEdgeSwipe(199, 0, 400)).toBe(false);
  });

  it('goes back on a rightward flick before halfway', () => {
    expect(shouldCompleteEdgeSwipe(60, 0.6, 400)).toBe(true);
  });

  it('cancels on a leftward flick even past halfway', () => {
    expect(shouldCompleteEdgeSwipe(300, -0.4, 400)).toBe(false);
  });
});

describe('edgeSwipeFinishDuration', () => {
  it('keeps the slide between 120 and 300 ms', () => {
    expect(edgeSwipeFinishDuration(0, 0, 400)).toBe(300);
    expect(edgeSwipeFinishDuration(390, 0, 400)).toBe(120);
    expect(edgeSwipeFinishDuration(100, 2, 400)).toBe(150);
  });
});
