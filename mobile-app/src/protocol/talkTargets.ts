// Derived from talktome public/client.js normalizePttTarget @ bbb8e09
// and talktome-apple OutgoingTalkRequest @ 004d6e76 by Daniel Jocher.

import type { SignalingTalkTarget, TalkTarget } from './types';

export function normalizeTalkTargets(targets: TalkTarget[]): SignalingTalkTarget[] {
  const normalized: SignalingTalkTarget[] = [];
  const seen = new Set<string>();

  for (const target of targets) {
    if (target.type === 'feed') {
      continue;
    }
    const item: SignalingTalkTarget = {
      type: target.type === 'guest' ? 'guest' : target.type === 'conference' ? 'conference' : 'user',
      id: target.id,
    };
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(item);
  }

  return normalized;
}

export function firstTalkableTarget(targets: TalkTarget[]): TalkTarget | null {
  return targets.find((target) => target.canTalk && target.type !== 'feed') ?? null;
}
