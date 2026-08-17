import AsyncStorage from '@react-native-async-storage/async-storage';

import { fingerprintsEqual, isSha256Fingerprint, normalizeFingerprint } from './fingerprint';

const KEY = 'talktome.tls-pins';

export type TlsPin = {
  hostname: string;
  sha256: string;
};

export async function loadTlsPins(): Promise<TlsPin[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as TlsPin[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item) => item?.hostname && isSha256Fingerprint(item.sha256));
  } catch {
    return [];
  }
}

export async function saveTlsPins(pins: TlsPin[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(pins));
}

export function upsertTlsPin(pins: TlsPin[], next: TlsPin): TlsPin[] {
  const hostname = next.hostname.toLowerCase();
  const sha256 = normalizeFingerprint(next.sha256);
  return [...pins.filter((item) => item.hostname.toLowerCase() !== hostname), { hostname, sha256 }];
}

export function pinForHost(pins: TlsPin[], hostname: string): TlsPin | undefined {
  const host = hostname.toLowerCase();
  return pins.find((item) => item.hostname.toLowerCase() === host);
}

export function pinMatches(pin: TlsPin | undefined, sha256: string): boolean {
  return Boolean(pin && fingerprintsEqual(pin.sha256, sha256));
}
