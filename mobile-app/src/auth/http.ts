import { applySetCookieHeaders, cookieHeader, readSetCookieHeaders, type CookieMap } from './cookieJar';

export type HttpClientOptions = {
  baseUrl: string;
  getCookies: () => CookieMap;
  setCookies: (next: CookieMap) => void;
  fetchImpl?: typeof fetch;
};

export class TalkToMeHttp {
  constructor(private readonly options: HttpClientOptions) {}

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const headers = new Headers(init.headers);
    const cookie = cookieHeader(this.options.getCookies());
    if (cookie && !headers.has('Cookie')) {
      headers.set('Cookie', cookie);
    }

    const response = await fetchImpl(joinUrl(this.options.baseUrl, path), {
      ...init,
      // iOS appends supplied Cookie headers to native cookies when credentials
      // are included. Use our explicit jar alone once it contains a cookie.
      credentials: init.credentials ?? (headers.has('Cookie') ? 'omit' : 'include'),
      headers,
    });

    const next = applySetCookieHeaders(this.options.getCookies(), readSetCookieHeaders(response.headers));
    this.options.setCookies(next);
    return response;
  }
}

export function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

export async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
