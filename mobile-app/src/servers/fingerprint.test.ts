import { describe, expect, it } from 'vitest';

import { fingerprintsEqual, formatFingerprint, isSha256Fingerprint, normalizeFingerprint } from './fingerprint';

describe('fingerprint', () => {
  const hex = 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899';

  it('normalizes separators', () => {
    expect(normalizeFingerprint(formatFingerprint(hex))).toBe(hex);
    expect(fingerprintsEqual(hex, formatFingerprint(hex))).toBe(true);
  });

  it('rejects short values', () => {
    expect(isSha256Fingerprint('abcd')).toBe(false);
    expect(fingerprintsEqual(hex, hex.slice(0, 32))).toBe(false);
  });
});
