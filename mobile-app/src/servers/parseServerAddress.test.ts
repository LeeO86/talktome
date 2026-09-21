import { describe, expect, it } from 'vitest';

import { isLikelyLocalHost, parseServerAddress } from './parseServerAddress';

describe('parseServerAddress', () => {
  it('parses a bare host as HTTPS', () => {
    expect(parseServerAddress('intercom.local:8443')).toEqual({
      label: 'intercom.local',
      baseUrl: 'https://intercom.local:8443',
    });
  });

  it('keeps an explicit https URL', () => {
    expect(parseServerAddress('https://intercom.example:8443').baseUrl).toBe(
      'https://intercom.example:8443',
    );
  });

  it('strips a pasted login path', () => {
    expect(parseServerAddress('https://intercom.local/login').baseUrl).toBe(
      'https://intercom.local',
    );
  });

  it('rejects an empty address', () => {
    expect(() => parseServerAddress('   ')).toThrow('The server address is invalid.');
  });

  it('rejects cleartext HTTP', () => {
    expect(() => parseServerAddress('http://intercom.local:8443')).toThrow(
      'The server address must use HTTPS.',
    );
  });
});

describe('isLikelyLocalHost', () => {
  it('recognizes local hosts', () => {
    expect(isLikelyLocalHost('intercom.local')).toBe(true);
    expect(isLikelyLocalHost('192.168.1.25')).toBe(true);
    expect(isLikelyLocalHost('172.20.0.15')).toBe(true);
    expect(isLikelyLocalHost('example.com')).toBe(false);
  });
});
