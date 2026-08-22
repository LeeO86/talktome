export function volumeFromTouch(pageX: number, originX: number, width: number): number {
  if (!(width > 0)) {
    return 0;
  }
  return Math.min(1, Math.max(0, (pageX - originX) / width));
}
