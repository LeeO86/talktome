import { requireNativeModule } from 'expo-modules-core';

import type { WatchRemoteSnapshot } from './snapshot';
import type { WatchTalkAck } from './talkControl';

export type WatchRemoteStatus = {
  supported: boolean;
  paired: boolean;
  appInstalled: boolean;
  reachable: boolean;
  activated?: boolean;
};

export type WatchRemoteCommand = {
  key: string;
  targetType: string;
  targetId: string;
  requestId?: string;
};

type NativeWatchRemote = {
  isAvailable?: () => boolean;
  status?: () => WatchRemoteStatus;
  update?: (snapshot: WatchRemoteSnapshot) => Promise<boolean>;
  ackTalk?: (payload: WatchTalkAck) => Promise<boolean>;
  addListener?: {
    (eventName: 'onTalkStart', listener: (event: WatchRemoteCommand) => void): { remove: () => void };
    (eventName: 'onTalkLock', listener: (event: WatchRemoteCommand) => void): { remove: () => void };
    (eventName: 'onTalkStop', listener: (event: WatchRemoteCommand) => void): { remove: () => void };
  };
};

let cached: NativeWatchRemote | null | undefined;

function loadNative(): NativeWatchRemote | null {
  if (cached !== undefined) {
    return cached;
  }
  try {
    const native = requireNativeModule('TalkToMeWatchRemote') as NativeWatchRemote;
    cached = native?.isAvailable?.() === false ? null : native;
  } catch {
    cached = null;
  }
  return cached;
}

export function watchRemoteAvailable(): boolean {
  return loadNative() != null;
}

export function watchRemoteStatus(): WatchRemoteStatus {
  return (
    loadNative()?.status?.() ?? {
      supported: false,
      paired: false,
      appInstalled: false,
      reachable: false,
    }
  );
}

export function publishWatchRemote(snapshot: WatchRemoteSnapshot): void {
  void loadNative()?.update?.(snapshot);
}

export function ackWatchTalk(payload: WatchTalkAck): void {
  void loadNative()?.ackTalk?.(payload);
}

export function subscribeWatchRemote(handlers: {
  onTalkStart?: (command: WatchRemoteCommand) => void;
  onTalkLock?: (command: WatchRemoteCommand) => void;
  onTalkStop?: (command: WatchRemoteCommand) => void;
}): () => void {
  const native = loadNative();
  if (!native?.addListener) {
    return () => undefined;
  }
  const subscriptions = [
    handlers.onTalkStart ? native.addListener('onTalkStart', handlers.onTalkStart) : null,
    handlers.onTalkLock ? native.addListener('onTalkLock', handlers.onTalkLock) : null,
    handlers.onTalkStop ? native.addListener('onTalkStop', handlers.onTalkStop) : null,
  ];
  return () => {
    for (const subscription of subscriptions) {
      subscription?.remove();
    }
  };
}

export function describeWatchRemoteStatus(status: WatchRemoteStatus): string {
  if (!status.supported) {
    return 'Rebuild the Dev Client to enable the Watch remote.';
  }
  if (!status.paired) {
    return 'No Apple Watch paired with this iPhone.';
  }
  if (!status.appInstalled) {
    return 'Install TalkToMe on the paired Apple Watch, then keep this session connected.';
  }
  if (status.reachable) {
    return 'Watch reachable. Hold a target on the watch to talk; audio stays on the phone.';
  }
  return 'Watch app installed. Open TalkToMe on the watch while this session is connected.';
}

export function watchRemoteShortStatus(status: WatchRemoteStatus): string {
  if (!status.supported) {
    return 'Needs rebuild';
  }
  if (!status.paired) {
    return 'No watch';
  }
  if (!status.appInstalled) {
    return 'Install on Watch';
  }
  if (status.reachable) {
    return 'Reachable';
  }
  return 'Installed';
}
