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
  start?: (includeConnectedDevice: boolean) => Promise<boolean>;
  update?: (includeConnectedDevice: boolean) => Promise<boolean>;
  stop?: () => Promise<boolean>;
  openBatterySettings?: () => Promise<boolean>;
  addListener?: (
    eventName: 'onStopRequested' | 'onStarted' | 'onStopped',
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

export async function startForegroundService(includeConnectedDevice: boolean): Promise<boolean> {
  const native = loadNative();
  if (!native?.start) {
    return false;
  }
  return native.start(includeConnectedDevice);
}

export async function updateForegroundService(includeConnectedDevice: boolean): Promise<boolean> {
  const native = loadNative();
  if (!native?.update) {
    return false;
  }
  return native.update(includeConnectedDevice);
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
  onStarted?: () => void;
  onStopped?: () => void;
}): () => void {
  const native = loadNative();
  if (!native?.addListener) {
    return () => undefined;
  }
  const subscriptions = [
    handlers.onStopRequested ? native.addListener('onStopRequested', handlers.onStopRequested) : null,
    handlers.onStarted ? native.addListener('onStarted', handlers.onStarted) : null,
    handlers.onStopped ? native.addListener('onStopped', handlers.onStopped) : null,
  ];
  return () => {
    for (const subscription of subscriptions) {
      subscription?.remove();
    }
  };
}
