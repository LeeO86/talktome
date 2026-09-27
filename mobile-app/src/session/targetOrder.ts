import type { TalkTarget } from '../protocol';

export type TargetOrderItem = {
  targetType: string;
  targetId: number;
};

export function moveTargetOrder<T>(items: readonly T[], from: number, to: number): T[] | null {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return null;
  }
  const next = items.slice();
  const [item] = next.splice(from, 1);
  if (item === undefined) {
    return null;
  }
  next.splice(to, 0, item);
  return next;
}

export function targetOrderPayload(targets: readonly TalkTarget[]): TargetOrderItem[] {
  return targets.map((target) => ({
    targetType: target.type,
    targetId: Number(target.id),
  }));
}
