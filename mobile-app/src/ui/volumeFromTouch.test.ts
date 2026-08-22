import { describe, expect, it } from 'vitest';

import { volumeFromTouch } from './volumeFromTouch';

describe('volumeFromTouch', () => {
  it('maps pageX across the track to 0..1', () => {
    expect(volumeFromTouch(40, 40, 80)).toBe(0);
    expect(volumeFromTouch(80, 40, 80)).toBe(0.5);
    expect(volumeFromTouch(120, 40, 80)).toBe(1);
  });

  it('clamps past the ends', () => {
    expect(volumeFromTouch(10, 40, 80)).toBe(0);
    expect(volumeFromTouch(200, 40, 80)).toBe(1);
  });
});
