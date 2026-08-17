import { talkTargetIdentity, type TalkTarget } from '../protocol';

export type BleTargetSelection =
  | { kind: 'reply' }
  | { kind: 'target'; type: TalkTarget['type']; id: TalkTarget['id']; label: string };

export const DEFAULT_BLE_TARGET: BleTargetSelection = { kind: 'reply' };

export function bleTargetSelectionKey(selection: BleTargetSelection): string {
  return selection.kind === 'reply' ? 'reply' : talkTargetIdentity(selection);
}

export function bleTalkCandidates(targets: TalkTarget[]): TalkTarget[] {
  return targets.filter((target) => target.canTalk && target.type !== 'feed');
}

export function resolveBleTalkTarget(input: {
  selection: BleTargetSelection;
  replyTarget: TalkTarget | null;
  targets: TalkTarget[];
}): TalkTarget | null {
  if (input.selection.kind === 'reply') {
    return input.replyTarget;
  }

  const key = talkTargetIdentity(input.selection);
  return (
    input.targets.find((target) => talkTargetIdentity(target) === key) ?? {
      type: input.selection.type,
      id: input.selection.id,
      label: input.selection.label,
      canTalk: true,
    }
  );
}

export function describeBleTarget(selection: BleTargetSelection): string {
  return selection.kind === 'reply' ? 'Reply' : selection.label;
}

export function parseBleTargetSelection(value: unknown): BleTargetSelection {
  if (!value || typeof value !== 'object') {
    return DEFAULT_BLE_TARGET;
  }
  const record = value as Record<string, unknown>;
  if (record.kind === 'target' && typeof record.type === 'string' && record.id != null && typeof record.label === 'string') {
    return {
      kind: 'target',
      type: record.type as TalkTarget['type'],
      id: record.id as TalkTarget['id'],
      label: record.label,
    };
  }
  return DEFAULT_BLE_TARGET;
}
