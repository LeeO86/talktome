import { describe, expect, it } from 'vitest';

import { compareAppVersion, requiresBrowserSessionCookie } from './serverCapabilities';

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
});
