import { requireNativeModule } from 'expo-modules-core';

import { iosPttEnabled } from '../audio/policy';

export type NativePttEventMap = {
  onDiagnostic: { message: string };
  onPushToken: { token: string; channelUUID: string; channelName: string };
  onBeginTransmitting: Record<string, never>;
  onEndTransmitting: Record<string, never>;
  onAudioActivated: Record<string, never>;
  onAudioDeactivated: Record<string, never>;
  onServiceUpdate: { reason?: string };
  onJoined: Record<string, never>;
  onLeft: Record<string, never>;
  onIncomingPush: { type: string; participantName?: string; reason?: string };
};

type NativePtt = {
  isAvailable?: () => boolean;
  updateChannel?: (channelUUID: string | null, channelName: string | null) => Promise<boolean>;
  updateActiveRemoteParticipant?: (name: string | null) => Promise<boolean>;
  leave?: () => Promise<boolean>;
  addListener?: (
    eventName: string,
    listener: (event: {
      message?: string;
      token?: string;
      channelUUID?: string;
      channelName?: string;
      reason?: string;
      type?: string;
      participantName?: string;
    }) => void,
  ) => { remove: () => void };
};

let cached: NativePtt | null | undefined;

function loadNative(): NativePtt | null {
  if (cached !== undefined) {
    return cached;
  }
  if (!iosPttEnabled()) {
    cached = null;
    return cached;
  }
  try {
    const native = requireNativeModule('TalkToMePtt') as NativePtt;
    cached = native?.isAvailable?.() === false ? null : native;
  } catch {
    cached = null;
  }
  return cached;
}

export function pttNativeAvailable(): boolean {
  return loadNative() != null;
}

export async function updatePttChannel(
  channelUUID: string | null,
  channelName: string | null,
): Promise<boolean> {
  return (await loadNative()?.updateChannel?.(channelUUID, channelName)) === true;
}

export async function updatePttRemoteParticipant(name: string | null): Promise<boolean> {
  return (await loadNative()?.updateActiveRemoteParticipant?.(name)) === true;
}

export async function leavePttChannel(): Promise<boolean> {
  return (await loadNative()?.leave?.()) === true;
}

export function subscribePttNative(handlers: {
  onDiagnostic?: (message: string) => void;
  onPushToken?: (event: NativePttEventMap['onPushToken']) => void;
  onBeginTransmitting?: () => void;
  onEndTransmitting?: () => void;
  onAudioActivated?: () => void;
  onAudioDeactivated?: () => void;
  onServiceUpdate?: (reason?: string) => void;
  onJoined?: () => void;
  onLeft?: () => void;
  onIncomingPush?: (event: NativePttEventMap['onIncomingPush']) => void;
}): () => void {
  const native = loadNative();
  if (!native?.addListener) {
    return () => undefined;
  }
  const subscriptions = [
    handlers.onDiagnostic
      ? native.addListener('onDiagnostic', (event) => handlers.onDiagnostic?.(event.message ?? ''))
      : null,
    handlers.onPushToken
      ? native.addListener('onPushToken', (event) => {
          if (!event.token || !event.channelUUID || !event.channelName) {
            return;
          }
          handlers.onPushToken?.({
            token: event.token,
            channelUUID: event.channelUUID,
            channelName: event.channelName,
          });
        })
      : null,
    handlers.onBeginTransmitting
      ? native.addListener('onBeginTransmitting', () => handlers.onBeginTransmitting?.())
      : null,
    handlers.onEndTransmitting
      ? native.addListener('onEndTransmitting', () => handlers.onEndTransmitting?.())
      : null,
    handlers.onAudioActivated
      ? native.addListener('onAudioActivated', () => handlers.onAudioActivated?.())
      : null,
    handlers.onAudioDeactivated
      ? native.addListener('onAudioDeactivated', () => handlers.onAudioDeactivated?.())
      : null,
    handlers.onServiceUpdate
      ? native.addListener('onServiceUpdate', (event) => handlers.onServiceUpdate?.(event.reason))
      : null,
    handlers.onJoined ? native.addListener('onJoined', () => handlers.onJoined?.()) : null,
    handlers.onLeft ? native.addListener('onLeft', () => handlers.onLeft?.()) : null,
    handlers.onIncomingPush
      ? native.addListener('onIncomingPush', (event) =>
          handlers.onIncomingPush?.({
            type: event.type ?? '',
            participantName: event.participantName,
            reason: event.reason,
          }),
        )
      : null,
  ];
  return () => {
    for (const subscription of subscriptions) {
      subscription?.remove();
    }
  };
}
