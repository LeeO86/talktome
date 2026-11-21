// Web client main-button target (public/client.js, TalkToMe 1.5.9).
// An empty choice is Reply. A stored identity always talks to that target.
// Cards keep their own talk buttons either way.

import { talkTargetIdentity, type TalkTarget } from '../protocol';

export function mainButtonStorageKey(
  profileId: string | null | undefined,
  productionId: number | null | undefined,
): string {
  return `${profileId || 'device'}:${productionId ?? 'default'}`;
}

/** Users and talkable conferences. Feeds and listen-only conferences are not main-button targets. */
export function mainButtonCandidates(
  targets: TalkTarget[],
  selfUserId?: number | string | null,
): TalkTarget[] {
  const self = Number(selfUserId);
  return targets.filter((target) => {
    if (target.type === 'user') {
      return !(Number.isFinite(self) && Number(target.id) === self);
    }
    return target.type === 'conference' && target.canTalk;
  });
}

export type ResolvedMainButton = {
  mode: 'reply' | 'target';
  target: TalkTarget | null;
  unavailable: boolean;
  label: string;
  accessibilityLabel: string;
};

export function resolveMainButton(input: {
  storedIdentity: string | undefined;
  targets: TalkTarget[];
  replyTarget: TalkTarget | null;
  canTalk?: (target: TalkTarget) => boolean;
}): ResolvedMainButton {
  const identity = input.storedIdentity?.trim() ?? '';
  if (!identity) {
    const reply = input.replyTarget;
    const blocked = Boolean(reply && input.canTalk && !input.canTalk(reply));
    return {
      mode: 'reply',
      target: blocked ? null : reply,
      unavailable: blocked,
      label: reply ? `Reply (${reply.label})` : 'Reply',
      accessibilityLabel: reply ? `Reply to ${reply.label}` : 'Reply',
    };
  }

  const match = input.targets.find((target) => talkTargetIdentity(target) === identity) ?? null;
  if (!match) {
    return {
      mode: 'target',
      target: null,
      unavailable: true,
      label: 'Unavailable target',
      accessibilityLabel: 'Unavailable target',
    };
  }
  if (input.canTalk && !input.canTalk(match)) {
    return {
      mode: 'target',
      target: null,
      unavailable: true,
      label: match.label,
      accessibilityLabel: `${match.label} is unavailable`,
    };
  }
  return {
    mode: 'target',
    target: match,
    unavailable: false,
    label: match.label,
    accessibilityLabel: `Talk to ${match.label}`,
  };
}
