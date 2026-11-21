import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClient } from './apiClient';
import { TalkToMeHttp } from './http';
import { fetchWithLocalNetworkRetry, LocalNetworkUnavailableError } from './localNetworkRetry';

const server = 'https://192.168.178.166:8443';
const offline = () => new Error('fetch failed: UnexpectedException: The Internet connection appears to be offline. (at ExpoModulesCore/Promise.swift:56)');

afterEach(() => vi.useRealTimers());

describe('iOS local network startup', () => {
  it('waits through the initial LAN failures, then sends the QR login token once', async () => {
    vi.useFakeTimers();
    let healthAttempts = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      if (String(url).endsWith('/api/v1/health')) {
        if (++healthAttempts <= 2) throw offline();
        return new Response(JSON.stringify({ ok: true, appVersion: '1.5.19' }));
      }
      expect(String(url)).toBe(`${server}/login/token`);
      expect(init?.method).toBe('POST');
      return new Response(JSON.stringify({ id: 1, name: 'Daniel', kind: 'user' }));
    });
    const api = new ApiClient(new TalkToMeHttp({
      baseUrl: server, getCookies: () => ({}), setCookies: () => {},
      fetchImpl, retryLocalNetworkErrors: true,
    }));
    const login = (async () => {
      await api.health();
      return api.loginToken('qr-token');
    })();
    await vi.runAllTimersAsync();
    expect((await login).name).toBe('Daniel');
    expect(healthAttempts).toBe(3);
    expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it('reports a useful error after a bounded wait when the local server stays unreachable', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(offline());
    const failed = expect(fetchWithLocalNetworkRetry(fetchImpl, `${server}/api/v1/health`, {}))
      .rejects.toBeInstanceOf(LocalNetworkUnavailableError);
    await vi.runAllTimersAsync();
    await failed;
    expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(new LocalNetworkUnavailableError().message).toContain('Local Network');
  });

  it('does not retry login POSTs even for the native offline error', async () => {
    const error = offline();
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(error);
    await expect(fetchWithLocalNetworkRetry(fetchImpl, `${server}/login/token`, { method: 'POST' }))
      .rejects.toBe(error);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    new Error('The certificate for this server is invalid.'),
    new Error('Could not connect to the server.'),
    new Error('fetch failed: Fetch request has been canceled'),
  ])('does not retry certificate, unrelated connection or cancellation errors: %s', async error => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(error);
    await expect(fetchWithLocalNetworkRetry(fetchImpl, `${server}/api/v1/health`, {})).rejects.toBe(error);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not apply the local-network workaround to public servers', async () => {
    const error = offline();
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(error);
    await expect(fetchWithLocalNetworkRetry(fetchImpl, 'https://intercom.example.com/api/v1/health', {}))
      .rejects.toBe(error);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps the default HTTP behavior for clients that do not opt in', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(offline());
    const http = new TalkToMeHttp({ baseUrl: server, getCookies: () => ({}), setCookies: () => {}, fetchImpl });
    await expect(http.request('/api/v1/health')).rejects.toThrow('appears to be offline');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not retry HTTP error responses', async () => {
    const response = new Response('Unauthorized', { status: 401 });
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
    expect(await fetchWithLocalNetworkRetry(fetchImpl, `${server}/login/options`, {})).toBe(response);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending retry without making another request', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(offline());
    const failed = expect(fetchWithLocalNetworkRetry(fetchImpl, `${server}/api/v1/health`, {
      signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(250);
    controller.abort();
    await failed;
    await vi.runAllTimersAsync();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
