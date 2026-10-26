import { talkTargetIdentity, type TalkTarget } from '../protocol';
import type { BleTargetSelection } from '../ble/target';

export function nextTalkableTarget(
  candidates: readonly TalkTarget[],
  current: TalkTarget | null | undefined,
  delta: number,
): TalkTarget | null {
  if (candidates.length === 0) {
    return null;
  }
  const currentKey = current ? talkTargetIdentity(current) : null;
  const index = currentKey
    ? candidates.findIndex((item) => talkTargetIdentity(item) === currentKey)
    : -1;
  const from = index < 0 ? (delta >= 0 ? -1 : 0) : index;
  const nextIndex = (from + delta + candidates.length * 8) % candidates.length;
  return candidates[nextIndex] ?? null;
}

/** Fixed-position knobs are 1-based in the Zello extra. 0 maps to the first card. */
export function talkableAtKnob(
  candidates: readonly TalkTarget[],
  position: number,
): TalkTarget | null {
  if (candidates.length === 0 || !Number.isFinite(position)) {
    return null;
  }
  const index = position <= 0 ? 0 : Math.min(Math.round(position) - 1, candidates.length - 1);
  return candidates[index] ?? null;
}

export function selectionFromTalkTarget(target: TalkTarget): BleTargetSelection {
  return {
    kind: 'target',
    type: target.type,
    id: target.id,
    label: target.label,
  };
}
