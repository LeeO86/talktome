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

export const MIN_VOLUME_DB = -75;
export const MAX_VOLUME_DB = 0;

export const VOLUME_DB_GRID: number[] = buildVolumeDbGrid();

function buildVolumeDbGrid(): number[] {
  const grid: number[] = [];
  for (let db = 0; db >= -15 - 1e-9; db -= 1.5) {
    grid.push(Number(db.toFixed(1)));
  }
  for (let db = -18; db >= -45 - 1e-9; db -= 3) {
    grid.push(db);
  }
  for (let db = -51; db >= MIN_VOLUME_DB - 1e-9; db -= 6) {
    grid.push(db);
  }
  return grid;
}

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_TARGET_VOLUME;
  }
  return Math.min(1, Math.max(0, value));
}

export function linearToDb(level: number): number | null {
  const linear = clampVolume(level);
  if (linear <= 0) {
    return null;
  }
  return 20 * Math.log10(linear);
}

export function dbToLinear(db: number): number {
  if (!Number.isFinite(db)) {
    return DEFAULT_TARGET_VOLUME;
  }
  if (db >= MAX_VOLUME_DB) {
    return 1;
  }
  if (db <= MIN_VOLUME_DB) {
    return clampVolume(10 ** (MIN_VOLUME_DB / 20));
  }
  return clampVolume(10 ** (db / 20));
}

/** Move one step on the 1.5 / 3 / 6 dB intercom grid. Plus never exceeds 0 dB. */
export function nudgeVolume(level: number, direction: 1 | -1): number {
  const grid = VOLUME_DB_GRID;
  const floor = grid[grid.length - 1]!;
  const db = linearToDb(level);
  if (db == null) {
    return direction > 0 ? dbToLinear(floor) : dbToLinear(floor);
  }
  if (direction > 0) {
    const louder = grid.filter((point) => point > db + 1e-6);
    return dbToLinear(louder.length > 0 ? louder[louder.length - 1]! : MAX_VOLUME_DB);
  }
  const quieter = grid.filter((point) => point < db - 1e-6);
  return dbToLinear(quieter.length > 0 ? quieter[0]! : floor);
}

/** 0..1 fill for a rotary meter: linear in dB, so logarithmic in amplitude. */
export function volumeMeterFill(level: number): number {
  const db = linearToDb(level);
  if (db == null) {
    return 0;
  }
  return Math.min(1, Math.max(0, (db - MIN_VOLUME_DB) / (MAX_VOLUME_DB - MIN_VOLUME_DB)));
}

/** Inverse of volumeMeterFill — slider position 0..1 to linear amplitude. */
export function volumeFromMeterFill(fill: number): number {
  const t = Math.min(1, Math.max(0, fill));
  if (t <= 0) {
    return dbToLinear(MIN_VOLUME_DB);
  }
  return dbToLinear(MIN_VOLUME_DB + t * (MAX_VOLUME_DB - MIN_VOLUME_DB));
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
