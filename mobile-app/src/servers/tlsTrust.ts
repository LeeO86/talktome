// Phase 0.5 Q7: per-host SHA-256 pin. Expo SDK 56 fetch uses ExpoFetchModule
// (not RCTHTTPRequestHandler). The native module pins that stack plus RN XHR.
// JS never sets a global rejectUnauthorized=false.

import { formatFingerprint, isSha256Fingerprint } from './fingerprint';
import { loadTlsPins, pinForHost, saveTlsPins, upsertTlsPin, type TlsPin } from './tlsPins';

export type CertificateProbe = {
  hostname: string;
  sha256: string;
  issuer?: string;
};

type NativeCertTrust = {
  isAvailable?: () => boolean;
  probe?: (url: string) => Promise<CertificateProbe>;
  setPins?: (pins: TlsPin[]) => void;
};

let cachedPins: TlsPin[] = [];

export function rememberedTlsPins(): TlsPin[] {
  return cachedPins;
}

export async function hydrateTlsPins(): Promise<TlsPin[]> {
  cachedPins = await loadTlsPins();
  await applyPinsToNative(cachedPins);
  return cachedPins;
}

export async function rememberTlsPin(pin: TlsPin): Promise<TlsPin[]> {
  cachedPins = upsertTlsPin(cachedPins, pin);
  await saveTlsPins(cachedPins);
  await applyPinsToNative(cachedPins);
  return cachedPins;
}

export function storedPinForHost(hostname: string): TlsPin | undefined {
  return pinForHost(cachedPins, hostname);
}

export async function probeServerCertificate(url: string): Promise<CertificateProbe | null> {
  const native = await loadNativeCertTrust();
  if (!native?.probe) {
    return null;
  }
  try {
    const probe = await native.probe(url);
    if (!probe?.hostname || !isSha256Fingerprint(probe.sha256)) {
      return null;
    }
    return {
      hostname: probe.hostname,
      sha256: probe.sha256,
      issuer: probe.issuer,
    };
  } catch {
    return null;
  }
}

export function describeCertificate(probe: CertificateProbe): string {
  const issuer = probe.issuer ? `\nIssuer: ${probe.issuer}` : '';
  return `${probe.hostname}\nSHA-256: ${formatFingerprint(probe.sha256)}${issuer}`;
}

async function applyPinsToNative(pins: TlsPin[]): Promise<void> {
  const native = await loadNativeCertTrust();
  native?.setPins?.(pins);
}

async function loadNativeCertTrust(): Promise<NativeCertTrust | null> {
  try {
    const { requireNativeModule } = await import('expo-modules-core');
    const native = requireNativeModule('TalkToMeCertTrust') as NativeCertTrust;
    if (native?.isAvailable?.() === false) {
      return null;
    }
    return native;
  } catch {
    return null;
  }
}
