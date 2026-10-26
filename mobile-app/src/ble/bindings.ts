import { BLE_RELEASE_WATCHDOG_MS } from './catalog';
import {
  ONBOARD_DEVICE_ID,
  describePttButton,
  isTalkButton,
  type PttButton,
  type PttDeviceKind,
} from '../hardware/events';
import { DEFAULT_BLE_TARGET, describeBleTarget, parseBleTargetSelection, type BleTargetSelection } from './target';
import type { BleConnectionKind, BleDeviceState } from './native';

export type PttControlBinding = {
  target: BleTargetSelection;
};

export type BleDeviceBinding = {
  id: string;
  name: string;
  kind: PttDeviceKind;
  target: BleTargetSelection;
  controls: Partial<Record<PttButton, PttControlBinding>>;
  seenButtons: PttButton[];
  rotaryRetargetsPtt1: boolean;
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

const KIND_VALUES: readonly PttDeviceKind[] = ['ble', 'spp', 'onboard', 'usb'];

const BUTTON_VALUES: readonly PttButton[] = [
  'ptt',
  'ptt2',
  'ptt3',
  'ptt4',
  'sos',
  'channelUp',
  'channelDown',
  'setChannel',
  'replay',
  'multi',
  'statusToggle',
  'selectionMode',
];

function parseDeviceKind(value: unknown, id: string): PttDeviceKind {
  if (id === ONBOARD_DEVICE_ID) {
    return 'onboard';
  }
  if (typeof value === 'string' && KIND_VALUES.includes(value as PttDeviceKind)) {
    return value as PttDeviceKind;
  }
  if (id.startsWith('spp:')) {
    return 'spp';
  }
  if (id.startsWith('usb:')) {
    return 'usb';
  }
  return 'ble';
}

function parseButtonId(value: unknown): PttButton | null {
  return typeof value === 'string' && BUTTON_VALUES.includes(value as PttButton)
    ? (value as PttButton)
    : null;
}

function parseControlMap(
  value: unknown,
  fallbackTarget: BleTargetSelection,
): Partial<Record<PttButton, PttControlBinding>> {
  const controls: Partial<Record<PttButton, PttControlBinding>> = {
    ptt: { target: fallbackTarget },
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return controls;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const button = parseButtonId(key);
    if (!button) {
      continue;
    }
    const target =
      item && typeof item === 'object'
        ? parseBleTargetSelection((item as Record<string, unknown>).target)
        : DEFAULT_BLE_TARGET;
    controls[button] = { target: button === 'sos' ? DEFAULT_BLE_TARGET : target };
  }
  if (!controls.ptt) {
    controls.ptt = { target: fallbackTarget };
  }
  return controls;
}

function parseSeenButtons(value: unknown, controls: Partial<Record<PttButton, PttControlBinding>>): PttButton[] {
  const seen: PttButton[] = [];
  const add = (button: PttButton) => {
    if (!seen.includes(button)) {
      seen.push(button);
    }
  };
  if (Array.isArray(value)) {
    for (const item of value) {
      const button = parseButtonId(item);
      if (button) {
        add(button);
      }
    }
  }
  for (const button of Object.keys(controls) as PttButton[]) {
    add(button);
  }
  add('ptt');
  return seen;
}

export function defaultButtonsForKind(kind: PttDeviceKind): PttButton[] {
  switch (kind) {
    case 'onboard':
      return ['ptt', 'ptt2', 'sos', 'channelUp', 'channelDown', 'setChannel'];
    case 'spp':
      return ['ptt', 'sos', 'channelUp', 'channelDown'];
    case 'usb':
      return ['ptt', 'ptt2', 'sos', 'channelUp', 'channelDown'];
    default:
      return ['ptt'];
  }
}

export function parseBleDeviceBinding(value: unknown): BleDeviceBinding | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || record.id.trim() === '') {
    return null;
  }
  const id = record.id.trim();
  const kind = parseDeviceKind(record.kind, id);
  const target = parseBleTargetSelection(record.target);
  const controls = parseControlMap(record.controls, target);
  return {
    id,
    name:
      typeof record.name === 'string' && record.name.trim()
        ? record.name
        : kind === 'onboard'
          ? 'This phone'
          : 'PTT accessory',
    kind,
    target: controls.ptt?.target ?? target,
    controls,
    seenButtons: parseSeenButtons(record.seenButtons, controls),
    rotaryRetargetsPtt1: record.rotaryRetargetsPtt1 === true,
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
  input: {
    id: string;
    name?: string;
    kind?: PttDeviceKind;
    target?: BleTargetSelection;
    button?: PttButton;
    rotaryRetargetsPtt1?: boolean;
    seenButton?: PttButton;
  },
  fallbackTarget: BleTargetSelection = DEFAULT_BLE_TARGET,
): BleDeviceBinding[] {
  const id = input.id.trim();
  if (!id) {
    return [...bindings];
  }
  const existing = bindings.find((item) => item.id === id);
  const kind = input.kind ?? existing?.kind ?? parseDeviceKind(undefined, id);
  const target = input.target ?? existing?.target ?? fallbackTarget;
  const controls: Partial<Record<PttButton, PttControlBinding>> = {
    ...existing?.controls,
    ptt: existing?.controls.ptt ?? { target },
  };
  const button = input.button ?? 'ptt';
  if (button === 'sos') {
    controls.sos = { target: DEFAULT_BLE_TARGET };
  } else if (input.target) {
    controls[button] = { target: input.target };
  }
  const seenButtons = [...(existing?.seenButtons ?? defaultButtonsForKind(kind))];
  const remember = (value: PttButton) => {
    if (!seenButtons.includes(value)) {
      seenButtons.push(value);
    }
  };
  remember('ptt');
  if (input.seenButton) {
    remember(input.seenButton);
  }
  if (input.button) {
    remember(input.button);
  }
  for (const item of defaultButtonsForKind(kind)) {
    remember(item);
  }
  const next: BleDeviceBinding = {
    id,
    name: input.name?.trim() || existing?.name || (kind === 'onboard' ? 'This phone' : 'PTT accessory'),
    kind,
    target: controls.ptt?.target ?? target,
    controls,
    seenButtons,
    rotaryRetargetsPtt1: input.rotaryRetargetsPtt1 ?? existing?.rotaryRetargetsPtt1 ?? false,
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

export function bindingControlTarget(
  binding: BleDeviceBinding | undefined,
  button: PttButton = 'ptt',
  fallback: BleTargetSelection = DEFAULT_BLE_TARGET,
): BleTargetSelection {
  if (!binding) {
    return fallback;
  }
  if (button === 'sos') {
    return DEFAULT_BLE_TARGET;
  }
  return binding.controls[button]?.target ?? (button === 'ptt' ? binding.target : fallback);
}

export function bindingTarget(
  bindings: readonly BleDeviceBinding[],
  id: string | null | undefined,
  fallback: BleTargetSelection = DEFAULT_BLE_TARGET,
  button: PttButton = 'ptt',
): BleTargetSelection {
  if (!id) {
    return fallback;
  }
  return bindingControlTarget(
    bindings.find((item) => item.id === id),
    button,
    fallback,
  );
}

export function visibleButtons(binding: BleDeviceBinding): PttButton[] {
  const buttons = new Set<PttButton>([
    ...defaultButtonsForKind(binding.kind),
    ...binding.seenButtons,
    ...(Object.keys(binding.controls) as PttButton[]),
  ]);
  return BUTTON_VALUES.filter((button) => buttons.has(button));
}

export function visibleTalkButtons(binding: BleDeviceBinding): PttButton[] {
  return visibleButtons(binding).filter((button) => isTalkButton(button));
}

export function describeBindingTargets(binding: BleDeviceBinding): string {
  const talk = visibleTalkButtons(binding);
  if (talk.length <= 1) {
    return describeBleTarget(bindingControlTarget(binding, 'ptt'));
  }
  return talk
    .map((button) => `${describePttButton(button)} → ${describeBleTarget(bindingControlTarget(binding, button))}`)
    .join(' · ');
}

export function isBindingConnected(
  binding: BleDeviceBinding,
  devices: readonly BleDeviceState[],
): boolean {
  if (binding.kind === 'onboard') {
    return true;
  }
  const live = devices.find((device) => device.id === binding.id);
  return live?.kind === 'connected';
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
  binding?: BleDeviceBinding,
): BleDeviceState | undefined {
  const live = devices.find((device) => device.id === id);
  if (live) {
    return live;
  }
  if (binding?.kind === 'onboard' || id === ONBOARD_DEVICE_ID) {
    return {
      id,
      kind: 'connected',
      name: binding?.name || 'This phone',
      profileId: 'onboard',
    };
  }
  return undefined;
}

export function describePttDevicesSummary(
  bindings: readonly BleDeviceBinding[],
  devices: readonly BleDeviceState[],
): string {
  if (bindings.length === 0) {
    return 'None';
  }
  const connected = bindings.filter((binding) => isBindingConnected(binding, devices)).length;
  if (connected === bindings.length) {
    return bindings.length === 1 ? '1 connected' : `${bindings.length} connected`;
  }
  if (connected === 0) {
    return bindings.length === 1 ? '1 saved' : `${bindings.length} saved`;
  }
  return `${connected} of ${bindings.length} connected`;
}

/** Operator-screen warning for saved accessories that are not connected; null when all are. */
export function missingAccessoryNotice(
  bindings: readonly BleDeviceBinding[],
  devices: readonly BleDeviceState[],
  bluetoothKind?: BleConnectionKind,
): string | null {
  const missing = bindings.filter((binding) => !isBindingConnected(binding, devices));
  if (missing.length === 0) {
    return null;
  }
  const subject =
    missing.length === 1
      ? `${missing[0]?.name || 'PTT accessory'} not connected`
      : `${missing.length} accessories not connected`;
  if (bluetoothKind === 'unavailable' && missing.some((binding) => binding.kind === 'ble')) {
    return `Bluetooth unavailable · ${subject}`;
  }
  const reconnecting = missing.some((binding) => {
    const kind = devices.find((device) => device.id === binding.id)?.kind;
    return kind === 'connecting' || kind === 'scanning';
  });
  return reconnecting ? `${subject} · Reconnecting…` : subject;
}

export function describeBleDeviceStatus(
  device: BleDeviceState | undefined,
  binding?: BleDeviceBinding,
): string {
  if (binding?.kind === 'onboard') {
    return 'Ready';
  }
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
