import { SESSION_COOKIE_NAME, type CookieMap } from './cookieJar';

export type NativeCookieRecord = { value?: string };
export type NativeCookieSource = {
  get: (url: string) => Promise<Record<string, NativeCookieRecord>>;
};

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
  try {
    return cookiesFromNativeRecords(await manager.get(url));
  } catch {
    return {};
  }
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
