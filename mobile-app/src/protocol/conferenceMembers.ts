// Derived from talktome public/client.js conference member listen UI @ bbb8e09
// by Daniel Jocher. Sort puts online members first (mobile); web sorts by name only.

import type { ConferenceMember, PeerSession } from './types';

export function excludeSelfConferenceMembers(
  members: ConferenceMember[] | undefined,
  selfUserId?: number | string | null,
): ConferenceMember[] {
  const selfId = Number(selfUserId);
  return (members ?? []).filter((member) => {
    if (!Number.isFinite(selfId)) {
      return true;
    }
    return member.userId !== selfId;
  });
}

export function sortConferenceMembers(
  members: ConferenceMember[],
  onlineUserIds: ReadonlySet<number>,
): ConferenceMember[] {
  return [...members].sort((left, right) => {
    const leftOnline = onlineUserIds.has(left.userId) ? 0 : 1;
    const rightOnline = onlineUserIds.has(right.userId) ? 0 : 1;
    if (leftOnline !== rightOnline) {
      return leftOnline - rightOnline;
    }
    return (left.name || String(left.userId)).localeCompare(right.name || String(right.userId), undefined, {
      sensitivity: 'base',
    });
  });
}

export function onlineUserIdsFromPeers(peers: PeerSession[]): Set<number> {
  const ids = new Set<number>();
  for (const peer of peers) {
    if (peer.kind === 'user' && peer.userId != null && Number.isFinite(peer.userId)) {
      ids.add(peer.userId);
    }
  }
  return ids;
}

export function formatLinearLevelDb(level: number): string {
  const linearLevel = Math.max(0, Math.min(1, Number(level)));
  if (!Number.isFinite(linearLevel) || linearLevel <= 0) {
    return '-inf dB';
  }
  const rounded = Math.round(20 * Math.log10(linearLevel) * 10) / 10;
  if (rounded >= 0) {
    return '0 dB';
  }
  return `${rounded.toFixed(1)} dB`;
}

/** Compact label for the volume ring. */
export function formatLinearLevelDbShort(level: number): string {
  const formatted = formatLinearLevelDb(level);
  if (formatted === '-inf dB') {
    return '-∞';
  }
  return formatted.replace(' dB', '').replace(/\.0$/, '');
}

export function conferenceListenKey(conferenceId: number | string, userId: number): string {
  return `${conferenceId}:${userId}`;
}
