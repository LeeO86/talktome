export function volumeFromTouch(pageX: number, originX: number, width: number, pad = 0): number {
  const inner = width - pad * 2;
  if (!(inner > 0)) {
    return 0;
  }
  return Math.min(1, Math.max(0, (pageX - originX - pad) / inner));
}

/** Pixel offset of the thumb’s left edge so 0 dB stays inside the hit target. */
export function volumeThumbLeft(value: number, trackWidth: number, thumbSize: number): number {
  const inner = Math.max(0, trackWidth - thumbSize);
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * inner;
}
