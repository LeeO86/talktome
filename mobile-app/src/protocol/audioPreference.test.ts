import { describe, expect, it } from 'vitest';

import {
  DEFAULT_AUDIO_PREFERENCE,
  clampVolume,
  defaultAudioPreference,
  playbackGain,
  normalizeAudioPreference,
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
});
