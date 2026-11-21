import { describe, expect, it } from 'vitest';

import { volumeFromTouch, volumeThumbLeft } from './volumeFromTouch';

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

  it('keeps 0 dB inside the padded hit target', () => {
    expect(volumeFromTouch(40, 40, 80, 12)).toBe(0);
    expect(volumeFromTouch(52, 40, 80, 12)).toBe(0);
    expect(volumeFromTouch(108, 40, 80, 12)).toBe(1);
    expect(volumeFromTouch(120, 40, 80, 12)).toBe(1);
  });
});

describe('volumeThumbLeft', () => {
  it('keeps the thumb fully on the track at 0 dB', () => {
    expect(volumeThumbLeft(0, 88, 24)).toBe(0);
    expect(volumeThumbLeft(1, 88, 24)).toBe(64);
    expect(volumeThumbLeft(1, 88, 24) + 24).toBe(88);
  });
});
