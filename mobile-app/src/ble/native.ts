import { requireNativeModule } from 'expo-modules-core';

export type BleConnectionKind =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'unavailable'
  | 'failed';

export type BleConnectionState = {
  kind: BleConnectionKind;
  name?: string;
  message?: string;
};

type NativeBlePtt = {
  isAvailable?: () => boolean;
  getState?: () => BleConnectionState;
  start?: () => Promise<BleConnectionState>;
  scanAndConnect?: () => Promise<BleConnectionState>;
  disconnect?: () => Promise<BleConnectionState>;
  addListener?: {
    (eventName: 'onState', listener: (event: BleConnectionState) => void): { remove: () => void };
    (eventName: 'onButton', listener: (event: { pressed: boolean }) => void): { remove: () => void };
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

export function bleNativeAvailable(): boolean {
  return loadNative() != null;
}

export function bleNativeState(): BleConnectionState {
  return loadNative()?.getState?.() ?? { kind: 'unavailable', message: 'Rebuild the Dev Client to enable Bluetooth PTT.' };
}

export async function startBleNative(): Promise<BleConnectionState> {
  const native = loadNative();
  if (!native?.start) {
    return bleNativeState();
  }
  try {
    return await native.start();
  } catch {
    return { kind: 'idle' };
  }
}

export async function scanAndConnectBle(): Promise<BleConnectionState> {
  const native = loadNative();
  if (!native?.scanAndConnect) {
    return bleNativeState();
  }
  try {
    return await native.scanAndConnect();
  } catch {
    return { kind: 'unavailable', message: 'Bluetooth permission is required to scan for a PTT button.' };
  }
}

export async function disconnectBle(): Promise<BleConnectionState> {
  const native = loadNative();
  if (!native?.disconnect) {
    return bleNativeState();
  }
  return native.disconnect();
}

export function subscribeBleNative(handlers: {
  onState?: (state: BleConnectionState) => void;
  onButton?: (pressed: boolean) => void;
  onDiagnostic?: (message: string) => void;
}): () => void {
  const native = loadNative();
  if (!native?.addListener) {
    return () => undefined;
  }
  const subscriptions = [
    handlers.onState ? native.addListener('onState', handlers.onState) : null,
    handlers.onButton
      ? native.addListener('onButton', (event: { pressed: boolean }) => handlers.onButton?.(event.pressed))
      : null,
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
  switch (state.kind) {
    case 'idle':
      return 'Not connected';
    case 'scanning':
      return 'Scanning…';
    case 'connecting':
      return state.name ? `Connecting to ${state.name}` : 'Connecting…';
    case 'connected':
      return state.name ? `Connected to ${state.name}` : 'Connected';
    case 'disconnected':
      return state.name ? `Disconnected from ${state.name}` : 'Disconnected';
    case 'unavailable':
    case 'failed':
      return state.message ?? (state.kind === 'failed' ? 'Connection failed' : 'Bluetooth unavailable');
    default:
      return 'Not connected';
  }
}
