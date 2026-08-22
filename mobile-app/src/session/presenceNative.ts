import { requireNativeModule } from 'expo-modules-core';

import { presenceWidgetLines, type PresenceSnapshot } from './presence';

export type PresenceNativeSnapshot = {
  connected: boolean;
  title: string;
  detail: string;
  audioActive: boolean;
  talking: boolean;
  listening: boolean;
  speaker: string;
  actionKind: string;
  actionTarget: string;
};

type NativePresence = {
  isAvailable?: () => boolean;
  update?: (snapshot: PresenceNativeSnapshot) => Promise<boolean>;
  addListener?: (eventName: 'onTalkShortcut', listener: () => void) => { remove: () => void };
};

let cached: NativePresence | null | undefined;

function loadNative(): NativePresence | null {
  if (cached !== undefined) {
    return cached;
  }
  try {
    const native = requireNativeModule('TalkToMePresence') as NativePresence;
    cached = native?.isAvailable?.() === false ? null : native;
  } catch {
    cached = null;
  }
  return cached;
}

export function publishSessionPresence(snapshot: PresenceSnapshot): void {
  const lines = presenceWidgetLines(snapshot);
  const payload: PresenceNativeSnapshot = {
    connected: snapshot.connected,
    title: lines.title,
    detail: lines.detail,
    audioActive: lines.audioActive,
    talking: lines.talking,
    listening: lines.listening,
    speaker: snapshot.speaker ?? '',
    actionKind: snapshot.actionKind,
    actionTarget: snapshot.actionTarget ?? '',
  };
  void loadNative()?.update?.(payload);
}

export function subscribeTalkShortcut(onTalk: () => void): () => void {
  const native = loadNative();
  if (!native?.addListener) {
    return () => undefined;
  }
  const subscription = native.addListener('onTalkShortcut', onTalk);
  return () => subscription.remove();
}
