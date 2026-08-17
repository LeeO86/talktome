import { describe, expect, it } from 'vitest';

import { SESSION_COOKIE_NAME } from './cookieJar';
import { cookiesFromNativeRecords, hasSessionCookie, readNativeCookies } from './nativeCookies';

describe('nativeCookies', () => {
  it('copies name/value pairs from the native cookie store', () => {
    expect(
      cookiesFromNativeRecords({
        [SESSION_COOKIE_NAME]: { value: 'native-token' },
        other: { value: '' },
      }),
    ).toEqual({ [SESSION_COOKIE_NAME]: 'native-token' });
  });

  it('reads through an injected native source', async () => {
    const jar = await readNativeCookies('https://intercom.local', {
      get: async () => ({ [SESSION_COOKIE_NAME]: { value: 'from-native' } }),
    });
    expect(hasSessionCookie(jar)).toBe(true);
    expect(jar[SESSION_COOKIE_NAME]).toBe('from-native');
  });

  it('returns an empty jar when the native module is unavailable', async () => {
    await expect(readNativeCookies('https://intercom.local', null)).resolves.toEqual({});
  });
});
