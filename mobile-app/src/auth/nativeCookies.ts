import { SESSION_COOKIE_NAME, type CookieMap } from './cookieJar';

export type NativeCookieRecord = { name?: string; value?: string };
export type NativeCookieSource = {
  get: (url: string) => Promise<Record<string, NativeCookieRecord>>;
  getAll?: () => Promise<Record<string, NativeCookieRecord>>;
  getAsArray?: (url: string) => Promise<readonly NativeCookieRecord[]>;
};

export function cookieLookupUrls(baseUrl: string): string[] {
  const origin = baseUrl.replace(/\/$/, '');
  return [`${origin}/login`, `${origin}/`, origin];
}

export function cookiesFromNativeRecords(
  cookies: Record<string, NativeCookieRecord> | null | undefined,
): CookieMap {
  const jar: CookieMap = {};
  for (const [name, cookie] of Object.entries(cookies ?? {})) {
    if (name && cookie?.value) {
      jar[name] = cookie.value;
    }
  }
  return jar;
}

export async function readNativeCookies(
  url: string,
  source?: NativeCookieSource | null,
): Promise<CookieMap> {
  const manager = source === undefined ? await loadNativeCookieSource() : source;
  if (!manager) {
    return {};
  }
  const jar: CookieMap = {};
  try {
    for (const candidate of cookieLookupUrls(url)) {
      Object.assign(jar, cookiesFromNativeRecords(await manager.get(candidate)));
      if (manager.getAsArray) {
        for (const cookie of await manager.getAsArray(candidate)) {
          const name = cookie.name ?? '';
          if (name && cookie.value) {
            jar[name] = cookie.value;
          }
        }
      }
      if (hasSessionCookie(jar)) {
        return jar;
      }
    }
    if (manager.getAll) {
      Object.assign(jar, cookiesFromNativeRecords(await manager.getAll()));
    }
  } catch {
    return jar;
  }
  return jar;
}

async function loadNativeCookieSource(): Promise<NativeCookieSource | null> {
  try {
    const mod = await import('@preeternal/react-native-cookie-manager');
    const manager = mod.default;
    return typeof manager?.get === 'function' ? manager : null;
  } catch {
    return null;
  }
}

export function hasSessionCookie(jar: CookieMap): boolean {
  return Boolean(jar[SESSION_COOKIE_NAME]);
}
