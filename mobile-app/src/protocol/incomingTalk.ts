// Derived from talktome-apple SignalingClient.parseIncomingTalkState @ 004d6e76
// and talktome public/client.js normalizeIncomingTalkState @ bbb8e09 by Daniel Jocher.

import type { IncomingTalkEntry, IncomingTalkState, TalkTargetType } from './types';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

const TARGET_TYPES = new Set<TalkTargetType>(['user', 'conference', 'feed', 'guest']);
const REPLY_TYPES = new Set(['user', 'conference', 'guest']);

export function unwrapIncomingTalkPayload(payload: unknown): Record<string, unknown> | null {
  const item = asRecord(payload);
  if (!item) {
    return null;
  }
  const nested = asRecord(item.state);
  if (nested && (nested.addressedNow !== undefined || nested.replyTarget !== undefined)) {
    return nested;
  }
  return item;
}

export function parseIncomingTalkEntry(payload: unknown): IncomingTalkEntry | null {
  const item = asRecord(payload);
  if (!item) {
    return null;
  }

  const targetType = typeof item.targetType === 'string' ? item.targetType.trim().toLowerCase() : '';
  if (!TARGET_TYPES.has(targetType as TalkTargetType)) {
    return null;
  }

  const numericTargetId = asNumber(item.targetId);
  const targetId =
    targetType === 'guest'
      ? String(item.targetId ?? '').trim()
      : numericTargetId !== undefined
        ? numericTargetId
        : undefined;
  if (targetId === undefined || targetId === '') {
    return null;
  }

  const replyTargetType =
    typeof item.replyTargetType === 'string' ? item.replyTargetType.trim().toLowerCase() : '';

  return {
    fromUserId: asNumber(item.fromUserId),
    fromGuestId: item.fromGuestId ? String(item.fromGuestId) : undefined,
    fromName: typeof item.fromName === 'string' ? item.fromName : undefined,
    targetType: targetType as TalkTargetType,
    targetId,
    replyTargetType: REPLY_TYPES.has(replyTargetType)
      ? (replyTargetType as IncomingTalkEntry['replyTargetType'])
      : undefined,
    replyTargetId: item.replyTargetId as IncomingTalkEntry['replyTargetId'],
    at: asNumber(item.at),
  };
}

export function latestAddressedSpeaker(incoming: IncomingTalkState): string | null {
  const latest = incoming.addressedNow
    .slice()
    .sort((left, right) => (right.at ?? 0) - (left.at ?? 0))[0];
  const name = latest?.fromName?.trim();
  return name ? name : null;
}

export function parseIncomingTalkState(payload: unknown): IncomingTalkState | null {
  const item = unwrapIncomingTalkPayload(payload);
  if (!item) {
    return null;
  }

  const addressedSource = Array.isArray(item.addressedNow) ? item.addressedNow : [];

  return {
    userId: asNumber(item.userId),
    addressedNow: addressedSource
      .map(parseIncomingTalkEntry)
      .filter((entry): entry is IncomingTalkEntry => entry !== null),
    replyTarget: parseIncomingTalkEntry(item.replyTarget) ?? undefined,
  };
}
