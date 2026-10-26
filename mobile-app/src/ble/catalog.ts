// Accessory profiles are the OSS extension point for BLE PTT hardware.
// Add a profile here (names + discovery + codec). Native scan/subscribe reads
// the same list at runtime; codecs stay in JS so a new map does not need a
// native module. Audio (HFP/HSP) is still paired in system Bluetooth settings.

import { decodeHm10Byte, looksLikeHardwareCommand } from '../hardware/codecs';

export { decodeHm10Byte, decodeZelloTwoByte } from '../hardware/codecs';

export const BLE_BUTTON_SERVICE_UUID = 'FFE0';
export const BLE_BUTTON_CHARACTERISTIC_UUID = 'FFE1';
export const BLE_SHORT_PRESS_LOCK_MS = 250;
export const BLE_RELEASE_WATCHDOG_MS = 30_000;
/** How long Add device listens for a known PTT notify. */
export const BLE_BUTTON_PAIRING_MS = 20_000;
export const BLE_BUTTON_PAIRING_MIN_RSSI = -90;

const PAIRING_SKIP_NAME_FRAGMENTS = [
  'IPHONE',
  'IPAD',
  'IPOD',
  'MACBOOK',
  'IMAC',
  'APPLE WATCH',
  'AIRPODS',
  'GALAXY BUDS',
  'PIXEL BUDS',
] as const;

export const DEFAULT_ZELLO_PTT_KEYCODES = [0x01, 0x04, 0x46, 0x66] as const;

export type AccessoryKind = 'button' | 'speaker-mic';
export type AccessoryCodec = 'hm10-byte' | 'zello-two-byte' | 'auto';
export type AccessoryDiscovery = 'fixed' | 'vendor-notify';

export type AccessoryProfile = {
  id: string;
  label: string;
  kind: AccessoryKind;
  names: readonly string[];
  nameIncludes?: readonly string[];
  serviceUuid?: string;
  characteristicUuid?: string;
  codec: AccessoryCodec;
  discovery: AccessoryDiscovery;
  pttKeycodes?: readonly number[];
};

export type NativeAccessoryProfile = {
  id: string;
  names: string[];
  nameIncludes: string[];
  serviceUuid: string;
  characteristicUuid: string;
  discovery: AccessoryDiscovery;
};

export const ACCESSORY_CATALOG: readonly AccessoryProfile[] = [
  {
    id: 'ptt-z01',
    label: 'PTT-Z01 Bluetooth button',
    kind: 'button',
    names: ['PTT-Z01'],
    serviceUuid: BLE_BUTTON_SERVICE_UUID,
    characteristicUuid: BLE_BUTTON_CHARACTERISTIC_UUID,
    codec: 'hm10-byte',
    discovery: 'fixed',
  },
  {
    id: 'herda-hb980-plus',
    label: 'Herda HB980-Plus wireless speaker mic',
    kind: 'speaker-mic',
    // Dual-mode: classic HFP often advertises *Zello (Herdt980D-Zello / HB980D-Zello);
    // the PTT GATT link is a separate LE name, commonly "Herda PTT".
    names: [
      'HB9800D',
      'HB980D',
      'HB980-PLUS',
      'HB980PLUS',
      'HB980D-Zello',
      'Herdt980D-Zello',
      'Herda PTT',
    ],
    nameIncludes: ['HB980', 'HERDA PTT', 'HERDAPTT', 'HERDA-PTT', 'HERDT980', 'HERDA980'],
    codec: 'auto',
    discovery: 'vendor-notify',
    pttKeycodes: DEFAULT_ZELLO_PTT_KEYCODES,
  },
  {
    id: 'hm10-generic',
    label: 'HM-10 PTT button',
    kind: 'button',
    names: ['HMSoft', 'BT05', 'JDY-08', 'JDY-10'],
    nameIncludes: ['HMSOFT', 'BT05', 'JDY-08', 'JDY-10'],
    serviceUuid: BLE_BUTTON_SERVICE_UUID,
    characteristicUuid: BLE_BUTTON_CHARACTERISTIC_UUID,
    codec: 'hm10-byte',
    discovery: 'fixed',
  },
  {
    id: 'zello-ble-generic',
    label: 'Zello BLE PTT accessory',
    kind: 'button',
    names: [],
    nameIncludes: ['ZELLO PTT', 'ANYSECU', 'INRIC B02', 'INRIC B2', 'B02 PTT'],
    codec: 'auto',
    discovery: 'vendor-notify',
    pttKeycodes: DEFAULT_ZELLO_PTT_KEYCODES,
  },
];

export const FALLBACK_ACCESSORY_PROFILE: AccessoryProfile = {
  id: 'unknown',
  label: 'Unknown accessory',
  kind: 'button',
  names: [],
  codec: 'auto',
  discovery: 'vendor-notify',
  pttKeycodes: DEFAULT_ZELLO_PTT_KEYCODES,
};

export const BLE_BUTTON_EXPECTED_NAMES = ['PTT-Z01'] as const;

export function catalogForNative(
  catalog: readonly AccessoryProfile[] = ACCESSORY_CATALOG,
): NativeAccessoryProfile[] {
  return catalog.map((profile) => ({
    id: profile.id,
    names: [...profile.names],
    nameIncludes: [...(profile.nameIncludes ?? [])],
    serviceUuid: profile.serviceUuid ?? '',
    characteristicUuid: profile.characteristicUuid ?? '',
    discovery: profile.discovery,
  }));
}

export function normalizeBluetoothUuid(uuid: string | null | undefined): string {
  if (!uuid) {
    return '';
  }
  const compact = uuid.replace(/-/g, '').toUpperCase();
  if (compact.length === 4) {
    return `0000${compact}00001000800000805F9B34FB`;
  }
  if (compact.length === 8) {
    return `${compact}00001000800000805F9B34FB`;
  }
  return compact;
}

export function bluetoothUuidsEqual(left: string, right: string): boolean {
  const a = normalizeBluetoothUuid(left);
  const b = normalizeBluetoothUuid(right);
  return Boolean(a) && a === b;
}

export function accessoryProfileById(id: string | null | undefined): AccessoryProfile | undefined {
  if (!id) {
    return undefined;
  }
  return ACCESSORY_CATALOG.find((profile) => profile.id === id);
}

export function matchAccessoryProfile(input: {
  profileId?: string | null;
  name?: string | null;
  advertisedServiceUuids?: readonly string[];
}): AccessoryProfile | undefined {
  const byId = accessoryProfileById(input.profileId);
  if (byId) {
    return byId;
  }
  const name = input.name?.trim().toUpperCase() ?? '';
  for (const profile of ACCESSORY_CATALOG) {
    if (name && profile.names.some((candidate) => candidate.toUpperCase() === name)) {
      return profile;
    }
  }
  for (const profile of ACCESSORY_CATALOG) {
    if (
      name &&
      profile.nameIncludes?.some((fragment) => name.includes(fragment.toUpperCase()))
    ) {
      return profile;
    }
  }
  const advertised = input.advertisedServiceUuids ?? [];
  for (const profile of ACCESSORY_CATALOG) {
    if (
      profile.serviceUuid &&
      advertised.some((uuid) => bluetoothUuidsEqual(uuid, profile.serviceUuid!))
    ) {
      return profile;
    }
  }
  return undefined;
}

export function matchesExpectedBleName(name: string | null | undefined): boolean {
  return matchAccessoryProfile({ name }) != null;
}

/** Phones, computers, and earbuds we should not probe while listening for a PTT button. */
export function shouldSkipPairingName(name: string | null | undefined): boolean {
  const normalized = name?.trim().toUpperCase() ?? '';
  if (!normalized) {
    return false;
  }
  return PAIRING_SKIP_NAME_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

export const decodeButtonByte = decodeHm10Byte;

/** True when a GATT notify is a known PTT/SOS/channel command (Zello two-byte, bitmask, or HM-10). */
export function looksLikePttCommand(
  bytes: readonly number[],
  profile: AccessoryProfile = FALLBACK_ACCESSORY_PROFILE,
): boolean {
  return looksLikeHardwareCommand(bytes, profile);
}

export function coerceNotifyBytes(data: unknown): number[] {
  if (Array.isArray(data)) {
    return data.map((value) => Number(value) & 0xff);
  }
  if (data instanceof Uint8Array) {
    return Array.from(data);
  }
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => /^\d+$/.test(key))
      .sort((left, right) => Number(left) - Number(right));
    if (keys.length > 0) {
      return keys.map((key) => Number(record[key]) & 0xff);
    }
  }
  return [];
}
