// Derived from talktome public/client.js resolveReplyTargetFromIncomingEntry @ bbb8e09
// and talktome-apple AppSession.resolveIncomingReplyTarget @ 004d6e76 by Daniel Jocher.

import type { IncomingTalkEntry, IncomingTalkState, PeerSession, TalkTarget } from '../protocol';

export function incomingHighlightsTarget(entry: IncomingTalkEntry, target: TalkTarget): boolean {
  if (entry.targetType === 'conference' && target.type === 'conference') {
    return Number(entry.targetId) === Number(target.id);
  }
  if (target.type === 'user') {
    return (
      Number(entry.fromUserId) === Number(target.id) ||
      (entry.replyTargetType === 'user' && Number(entry.replyTargetId) === Number(target.id))
    );
  }
  if (target.type === 'guest') {
    return entry.fromGuestId === String(target.id) || String(entry.targetId) === String(target.id);
  }
  return entry.targetType === target.type && String(entry.targetId) === String(target.id);
}

export function resolveReplyTalkTarget(input: {
  incoming: IncomingTalkState;
  targets: TalkTarget[];
  peers: PeerSession[];
  lastSpoken?: TalkTarget | null;
  lastReply?: TalkTarget | null;
}): TalkTarget | null {
  const fromIncoming =
    talkTargetFromIncomingEntry(input.incoming.replyTarget, input.targets, input.peers) ??
    talkTargetFromIncomingEntry(latestAddressed(input.incoming), input.targets, input.peers);
  return fromIncoming ?? input.lastReply ?? input.lastSpoken ?? null;
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
