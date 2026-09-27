import { latestAddressedSpeaker, talkTargetIdentity, type IncomingTalkState, type TalkTarget } from '../protocol';
import { incomingSpeakingIdentity } from '../talk/replyTarget';

export type PresenceSnapshot = {
  connected: boolean;
  speaker: string | null;
  talking: boolean;
  talkingTo: string | null;
  talkingLabels: string[];
  listeningLabels: string[];
  talkLocked: boolean;
  actionKind: 'reply' | 'talk';
  actionTarget: string | null;
};

export function incomingDestinationLabels(incoming: IncomingTalkState, targets: TalkTarget[]): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const entry of incoming.addressedNow) {
    if (entry.targetType === 'feed') {
      continue;
    }
    const identity = incomingSpeakingIdentity(entry);
    const match = identity ? targets.find((target) => talkTargetIdentity(target) === identity) : undefined;
    const label =
      match?.label ??
      (entry.targetType === 'conference'
        ? `Conference ${entry.targetId}`
        : (entry.fromName?.trim() ?? null));
    if (!label || seen.has(label)) {
      continue;
    }
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

export function formatPresenceList(labels: string[]): string {
  if (labels.length === 0) {
    return '';
  }
  if (labels.length === 1) {
    return labels[0] ?? '';
  }
  if (labels.length === 2) {
    return `${labels[0]}, ${labels[1]}`;
  }
  return `${labels.slice(0, -1).join(', ')}, ${labels[labels.length - 1]}`;
}

export function sessionPresence(input: {
  operatorReady: boolean;
  incoming: IncomingTalkState;
  talking: boolean;
  talkingLabels: string[];
  talkLocked: boolean;
  replyTarget: TalkTarget | null;
  /** Set when the bottom button is pinned. Null means Reply. */
  mainButtonLabel: string | null;
  targets: TalkTarget[];
  streamingFeedLabels?: string[];
}): PresenceSnapshot {
  const actionTarget = input.mainButtonLabel != null ? { label: input.mainButtonLabel } : input.replyTarget;
  const listeningLabels = uniqueLabels([
    ...incomingDestinationLabels(input.incoming, input.targets),
    ...(input.streamingFeedLabels ?? []),
  ]);
  return {
    connected: input.operatorReady,
    speaker: latestAddressedSpeaker(input.incoming),
    talking: input.talking,
    talkingTo: input.talkingLabels[0] ?? null,
    talkingLabels: input.talkingLabels,
    listeningLabels,
    talkLocked: input.talkLocked,
    actionKind: input.mainButtonLabel != null ? 'talk' : 'reply',
    actionTarget: actionTarget?.label ?? null,
  };
}

export function talkingHeadline(snapshot: PresenceSnapshot): string {
  if (!snapshot.talking || snapshot.talkingLabels.length === 0) {
    return '';
  }
  const names = snapshot.talkingLabels.join(' · ');
  return snapshot.talkLocked ? `Locked · ${names}` : `Talking · ${names}`;
}

export function presenceNotification(snapshot: PresenceSnapshot): { title: string; text: string } {
  const disconnect = 'Disconnect ends the session.';
  if (!snapshot.connected) {
    return { title: 'TalkToMe', text: disconnect };
  }
  const lines = presenceWidgetLines(snapshot);
  return {
    title: lines.title,
    text: `${lines.detail}. ${disconnect}`,
  };
}

export function presenceWidgetLines(snapshot: PresenceSnapshot): {
  title: string;
  detail: string;
  audioActive: boolean;
  talking: boolean;
  listening: boolean;
} {
  if (!snapshot.connected) {
    return { title: 'talktome', detail: 'Not connected', audioActive: false, talking: false, listening: false };
  }
  const detail = presenceActionLine(snapshot);
  const listeningTitle = formatPresenceList(snapshot.listeningLabels);
  const headline = talkingHeadline(snapshot);
  if (headline && listeningTitle) {
    return {
      title: `${headline}, ${listeningTitle}`,
      detail,
      audioActive: true,
      talking: true,
      listening: true,
    };
  }
  if (headline) {
    return {
      title: headline,
      detail,
      audioActive: true,
      talking: true,
      listening: false,
    };
  }
  if (listeningTitle) {
    return { title: listeningTitle, detail, audioActive: true, talking: false, listening: true };
  }
  return { title: 'Nobody Talking', detail, audioActive: false, talking: false, listening: false };
}

export function presenceActionLine(snapshot: PresenceSnapshot): string {
  const kind = snapshot.actionKind === 'talk' ? 'Talk' : 'Reply';
  return snapshot.actionTarget ? `${kind}: ${snapshot.actionTarget}` : `${kind}: none`;
}

/** Same copy as the Android FGS notification and iOS Live Activity buttons. */
export function presenceTalkButtonLabel(snapshot: PresenceSnapshot): string {
  return snapshot.talking || snapshot.talkLocked ? 'Stop reply' : 'Reply lock';
}

export const PRESENCE_DISCONNECT_LABEL = 'Disconnect';

function uniqueLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const label of labels) {
    if (!label || seen.has(label)) {
      continue;
    }
    seen.add(label);
    next.push(label);
  }
  return next;
}
