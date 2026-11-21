import { isLikelyLocalHost } from '../servers/parseServerAddress';
import { collectErrorText, looksLikeTlsFailure } from '../servers/tlsFailure';

// iOS can reject the first LAN request before the privacy prompt is answered.
// See Apple TN3179. Retry only reads and only the native offline error; never
// replay a login POST or hide a certificate failure.
const RETRY_DELAYS_MS = [500, 1000, 2000, 3000, 4000];

export class LocalNetworkUnavailableError extends Error {
  constructor() {
    super('Cannot reach this local server. Check Wi-Fi and allow Talktome in Settings → Privacy & Security → Local Network.');
    this.name = 'LocalNetworkUnavailableError';
  }
}

export async function fetchWithLocalNetworkRetry(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const canRetry = ['GET', 'HEAD'].includes(method) && isLikelyLocalHost(new URL(url).hostname);

  for (let attempt = 0; ; attempt += 1) {
    throwIfAborted(init.signal);
    try {
      return await fetchImpl(url, init);
    } catch (error) {
      throwIfAborted(init.signal);
      if (!canRetry || looksLikeTlsFailure(error) || !isOfflineError(error)) {
        throw error;
      }
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined) {
        throw new LocalNetworkUnavailableError();
      }
      await waitForRetry(delay, init.signal);
    }
  }
}

function isOfflineError(error: unknown): boolean {
  return /internet connection appears to be offline|not connected to the internet|NSURLErrorNotConnectedToInternet|(?:NSURLErrorDomain|code)\s*[=:]?\s*-1009\b/i.test(collectErrorText(error));
}

function throwIfAborted(signal?: AbortSignal | null): void {
  if (signal?.aborted) {
    const error = new Error('Request cancelled.');
    error.name = 'AbortError';
    throw signal.reason ?? error;
  }
}

function waitForRetry(delay: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      try {
        throwIfAborted(signal);
      } catch (error) {
        reject(error);
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delay);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}
