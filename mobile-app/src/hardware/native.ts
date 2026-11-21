import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

import { pttIntentCatalogJson } from './intents';
import type { PttButton, PttTransport } from './events';

export type HardwareDeviceState = {
  id: string;
  kind: 'spp' | 'usb' | 'onboard';
  name: string;
  status: 'idle' | 'connecting' | 'connected' | 'failed' | 'disconnected';
  message?: string;
};

export type HardwareNativeState = {
  listening?: boolean;
  pairing?: boolean;
  devices?: HardwareDeviceState[];
  message?: string;
};

export type HardwareNativeEvent = {
  button: PttButton;
  pressed: boolean;
  channel?: number;
  source: PttTransport;
  deviceId?: string;
  deviceName?: string;
  raw?: string;
};

export type HardwareBytesEvent = {
  source: PttTransport;
  deviceId?: string;
  deviceName?: string;
  data: unknown;
  text?: string;
};

export type BondedSerialDevice = {
  id: string;
  name: string;
  pttHint: boolean;
};

type NativePttHardware = {
  isAvailable?: () => boolean;
  getState?: () => HardwareNativeState;
  start?: (intentCatalogJson?: string) => Promise<HardwareNativeState>;
  stop?: () => Promise<HardwareNativeState>;
  startPairing?: (timeoutMs?: number, boundIdsJson?: string) => Promise<HardwareNativeState>;
  cancelPairing?: () => Promise<HardwareNativeState>;
  acceptDevice?: (deviceId: string) => Promise<HardwareNativeState>;
  connectDevice?: (deviceId: string) => Promise<HardwareNativeState>;
  disconnectDevice?: (deviceId?: string) => Promise<HardwareNativeState>;
  listBondedSerial?: () => BondedSerialDevice[];
  addListener?: {
    (eventName: 'onEvent', listener: (event: HardwareNativeEvent) => void): { remove: () => void };
    (eventName: 'onBytes', listener: (event: HardwareBytesEvent) => void): { remove: () => void };
    (eventName: 'onState', listener: (event: HardwareNativeState) => void): { remove: () => void };
    (eventName: 'onDiagnostic', listener: (event: { message: string }) => void): { remove: () => void };
  };
};

let cached: NativePttHardware | null | undefined;

function loadNative(): NativePttHardware | null {
  if (cached !== undefined) {
    return cached;
  }
  if (Platform.OS !== 'android') {
    cached = null;
    return cached;
  }
  try {
    const native = requireNativeModule('TalkToMePttHardware') as NativePttHardware;
    cached = native?.isAvailable?.() === false ? null : native;
  } catch {
    cached = null;
  }
  return cached;
}

export function pttHardwareAvailable(): boolean {
  return loadNative() != null;
}

export function pttHardwareState(): HardwareNativeState {
  return loadNative()?.getState?.() ?? { listening: false, devices: [] };
}

export async function startPttHardware(): Promise<HardwareNativeState> {
  const native = loadNative();
  if (!native?.start) {
    return pttHardwareState();
  }
  try {
    return await native.start(pttIntentCatalogJson());
  } catch {
    return { listening: false, devices: [], message: 'PTT hardware could not start.' };
  }
}

export async function stopPttHardware(): Promise<HardwareNativeState> {
  const native = loadNative();
  if (!native?.stop) {
    return pttHardwareState();
  }
  try {
    return await native.stop();
  } catch {
    return pttHardwareState();
  }
}

export async function startHardwarePairing(input: {
  timeoutMs: number;
  boundIds: readonly string[];
}): Promise<HardwareNativeState> {
  const native = loadNative();
  if (!native?.startPairing) {
    return pttHardwareState();
  }
  try {
    return await native.startPairing(input.timeoutMs, JSON.stringify(input.boundIds));
  } catch {
    return { listening: true, pairing: false, devices: [] };
  }
}

export async function cancelHardwarePairing(): Promise<HardwareNativeState> {
  const native = loadNative();
  if (!native?.cancelPairing) {
    return pttHardwareState();
  }
  try {
    return await native.cancelPairing();
  } catch {
    return pttHardwareState();
  }
}

export async function acceptHardwareDevice(deviceId: string): Promise<HardwareNativeState> {
  const native = loadNative();
  if (!native?.acceptDevice) {
    return pttHardwareState();
  }
  try {
    return await native.acceptDevice(deviceId);
  } catch {
    return pttHardwareState();
  }
}

export async function connectHardwareDevice(deviceId: string): Promise<HardwareNativeState> {
  const native = loadNative();
  if (!native?.connectDevice) {
    return pttHardwareState();
  }
  try {
    return await native.connectDevice(deviceId);
  } catch {
    return pttHardwareState();
  }
}

export async function disconnectHardwareDevice(deviceId?: string): Promise<HardwareNativeState> {
  const native = loadNative();
  if (!native?.disconnectDevice) {
    return pttHardwareState();
  }
  try {
    return await native.disconnectDevice(deviceId ?? '');
  } catch {
    return pttHardwareState();
  }
}

export function listBondedSerialDevices(): BondedSerialDevice[] {
  try {
    return loadNative()?.listBondedSerial?.() ?? [];
  } catch {
    return [];
  }
}

export function subscribePttHardware(handlers: {
  onEvent?: (event: HardwareNativeEvent) => void;
  onBytes?: (event: HardwareBytesEvent) => void;
  onState?: (state: HardwareNativeState) => void;
  onDiagnostic?: (message: string) => void;
}): () => void {
  const native = loadNative();
  if (!native?.addListener) {
    return () => undefined;
  }
  const subscriptions = [
    handlers.onEvent ? native.addListener('onEvent', handlers.onEvent) : null,
    handlers.onBytes ? native.addListener('onBytes', handlers.onBytes) : null,
    handlers.onState ? native.addListener('onState', handlers.onState) : null,
    handlers.onDiagnostic
      ? native.addListener('onDiagnostic', (event: { message: string }) => handlers.onDiagnostic?.(event.message))
      : null,
  ];
  return () => {
    for (const subscription of subscriptions) {
      subscription?.remove();
    }
  };
}
