// Derived from talktome public/client.js applyIncomingTalkState / lastTarget
// and resolveReplyTargetFromIncomingEntry @ current public/client.js by Daniel Jocher.
// Web never writes lastTarget from talking; only incoming-talk-state (plus a client fallback).

import {
  talkTargetIdentity,
  type IncomingTalkEntry,
  type IncomingTalkState,
  type PeerSession,
  type TalkTarget,
} from '../protocol';

/** Web speakingPeers key: speaker for 1:1, conference card for conference talk. */
export function incomingSpeakingIdentity(entry: IncomingTalkEntry): string | null {
  if (entry.targetType === 'conference') {
    return `conference-${entry.targetId}`;
  }
  if (entry.targetType === 'feed') {
    return `feed-${entry.targetId}`;
  }
  if (entry.targetType === 'guest') {
    return `guest-${entry.targetId}`;
  }
  if (entry.targetType === 'user') {
    const speakerId = entry.fromUserId ?? entry.targetId;
    if (speakerId === undefined || speakerId === '') {
      return null;
    }
    return `user-${speakerId}`;
  }
  return null;
}

export function incomingHighlightsTarget(entry: IncomingTalkEntry, target: TalkTarget): boolean {
  const identity = incomingSpeakingIdentity(entry);
  return identity != null && identity === talkTargetIdentity(target);
}

export function resolveReplyTalkTarget(input: {
  incoming: IncomingTalkState;
  targets: TalkTarget[];
  peers: PeerSession[];
  lastReply?: TalkTarget | null;
  fallback?: TalkTarget | null;
}): TalkTarget | null {
  const fromIncoming =
    talkTargetFromIncomingEntry(input.incoming.replyTarget, input.targets, input.peers) ??
    talkTargetFromIncomingEntry(latestAddressed(input.incoming), input.targets, input.peers);
  return fromIncoming ?? rematchTalkTarget(input.lastReply, input.targets) ?? input.fallback ?? null;
}

/** Web `lastTarget` stays sticky; refresh it against the current target list for labels only. */
export function rematchTalkTarget(target: TalkTarget | null | undefined, targets: TalkTarget[]): TalkTarget | null {
  if (!target) {
    return null;
  }
  return targets.find((item) => talkTargetIdentity(item) === talkTargetIdentity(target)) ?? target;
}

function latestAddressed(incoming: IncomingTalkState): IncomingTalkEntry | undefined {
  return incoming.addressedNow
    .slice()
    .sort((left, right) => (right.at ?? 0) - (left.at ?? 0))[0];
}

function talkTargetFromIncomingEntry(
  entry: IncomingTalkEntry | undefined,
  targets: TalkTarget[],
  peers: PeerSession[],
): TalkTarget | null {
  if (!entry) {
    return null;
  }

  const explicitType = entry.replyTargetType ?? (entry.targetType === 'feed' ? undefined : entry.targetType);
  const explicitId = entry.replyTargetId ?? entry.targetId;
  if (!explicitType || explicitId === undefined || explicitId === '') {
    return null;
  }

  const match = targets.find(
    (target) => target.type === explicitType && String(target.id) === String(explicitId),
  );
  if (match) {
    return match;
  }

  if (explicitType === 'user') {
    const userId = Number(explicitId);
    if (!Number.isFinite(userId)) {
      return null;
    }
    const peer = peers.find((item) => item.kind === 'user' && item.userId === userId);
    return {
      type: 'user',
      id: userId,
      label: peer?.name ?? entry.fromName ?? `User ${userId}`,
      canTalk: true,
    };
  }

  if (explicitType === 'conference') {
    const conferenceId = Number(explicitId);
    if (!Number.isFinite(conferenceId)) {
      return null;
    }
    return {
      type: 'conference',
      id: conferenceId,
      label: entry.fromName ?? `Conference ${conferenceId}`,
      canTalk: true,
    };
  }

  if (explicitType === 'guest') {
    return {
      type: 'guest',
      id: String(explicitId),
      label: entry.fromName ?? 'Guest',
      canTalk: true,
    };
  }

  return null;
}
