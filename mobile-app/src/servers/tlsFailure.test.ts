import { describe, expect, it } from 'vitest';

import { collectErrorText, looksLikeTlsFailure } from './tlsFailure';

describe('looksLikeTlsFailure', () => {
  it('matches Expo fetch wrapping of an iOS certificate rejection', () => {
    const error = new Error(
      'fetch failed: UnexpectedException: The certificate for this server is invalid. You might be connecting to a server that is pretending to be "192.168.178.166" which could put your confidential information at risk. (at ExpoModulesCore/Promise.swift:56)',
    );
    expect(looksLikeTlsFailure(error)).toBe(true);
  });

  it('matches a TypeError whose cause holds the certificate text', () => {
    const cause = new Error('The certificate for this server is invalid.');
    const error = new TypeError('fetch failed');
    error.cause = cause;
    expect(collectErrorText(error)).toContain('certificate');
    expect(looksLikeTlsFailure(error)).toBe(true);
  });

  it('does not treat a refused TCP connection as TLS', () => {
    expect(looksLikeTlsFailure(new Error('fetch failed: Could not connect to the server.'))).toBe(false);
    expect(looksLikeTlsFailure(new Error('Network request failed'))).toBe(false);
  });
});
