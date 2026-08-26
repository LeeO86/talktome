import { requireNativeModule } from 'expo-modules-core';

import { fgsStatusLabel } from './fgs';

export type ForegroundServiceSnapshot = {
  available: boolean;
  running: boolean;
  includeConnectedDevice: boolean;
};

type NativeForegroundService = {
  isAvailable?: () => boolean;
  isRunning?: () => boolean;
  start?: (includeConnectedDevice: boolean, title: string, text: string, talking: boolean) => Promise<boolean>;
  update?: (includeConnectedDevice: boolean, title: string, text: string, talking: boolean) => Promise<boolean>;
  stop?: () => Promise<boolean>;
  openBatterySettings?: () => Promise<boolean>;
  addListener?: (
    eventName: 'onStopRequested' | 'onTalkRequested' | 'onStarted' | 'onStopped',
    listener: (event?: { includeConnectedDevice?: boolean }) => void,
  ) => { remove: () => void };
};

let cached: NativeForegroundService | null | undefined;

function loadNative(): NativeForegroundService | null {
  if (cached !== undefined) {
    return cached;
  }
  try {
    const native = requireNativeModule('TalkToMeForegroundService') as NativeForegroundService;
    cached = native?.isAvailable?.() === false ? null : native;
  } catch {
    cached = null;
  }
  return cached;
}

export function foregroundServiceAvailable(): boolean {
  return loadNative() != null;
}

export function foregroundServiceSnapshot(): ForegroundServiceSnapshot {
  const native = loadNative();
  return {
    available: native != null,
    running: native?.isRunning?.() === true,
    includeConnectedDevice: false,
  };
}

export function describeForegroundService(platform: string, running: boolean): string {
  return fgsStatusLabel({
    available: foregroundServiceAvailable(),
    running,
    platform,
  });
}

export async function startForegroundService(
  includeConnectedDevice: boolean,
  title = 'Nobody Talking',
  text = 'Disconnect ends the session.',
  talking = false,
): Promise<boolean> {
  const native = loadNative();
  if (!native?.start) {
    return false;
  }
  try {
    return await native.start(includeConnectedDevice, title, text, talking);
  } catch {
    return false;
  }
}

export async function updateForegroundService(
  includeConnectedDevice: boolean,
  title = 'Nobody Talking',
  text = 'Disconnect ends the session.',
  talking = false,
): Promise<boolean> {
  const native = loadNative();
  if (!native?.update) {
    return false;
  }
  try {
    return await native.update(includeConnectedDevice, title, text, talking);
  } catch {
    return false;
  }
}

export async function stopForegroundService(): Promise<boolean> {
  const native = loadNative();
  if (!native?.stop) {
    return false;
  }
  return native.stop();
}

export async function openBatterySettings(): Promise<boolean> {
  const native = loadNative();
  if (!native?.openBatterySettings) {
    return false;
  }
  return native.openBatterySettings();
}

export function subscribeForegroundService(handlers: {
  onStopRequested?: () => void;
  onTalkRequested?: () => void;
  onStarted?: () => void;
  onStopped?: () => void;
}): () => void {
  const native = loadNative();
  if (!native?.addListener) {
    return () => undefined;
  }
  const subscriptions = [
    handlers.onStopRequested ? native.addListener('onStopRequested', handlers.onStopRequested) : null,
    handlers.onTalkRequested ? native.addListener('onTalkRequested', handlers.onTalkRequested) : null,
    handlers.onStarted ? native.addListener('onStarted', handlers.onStarted) : null,
    handlers.onStopped ? native.addListener('onStopped', handlers.onStopped) : null,
  ];
  return () => {
    for (const subscription of subscriptions) {
      subscription?.remove();
    }
  };
}
