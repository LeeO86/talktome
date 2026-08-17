// Derived from talktome-apple OperatorView.targetLayerSize @ 004d6e76 by Daniel Jocher.
// Phone portrait pages 8 targets; landscape 6.

export function targetLayerSize(width: number, height: number): number {
  return width > height ? 6 : 8;
}

export function targetLayerCount(total: number, width: number, height: number): number {
  const size = targetLayerSize(width, height);
  if (total <= size) {
    return 1;
  }
  return Math.max(1, Math.ceil(total / size));
}

export function visibleTargets<T>(items: T[], layerIndex: number, width: number, height: number): T[] {
  const size = targetLayerSize(width, height);
  if (items.length <= size) {
    return items;
  }
  const count = targetLayerCount(items.length, width, height);
  const index = Math.min(Math.max(layerIndex, 0), count - 1);
  const start = index * size;
  return items.slice(start, start + size);
}
