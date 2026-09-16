import { BLE_RELEASE_WATCHDOG_MS } from './catalog';
import { DEFAULT_BLE_TARGET, parseBleTargetSelection, type BleTargetSelection } from './target';
import type { BleConnectionKind, BleDeviceState } from './native';

export type BleDeviceBinding = {
  id: string;
  name: string;
  target: BleTargetSelection;
};

export const BLE_MAX_ACCESSORIES = 8;

export const DEFAULT_BLE_RELEASE_TIMEOUT_MS = BLE_RELEASE_WATCHDOG_MS;

export const BLE_RELEASE_TIMEOUT_OPTIONS_MS = [10_000, 15_000, 30_000, 60_000, 120_000, 0] as const;

export function describeBleReleaseTimeout(ms: number): string {
  if (ms <= 0) {
    return 'Off';
  }
  if (ms % 60_000 === 0) {
    return `${ms / 60_000} min`;
  }
  return `${Math.round(ms / 1000)} s`;
}

export function nextBleReleaseTimeoutMs(current: number): number {
  const options = BLE_RELEASE_TIMEOUT_OPTIONS_MS as readonly number[];
  const index = options.indexOf(current);
  if (index < 0) {
    return DEFAULT_BLE_RELEASE_TIMEOUT_MS;
  }
  const next = options[(index + 1) % options.length];
  return next ?? DEFAULT_BLE_RELEASE_TIMEOUT_MS;
}

export function parseBleReleaseTimeoutMs(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return DEFAULT_BLE_RELEASE_TIMEOUT_MS;
  }
  return Math.round(value);
}

export function parseBleDeviceBinding(value: unknown): BleDeviceBinding | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || record.id.trim() === '') {
    return null;
  }
  return {
    id: record.id,
    name: typeof record.name === 'string' && record.name.trim() ? record.name : 'Bluetooth accessory',
    target: parseBleTargetSelection(record.target),
  };
}

export function parseBleDeviceBindings(value: unknown): BleDeviceBinding[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const bindings: BleDeviceBinding[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const parsed = parseBleDeviceBinding(item);
    if (!parsed || seen.has(parsed.id)) {
      continue;
    }
    seen.add(parsed.id);
    bindings.push(parsed);
  }
  return bindings;
}

export function upsertBleDeviceBinding(
  bindings: readonly BleDeviceBinding[],
  input: { id: string; name?: string; target?: BleTargetSelection },
  fallbackTarget: BleTargetSelection = DEFAULT_BLE_TARGET,
): BleDeviceBinding[] {
  const id = input.id.trim();
  if (!id) {
    return [...bindings];
  }
  const existing = bindings.find((item) => item.id === id);
  const next: BleDeviceBinding = {
    id,
    name: input.name?.trim() || existing?.name || 'Bluetooth accessory',
    target: input.target ?? existing?.target ?? fallbackTarget,
  };
  if (!existing) {
    return [...bindings, next];
  }
  return bindings.map((item) => (item.id === id ? next : item));
}

export function removeBleDeviceBinding(
  bindings: readonly BleDeviceBinding[],
  id: string,
): BleDeviceBinding[] {
  return bindings.filter((item) => item.id !== id);
}

export function bindingTarget(
  bindings: readonly BleDeviceBinding[],
  id: string | null | undefined,
  fallback: BleTargetSelection = DEFAULT_BLE_TARGET,
): BleTargetSelection {
  if (!id) {
    return fallback;
  }
  return bindings.find((item) => item.id === id)?.target ?? fallback;
}

/** Update names of saved accessories from live native state. Pairing must add devices explicitly. */
export function refreshBindingNames(
  bindings: readonly BleDeviceBinding[],
  devices: readonly BleDeviceState[],
): BleDeviceBinding[] {
  if (bindings.length === 0) {
    return [...bindings];
  }
  let changed = false;
  const next = bindings.map((binding) => {
    const live = devices.find((device) => device.id === binding.id);
    const name = live?.name?.trim();
    if (!name || name === binding.name) {
      return binding;
    }
    changed = true;
    return { ...binding, name };
  });
  return changed ? next : [...bindings];
}

export function mergeLiveBleDevices(
  bindings: readonly BleDeviceBinding[],
  devices: readonly BleDeviceState[],
  _fallbackTarget: BleTargetSelection = DEFAULT_BLE_TARGET,
): BleDeviceBinding[] {
  return refreshBindingNames(bindings, devices);
}

export function aggregateBleKind(
  devices: readonly BleDeviceState[],
  scanning: boolean,
): BleConnectionKind {
  if (scanning) {
    return 'scanning';
  }
  if (devices.some((device) => device.kind === 'connected')) {
    return 'connected';
  }
  if (devices.some((device) => device.kind === 'connecting')) {
    return 'connecting';
  }
  if (devices.some((device) => device.kind === 'failed') && devices.every((device) => device.kind !== 'connected')) {
    return 'failed';
  }
  if (devices.some((device) => device.kind === 'unavailable')) {
    return 'unavailable';
  }
  if (devices.some((device) => device.kind === 'disconnected')) {
    return 'disconnected';
  }
  return 'idle';
}

export function connectedBleDeviceNames(devices: readonly BleDeviceState[]): string {
  return devices
    .filter((device) => device.kind === 'connected' || device.kind === 'connecting')
    .map((device) => device.name)
    .filter((name): name is string => Boolean(name && name.trim()))
    .join(', ');
}

export function anyBleDeviceActive(devices: readonly BleDeviceState[], scanning: boolean): boolean {
  return (
    scanning ||
    devices.some((device) => device.kind === 'connected' || device.kind === 'connecting')
  );
}

export function liveDeviceById(
  devices: readonly BleDeviceState[],
  id: string,
): BleDeviceState | undefined {
  return devices.find((device) => device.id === id);
}

export function describePttDevicesSummary(
  bindings: readonly BleDeviceBinding[],
  devices: readonly BleDeviceState[],
): string {
  if (bindings.length === 0) {
    return 'None';
  }
  const connected = bindings.filter((binding) => liveDeviceById(devices, binding.id)?.kind === 'connected').length;
  if (connected === bindings.length) {
    return bindings.length === 1 ? '1 connected' : `${bindings.length} connected`;
  }
  if (connected === 0) {
    return bindings.length === 1 ? '1 saved' : `${bindings.length} saved`;
  }
  return `${connected} of ${bindings.length} connected`;
}

export function describeBleDeviceStatus(device: BleDeviceState | undefined): string {
  if (!device) {
    return 'Not connected';
  }
  switch (device.kind) {
    case 'scanning':
      return 'Scanning…';
    case 'connecting':
      return 'Connecting…';
    case 'connected':
      return 'Connected';
    case 'failed':
      return device.message ?? 'Connection failed';
    case 'unavailable':
      return device.message ?? 'Bluetooth unavailable';
    case 'disconnected':
      return 'Disconnected';
    default:
      return 'Not connected';
  }
}
