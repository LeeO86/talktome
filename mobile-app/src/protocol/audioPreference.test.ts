import { describe, expect, it } from 'vitest';

import {
  DEFAULT_AUDIO_PREFERENCE,
  clampVolume,
  defaultAudioPreference,
  dbToLinear,
  linearToDb,
  nudgeVolume,
  playbackGain,
  normalizeAudioPreference,
  volumeMeterFill,
} from './audioPreference';

describe('audioPreference', () => {
  it('clamps volume to 0..1', () => {
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(1.4)).toBe(1);
    expect(clampVolume(0.4)).toBe(0.4);
  });

  it('mutes playback gain', () => {
    expect(playbackGain({ volume: 0.8, muted: true })).toBe(0);
    expect(playbackGain({ volume: 0.8, muted: false })).toBe(0.8);
  });

  it('fills defaults', () => {
    expect(normalizeAudioPreference(undefined)).toEqual({ volume: 0.9, muted: false });
  });

  it('reuses one default object so Zustand getSnapshot stays stable', () => {
    expect(defaultAudioPreference()).toBe(DEFAULT_AUDIO_PREFERENCE);
    expect(DEFAULT_AUDIO_PREFERENCE).toEqual({ volume: 0.9, muted: false });
  });

  it('nudges volume on a 1.5 / 3 / 6 dB grid', () => {
    expect(linearToDb(1)).toBeCloseTo(0, 5);
    expect(nudgeVolume(1, 1)).toBe(1);
    expect(linearToDb(nudgeVolume(1, -1))).toBeCloseTo(-1.5, 5);
    expect(linearToDb(nudgeVolume(dbToLinear(-15), -1))).toBeCloseTo(-18, 5);
    expect(linearToDb(nudgeVolume(dbToLinear(-45), -1))).toBeCloseTo(-51, 5);
    expect(linearToDb(nudgeVolume(dbToLinear(-18), 1))).toBeCloseTo(-15, 5);
    expect(linearToDb(nudgeVolume(0.9, 1))).toBeCloseTo(0, 5);
    expect(dbToLinear(0)).toBe(1);
  });

  it('fills the volume meter on a dB scale', () => {
    expect(volumeMeterFill(1)).toBeCloseTo(1, 5);
    expect(volumeMeterFill(0)).toBe(0);
    expect(volumeMeterFill(dbToLinear(-37.5))).toBeCloseTo(0.5, 5);
  });
});
