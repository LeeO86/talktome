import { describe, expect, it } from 'vitest';

import {
  applySetCookieHeaders,
  cookieHeader,
  parseSetCookie,
  readSetCookieHeaders,
  SESSION_COOKIE_NAME,
  sessionCookie,
  splitSetCookieHeader,
} from './cookieJar';

describe('cookieJar', () => {
  it('parses a TalkToMe session cookie', () => {
    const parsed = parseSetCookie(
      `${SESSION_COOKIE_NAME}=abc123; Max-Age=43200000; Path=/; HttpOnly; Secure; SameSite=Lax`,
    );
    expect(parsed).toEqual({ name: SESSION_COOKIE_NAME, value: 'abc123' });
  });

  it('builds a Cookie header from the jar', () => {
    const jar = applySetCookieHeaders({}, [
      `${SESSION_COOKIE_NAME}=token-1; HttpOnly; Secure`,
    ]);
    expect(sessionCookie(jar)).toBe('token-1');
    expect(cookieHeader(jar)).toBe(`${SESSION_COOKIE_NAME}=token-1`);
  });

  it('does not split Expires dates as extra cookies', () => {
    const headers = splitSetCookieHeader(
      'talktome_session=abc; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Path=/',
    );
    expect(headers).toHaveLength(1);
    expect(parseSetCookie(headers[0] ?? '')).toEqual({
      name: 'talktome_session',
      value: 'abc',
    });
  });

  it('reads Set-Cookie from header iteration when getSetCookie is empty', () => {
    const headers = {
      getSetCookie: () => [],
      get: () => null,
      forEach: (callback: (value: string, name: string) => void) => {
        callback('application/json', 'content-type');
        callback(
          `${SESSION_COOKIE_NAME}=token-2; HttpOnly; Secure; SameSite=Lax`,
          'set-cookie',
        );
      },
    } as unknown as Headers;
    const values = readSetCookieHeaders(headers);
    expect(values.some((header) => header.includes('token-2'))).toBe(true);
  });
});
