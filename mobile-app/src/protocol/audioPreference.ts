// Derived from talktome-apple TargetAudioPreference @ 004d6e76 by Daniel Jocher.

export const DEFAULT_TARGET_VOLUME = 0.9;

export type TargetAudioPreference = {
  volume: number;
  muted: boolean;
};

/** Stable default for Zustand selectors — never allocate a fresh object in getSnapshot. */
export const DEFAULT_AUDIO_PREFERENCE: TargetAudioPreference = {
  volume: DEFAULT_TARGET_VOLUME,
  muted: false,
};

export function defaultAudioPreference(): TargetAudioPreference {
  return DEFAULT_AUDIO_PREFERENCE;
}

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_TARGET_VOLUME;
  }
  return Math.min(1, Math.max(0, value));
}

export function normalizeAudioPreference(
  value?: Partial<TargetAudioPreference> | null,
): TargetAudioPreference {
  return {
    volume: clampVolume(value?.volume ?? DEFAULT_TARGET_VOLUME),
    muted: Boolean(value?.muted),
  };
}

export function playbackGain(preference: TargetAudioPreference): number {
  return preference.muted ? 0 : clampVolume(preference.volume);
}
