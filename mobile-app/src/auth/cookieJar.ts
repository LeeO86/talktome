export const SESSION_COOKIE_NAME = 'talktome_session';

export type CookieMap = Record<string, string>;

export function splitSetCookieHeader(header: string): string[] {
  const cookies: string[] = [];
  let current = '';
  const parts = header.split(',');
  for (const part of parts) {
    if (/^\s*[A-Za-z0-9_\-.]+=/.test(part) && current) {
      cookies.push(current.trim());
      current = part;
    } else if (current) {
      current += `,${part}`;
    } else {
      current = part;
    }
  }
  if (current.trim()) {
    cookies.push(current.trim());
  }
  return cookies;
}

export function readSetCookieHeaders(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetSetCookie.getSetCookie === 'function') {
    const values = withGetSetCookie.getSetCookie();
    if (values.length > 0) {
      return values;
    }
  }

  const fromEntries: string[] = [];
  headers.forEach((value, name) => {
    if (name.toLowerCase() === 'set-cookie' && value) {
      fromEntries.push(...splitSetCookieHeader(value));
    }
  });
  if (fromEntries.length > 0) {
    return fromEntries;
  }

  const raw = headers.get('set-cookie') ?? headers.get('Set-Cookie');
  if (!raw) {
    return [];
  }
  return splitSetCookieHeader(raw);
}

export function parseSetCookie(setCookie: string): { name: string; value: string } | null {
  const first = setCookie.split(';')[0]?.trim() ?? '';
  const eq = first.indexOf('=');
  if (eq <= 0) {
    return null;
  }
  const name = first.slice(0, eq).trim();
  const value = first.slice(eq + 1).trim();
  if (!name || !value) {
    return null;
  }
  return { name, value };
}

export function applySetCookieHeaders(jar: CookieMap, headers: string[]): CookieMap {
  const next = { ...jar };
  for (const header of headers) {
    const parsed = parseSetCookie(header);
    if (parsed) {
      next[parsed.name] = parsed.value;
    }
  }
  return next;
}

export function cookieHeader(jar: CookieMap): string | undefined {
  const entries = Object.entries(jar);
  if (entries.length === 0) {
    return undefined;
  }
  return entries.map(([name, value]) => `${name}=${value}`).join('; ');
}

export function sessionCookie(jar: CookieMap): string | undefined {
  return jar[SESSION_COOKIE_NAME];
}
