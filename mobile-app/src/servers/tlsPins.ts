import { fingerprintsEqual, isSha256Fingerprint, normalizeFingerprint } from './fingerprint';

const KEY = 'talktome.tls-pins';

export type TlsPin = {
  hostname: string;
  sha256: string;
};

/** Parse a stored pin list. Invalid JSON or a non-array becomes an empty list. */
export function parseStoredTlsPins(raw: string): TlsPin[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item): item is TlsPin =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as TlsPin).hostname === 'string' &&
        (item as TlsPin).hostname.length > 0 &&
        typeof (item as TlsPin).sha256 === 'string' &&
        isSha256Fingerprint((item as TlsPin).sha256),
    );
  } catch {
    return [];
  }
}

type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

async function secureStore(): Promise<KeyValueStore> {
  const SecureStore = await import('expo-secure-store');
  return {
    getItem: (key) => SecureStore.getItemAsync(key),
    setItem: (key, value) => SecureStore.setItemAsync(key, value),
    removeItem: (key) => SecureStore.deleteItemAsync(key),
  };
}

async function legacyStore(): Promise<KeyValueStore> {
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  return AsyncStorage;
}

async function dropLegacyCopy(): Promise<void> {
  try {
    await (await legacyStore()).removeItem(KEY);
  } catch {
    // The SecureStore copy is the one the next launch reads.
  }
}

export async function loadTlsPins(): Promise<TlsPin[]> {
  const secure = await secureStore();
  const stored = await secure.getItem(KEY);
  if (stored != null) {
    await dropLegacyCopy();
    return parseStoredTlsPins(stored);
  }
  const legacy = parseStoredTlsPins((await (await legacyStore()).getItem(KEY)) ?? '');
  if (legacy.length === 0) {
    return [];
  }
  try {
    await secure.setItem(KEY, JSON.stringify(legacy));
    await dropLegacyCopy();
  } catch {
    // Keep the AsyncStorage copy until SecureStore accepts the write.
  }
  return legacy;
}

export async function saveTlsPins(pins: TlsPin[]): Promise<void> {
  const normalized = pins.map((pin) => ({
    hostname: pin.hostname.toLowerCase(),
    sha256: normalizeFingerprint(pin.sha256),
  }));
  await (await secureStore()).setItem(KEY, JSON.stringify(normalized));
  await dropLegacyCopy();
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
