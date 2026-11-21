export function normalizeFingerprint(value: string): string {
  return value.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
}

export function fingerprintsEqual(left: string, right: string): boolean {
  const a = normalizeFingerprint(left);
  const b = normalizeFingerprint(right);
  return a.length === 64 && a === b;
}

export function formatFingerprint(value: string): string {
  const hex = normalizeFingerprint(value);
  if (hex.length !== 64) {
    return value.trim();
  }
  return hex.match(/.{2}/g)?.join(':').toUpperCase() ?? hex.toUpperCase();
}

export function isSha256Fingerprint(value: string): boolean {
  return normalizeFingerprint(value).length === 64;
}
