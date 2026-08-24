import { describe, expect, it } from 'vitest';

import { TalkToMeHttp } from './http';
import { ApiClient } from './apiClient';
import { FeedLoginNotSupportedError, InvalidCredentialsError } from './errors';
import type { CookieMap } from './cookieJar';

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url, init);
  };
}

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function clientWith(fetchImpl: typeof fetch, cookies: CookieMap = {}) {
  let jar = cookies;
  const http = new TalkToMeHttp({
    baseUrl: 'https://intercom.local',
    getCookies: () => jar,
    setCookies: (next) => {
      jar = next;
    },
    fetchImpl,
  });
  return { client: new ApiClient(http), getCookies: () => jar };
}

describe('ApiClient', () => {
  it('posts credentials to /login and stores the session cookie', async () => {
    const { client, getCookies } = clientWith(
      mockFetch(async (url, init) => {
        expect(url).toBe('https://intercom.local/login');
        expect(init?.method).toBe('POST');
        expect(init?.credentials).toBe('include');
        expect(JSON.parse(String(init?.body))).toEqual({ name: 'alice', password: 'secret' });
        return jsonResponse(
          200,
          {
            id: 5,
            name: 'alice',
            kind: 'user',
            productions: [{ id: 2, name: 'Test-von-Adi' }],
          },
          { 'set-cookie': 'talktome_session=cookie-1; HttpOnly; Secure' },
        );
      }),
    );

    const identity = await client.login('alice', 'secret');
    expect(identity).toEqual({
      id: 5,
      name: 'alice',
      kind: 'user',
      productions: [{ id: 2, name: 'Test-von-Adi' }],
    });
    expect(getCookies().talktome_session).toBe('cookie-1');
  });

  it('maps 401 to invalid credentials', async () => {
    const { client } = clientWith(
      mockFetch(async () => jsonResponse(401, { error: 'Invalid credentials' })),
    );
    await expect(client.login('alice', 'wrong')).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('rejects feed logins', async () => {
    const { client } = clientWith(
      mockFetch(async () => jsonResponse(200, { id: 1, name: 'program', kind: 'feed' })),
    );
    await expect(client.login('program', 'secret')).rejects.toBeInstanceOf(FeedLoginNotSupportedError);
  });

  it('posts a login token to /login/token', async () => {
    const { client, getCookies } = clientWith(
      mockFetch(async (url, init) => {
        expect(url).toBe('https://intercom.local/login/token');
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual({ token: 'abcDEF1234567890' });
        return jsonResponse(
          200,
          { id: 5, name: 'alice', kind: 'user', productions: [] },
          { 'set-cookie': 'talktome_session=cookie-2; HttpOnly; Secure' },
        );
      }),
    );

    await expect(client.loginToken('abcDEF1234567890')).resolves.toEqual({
      id: 5,
      name: 'alice',
      kind: 'user',
      productions: [],
    });
    expect(getCookies().talktome_session).toBe('cookie-2');
  });

  it('maps an invalid login token to invalid credentials', async () => {
    const { client } = clientWith(
      mockFetch(async () => jsonResponse(401, { error: 'Invalid or expired login link' })),
    );
    await expect(client.loginToken('nope')).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('decodes the targets grid', async () => {
    const { client } = clientWith(
      mockFetch(async (url) => {
        expect(url).toBe('https://intercom.local/users/7/targets?includeMemberships=1');
        return jsonResponse(200, [
          { targetType: 'user', targetId: 11, name: 'Stage Left' },
          { targetType: 'conference', targetId: 2, name: 'All', canTalk: false },
          { targetType: 'feed', targetId: 5, name: 'Program' },
        ]);
      }),
    );

    await expect(client.fetchTargets(7)).resolves.toEqual([
      { type: 'user', id: 11, label: 'Stage Left', canTalk: true },
      { type: 'conference', id: 2, label: 'All', canTalk: false, members: [] },
      { type: 'feed', id: 5, label: 'Program', canTalk: true },
    ]);
  });

  it('posts guest login without a session cookie', async () => {
    const { client, getCookies } = clientWith(
      mockFetch(async (url, init) => {
        expect(url).toBe('https://intercom.local/login/guest');
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual({ name: 'Visitor' });
        return jsonResponse(200, {
          kind: 'guest',
          guestId: 'g-1',
          guestProfileUserId: 4,
          name: 'Visitor',
          productions: [{ id: 2, name: 'Show' }],
        });
      }),
    );

    await expect(client.loginGuest('Visitor')).resolves.toEqual({
      id: 'g-1',
      name: 'Visitor',
      kind: 'guest',
      guestId: 'g-1',
      guestProfileUserId: 4,
      productions: [{ id: 2, name: 'Show' }],
    });
    expect(getCookies()).toEqual({});
  });

  it('loads guest targets from /guest/targets', async () => {
    const { client } = clientWith(
      mockFetch(async (url) => {
        expect(url).toBe('https://intercom.local/guest/targets?productionId=2');
        return jsonResponse(200, [{ targetType: 'conference', targetId: 1, name: 'All' }]);
      }),
    );
    await expect(client.fetchGuestTargets(2)).resolves.toEqual([
      { type: 'conference', id: 1, label: 'All', canTalk: true, members: [] },
    ]);
  });

  it('passes productionId when a production is selected', async () => {
    const { client } = clientWith(
      mockFetch(async (url) => {
        expect(url).toBe(
          'https://intercom.local/users/7/targets?includeMemberships=1&productionId=2',
        );
        return jsonResponse(200, []);
      }),
    );
    await expect(client.fetchTargets(7, 2)).resolves.toEqual([]);
  });
});
