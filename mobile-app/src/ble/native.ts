import { requireNativeModule } from 'expo-modules-core';

import { catalogForNative } from './catalog';

export type BleConnectionKind =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'unavailable'
  | 'failed';

export type BleDeviceState = {
  id: string;
  kind: BleConnectionKind;
  name?: string;
  message?: string;
  profileId?: string;
};

export type BleConnectionState = {
  kind: BleConnectionKind;
  name?: string;
  message?: string;
  profileId?: string;
  scanning?: boolean;
  pairing?: boolean;
  devices?: BleDeviceState[];
};

export type BleNotifyEvent = {
  deviceId?: string;
  data: unknown;
  serviceUuid?: string;
  characteristicUuid?: string;
};

export type BleButtonEvent = {
  pressed: boolean;
  deviceId?: string;
};

type NativeBlePtt = {
  isAvailable?: () => boolean;
  getState?: () => BleConnectionState;
  start?: (catalogJson?: string) => Promise<BleConnectionState>;
  scanAndConnect?: (catalogJson?: string) => Promise<BleConnectionState>;
  startButtonPairing?: (
    catalogJson?: string,
    timeoutMs?: number,
    boundIdsJson?: string,
  ) => Promise<BleConnectionState>;
  cancelButtonPairing?: () => Promise<BleConnectionState>;
  acceptPairedDevice?: (deviceId: string) => Promise<BleConnectionState>;
  connectDevice?: (deviceId: string, catalogJson?: string) => Promise<BleConnectionState>;
  disconnect?: (deviceId?: string) => Promise<BleConnectionState>;
  addListener?: {
    (eventName: 'onState', listener: (event: BleConnectionState) => void): { remove: () => void };
    (eventName: 'onButton', listener: (event: BleButtonEvent) => void): { remove: () => void };
    (eventName: 'onNotify', listener: (event: BleNotifyEvent) => void): { remove: () => void };
    (eventName: 'onDiagnostic', listener: (event: { message: string }) => void): { remove: () => void };
  };
};

let cached: NativeBlePtt | null | undefined;

function loadNative(): NativeBlePtt | null {
  if (cached !== undefined) {
    return cached;
  }
  try {
    const native = requireNativeModule('TalkToMeBlePtt') as NativeBlePtt;
    cached = native?.isAvailable?.() === false ? null : native;
  } catch {
    cached = null;
  }
  return cached;
}

function catalogJson(): string {
  return JSON.stringify(catalogForNative());
}

function coerceDevices(state: BleConnectionState): BleConnectionState {
  const devices = Array.isArray(state.devices)
    ? state.devices.filter((device): device is BleDeviceState => Boolean(device?.id && device.kind))
    : [];
  return { ...state, devices };
}

export function bleNativeAvailable(): boolean {
  return loadNative() != null;
}

export function bleNativeState(): BleConnectionState {
  const native = loadNative()?.getState?.();
  if (!native) {
    return { kind: 'unavailable', message: 'Rebuild the Dev Client to enable Bluetooth PTT.', devices: [] };
  }
  return coerceDevices(native);
}

export async function startBleNative(): Promise<BleConnectionState> {
  const native = loadNative();
  if (!native?.start) {
    return bleNativeState();
  }
  try {
    return coerceDevices(await native.start(catalogJson()));
  } catch {
    return { kind: 'idle', devices: [] };
  }
}

export async function scanAndConnectBle(): Promise<BleConnectionState> {
  const native = loadNative();
  if (!native?.scanAndConnect) {
    return bleNativeState();
  }
  try {
    return coerceDevices(await native.scanAndConnect(catalogJson()));
  } catch {
    return { kind: 'unavailable', message: 'Bluetooth permission is required to scan for a PTT accessory.', devices: [] };
  }
}

export async function startButtonPairingBle(input: {
  timeoutMs: number;
  boundIds: readonly string[];
}): Promise<BleConnectionState> {
  const native = loadNative();
  if (!native?.startButtonPairing) {
    return scanAndConnectBle();
  }
  try {
    return coerceDevices(
      await native.startButtonPairing(catalogJson(), input.timeoutMs, JSON.stringify(input.boundIds)),
    );
  } catch {
    return {
      kind: 'unavailable',
      message: 'Bluetooth permission is required to scan for a PTT accessory.',
      devices: [],
    };
  }
}

export async function cancelButtonPairingBle(): Promise<BleConnectionState> {
  const native = loadNative();
  if (!native?.cancelButtonPairing) {
    return bleNativeState();
  }
  try {
    return coerceDevices(await native.cancelButtonPairing());
  } catch {
    return bleNativeState();
  }
}

export async function acceptPairedBleDevice(deviceId: string): Promise<BleConnectionState> {
  const native = loadNative();
  if (!native?.acceptPairedDevice) {
    return connectBleDevice(deviceId);
  }
  try {
    return coerceDevices(await native.acceptPairedDevice(deviceId));
  } catch {
    return connectBleDevice(deviceId);
  }
}

export async function connectBleDevice(deviceId: string): Promise<BleConnectionState> {
  const native = loadNative();
  if (!native?.connectDevice) {
    return scanAndConnectBle();
  }
  try {
    return coerceDevices(await native.connectDevice(deviceId, catalogJson()));
  } catch {
    return scanAndConnectBle();
  }
}

export async function disconnectBle(deviceId?: string): Promise<BleConnectionState> {
  const native = loadNative();
  if (!native?.disconnect) {
    return bleNativeState();
  }
  return coerceDevices(await native.disconnect(deviceId ?? ''));
}

export function subscribeBleNative(handlers: {
  onState?: (state: BleConnectionState) => void;
  onButton?: (event: BleButtonEvent) => void;
  onNotify?: (event: BleNotifyEvent) => void;
  onDiagnostic?: (message: string) => void;
}): () => void {
  const native = loadNative();
  if (!native?.addListener) {
    return () => undefined;
  }
  const subscriptions = [
    handlers.onState
      ? native.addListener('onState', (event) => handlers.onState?.(coerceDevices(event)))
      : null,
    handlers.onButton ? native.addListener('onButton', handlers.onButton) : null,
    handlers.onNotify ? native.addListener('onNotify', handlers.onNotify) : null,
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

export function describeBleConnection(state: BleConnectionState): string {
  const names = (state.devices ?? [])
    .filter((device) => device.kind === 'connected' || device.kind === 'connecting')
    .map((device) => device.name)
    .filter((name): name is string => Boolean(name && name.trim()));
  const label = names.join(', ') || state.name;
  switch (state.kind) {
    case 'idle':
      return names.length ? `${names.length} saved` : 'Not connected';
    case 'scanning':
      return label ? `Scanning… (${label})` : 'Scanning…';
    case 'connecting':
      return label ? `Connecting to ${label}` : 'Connecting…';
    case 'connected':
      return label ? `Connected to ${label}` : 'Connected';
    case 'disconnected':
      return label ? `Disconnected from ${label}` : 'Disconnected';
    case 'unavailable':
    case 'failed':
      return state.message ?? (state.kind === 'failed' ? 'Connection failed' : 'Bluetooth unavailable');
    default:
      return 'Not connected';
  }
}
