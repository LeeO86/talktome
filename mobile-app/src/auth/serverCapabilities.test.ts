import { describe, expect, it } from 'vitest';

import {
  compareAppVersion,
  requiresBrowserSessionCookie,
  supportsActiveProduction,
  supportsServerHeartbeat,
} from './serverCapabilities';

describe('serverCapabilities', () => {
  it('does not require a session cookie on v1.1.3', () => {
    expect(requiresBrowserSessionCookie('1.1.3')).toBe(false);
    expect(requiresBrowserSessionCookie(undefined)).toBe(false);
  });

  it('requires a session cookie from v1.2.1', () => {
    expect(requiresBrowserSessionCookie('1.2.1')).toBe(true);
    expect(requiresBrowserSessionCookie('1.2.5')).toBe(true);
    expect(compareAppVersion('1.2.0', '1.2.1')).toBeLessThan(0);
  });

  it('announces active production from v1.5.0', () => {
    expect(supportsActiveProduction('1.4.4')).toBe(false);
    expect(supportsActiveProduction('1.5.0')).toBe(true);
    expect(supportsActiveProduction('1.5.4')).toBe(true);
    expect(supportsActiveProduction(undefined)).toBeNull();
  });

  it('heartbeats only from v1.5.6', () => {
    expect(supportsServerHeartbeat('1.5.5')).toBe(false);
    expect(supportsServerHeartbeat('1.5.6')).toBe(true);
    expect(supportsServerHeartbeat('1.6.0')).toBe(true);
    expect(supportsServerHeartbeat(undefined)).toBe(false);
  });
});
