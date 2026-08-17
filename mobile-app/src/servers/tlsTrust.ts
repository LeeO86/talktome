// Phase 0.5 Q7: per-host SHA-256 pin. RN fetch/Socket.IO use the system stack;
// the local Expo module installs the pin into that stack. JS never sets a
// global rejectUnauthorized=false.

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
  applyPinsToNative(cachedPins);
  return cachedPins;
}

export async function rememberTlsPin(pin: TlsPin): Promise<TlsPin[]> {
  cachedPins = upsertTlsPin(cachedPins, pin);
  await saveTlsPins(cachedPins);
  applyPinsToNative(cachedPins);
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
  const probe = await native.probe(url);
  if (!probe?.hostname || !isSha256Fingerprint(probe.sha256)) {
    return null;
  }
  return {
    hostname: probe.hostname,
    sha256: probe.sha256,
    issuer: probe.issuer,
  };
}

export function describeCertificate(probe: CertificateProbe): string {
  const issuer = probe.issuer ? `\nIssuer: ${probe.issuer}` : '';
  return `${probe.hostname}\nSHA-256: ${formatFingerprint(probe.sha256)}${issuer}`;
}

function applyPinsToNative(pins: TlsPin[]): void {
  void loadNativeCertTrust().then((native) => {
    native?.setPins?.(pins);
  });
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
