import { firstTalkableTarget, talkTargetIdentity, type TalkTarget } from '../protocol';

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

function talkableInProduction(target: TalkTarget | null | undefined, targets: TalkTarget[]): TalkTarget | null {
  if (!target) {
    return null;
  }
  const key = talkTargetIdentity(target);
  return (
    targets.find(
      (item) => talkTargetIdentity(item) === key && item.canTalk && item.type !== 'feed',
    ) ?? null
  );
}

/** Reply in this production, else the first talkable card (same idea as the on-screen Reply control). */
export function resolveBleReplyFallback(input: {
  replyTarget: TalkTarget | null;
  targets: TalkTarget[];
}): TalkTarget | null {
  return talkableInProduction(input.replyTarget, input.targets) ?? firstTalkableTarget(input.targets);
}

export function resolveBleTalkTarget(input: {
  selection: BleTargetSelection;
  replyTarget: TalkTarget | null;
  targets: TalkTarget[];
}): TalkTarget | null {
  const reply = resolveBleReplyFallback(input);
  if (input.selection.kind === 'reply') {
    return reply;
  }

  const live = talkableInProduction(
    {
      type: input.selection.type,
      id: input.selection.id,
      label: input.selection.label,
      canTalk: true,
    },
    input.targets,
  );
  return live ?? reply;
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
