import { describe, expect, it } from 'vitest';

import {
  DEFAULT_AUDIO_PREFERENCE,
  MIN_VOLUME_DB,
  VOLUME_DB_GRID,
  VOLUME_SILENCE_FILL,
  clampVolume,
  defaultAudioPreference,
  dbToLinear,
  linearToDb,
  nudgeVolume,
  playbackGain,
  normalizeAudioPreference,
  volumeMeterFill,
  volumeFromMeterFill,
} from './audioPreference';

describe('audioPreference', () => {
  it('clamps volume to 0..1', () => {
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(1.4)).toBe(1);
    expect(clampVolume(0.4)).toBe(0.4);
  });

  it('snaps inaudible levels below -42 dB to silence', () => {
    expect(clampVolume(dbToLinear(-75))).toBe(0);
    expect(dbToLinear(-75)).toBe(0);
    expect(dbToLinear(-42.1)).toBe(0);
    expect(linearToDb(dbToLinear(MIN_VOLUME_DB))).toBeCloseTo(MIN_VOLUME_DB, 5);
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

  it('nudges volume on a 1.5 / 3 dB grid that jumps from -42 to -inf', () => {
    expect(linearToDb(1)).toBeCloseTo(0, 5);
    expect(nudgeVolume(1, 1)).toBe(1);
    expect(linearToDb(nudgeVolume(1, -1))).toBeCloseTo(-1.5, 5);
    expect(linearToDb(nudgeVolume(dbToLinear(-15), -1))).toBeCloseTo(-18, 5);
    expect(nudgeVolume(dbToLinear(-42), -1)).toBe(0);
    expect(linearToDb(nudgeVolume(0, 1))).toBeCloseTo(-42, 5);
    expect(nudgeVolume(0, -1)).toBe(0);
    expect(linearToDb(nudgeVolume(dbToLinear(-18), 1))).toBeCloseTo(-15, 5);
    expect(linearToDb(nudgeVolume(0.9, 1))).toBeCloseTo(0, 5);
    expect(dbToLinear(0)).toBe(1);
    expect(VOLUME_DB_GRID[VOLUME_DB_GRID.length - 1]).toBe(-42);
    expect(VOLUME_DB_GRID).not.toContain(-45);
    expect(VOLUME_DB_GRID).not.toContain(-75);
  });

  it('fills the volume meter with -inf at 0 and -42 dB on the first tick', () => {
    expect(volumeMeterFill(1)).toBeCloseTo(1, 5);
    expect(volumeMeterFill(0)).toBe(0);
    expect(volumeMeterFill(dbToLinear(-42))).toBeCloseTo(VOLUME_SILENCE_FILL, 5);
    expect(volumeMeterFill(dbToLinear(-21))).toBeCloseTo(
      VOLUME_SILENCE_FILL + (1 - VOLUME_SILENCE_FILL) * 0.5,
      5,
    );
  });

  it('converts slider position back from the dB meter scale', () => {
    expect(linearToDb(volumeFromMeterFill(1))).toBeCloseTo(0, 5);
    expect(volumeFromMeterFill(0)).toBe(0);
    expect(linearToDb(volumeFromMeterFill(VOLUME_SILENCE_FILL))).toBeCloseTo(-42, 5);
    expect(volumeFromMeterFill(VOLUME_SILENCE_FILL / 2)).toBe(0);
    expect(volumeMeterFill(volumeFromMeterFill(0.25))).toBeCloseTo(0.25, 5);
    expect(volumeMeterFill(volumeFromMeterFill(0.5))).toBeCloseTo(0.5, 5);
  });
});
