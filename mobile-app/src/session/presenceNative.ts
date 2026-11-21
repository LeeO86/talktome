import { requireNativeModule } from 'expo-modules-core';

import { clearNowPlaying } from '../audio/session';
import {
  PRESENCE_DISCONNECT_LABEL,
  presenceTalkButtonLabel,
  presenceWidgetLines,
  type PresenceSnapshot,
} from './presence';

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
  talkLabel: string;
  disconnectLabel: string;
};

type NativePresence = {
  isAvailable?: () => boolean;
  update?: (snapshot: PresenceNativeSnapshot) => Promise<boolean>;
  addListener?: (
    eventName: 'onTalkShortcut' | 'onDisconnectShortcut' | 'onAppTerminating',
    listener: () => void,
  ) => { remove: () => void };
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
    talking: lines.talking || snapshot.talking || snapshot.talkLocked,
    listening: lines.listening,
    speaker: snapshot.speaker ?? '',
    actionKind: snapshot.actionKind,
    actionTarget: snapshot.actionTarget ?? '',
    talkLabel: presenceTalkButtonLabel(snapshot),
    disconnectLabel: PRESENCE_DISCONNECT_LABEL,
  };
  void loadNative()?.update?.(payload);
  // Live Activity / widget stay on Lock Screen. Do not register Now Playing.
  void clearNowPlaying();
}

export function subscribeTalkShortcut(onTalk: () => void): () => void {
  return subscribePresenceEvent('onTalkShortcut', onTalk);
}

export function subscribeDisconnectShortcut(onDisconnect: () => void): () => void {
  return subscribePresenceEvent('onDisconnectShortcut', onDisconnect);
}

export function subscribeAppTerminating(onTerminating: () => void): () => void {
  return subscribePresenceEvent('onAppTerminating', onTerminating);
}

function subscribePresenceEvent(
  eventName: 'onTalkShortcut' | 'onDisconnectShortcut' | 'onAppTerminating',
  listener: () => void,
): () => void {
  const native = loadNative();
  if (!native?.addListener) {
    return () => undefined;
  }
  const subscription = native.addListener(eventName, listener);
  return () => subscription.remove();
}
