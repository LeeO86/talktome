/** TalkToMe v1.2.1 tied Socket.IO register-user to HttpOnly `talktome_session`.
 * v1.1.3 and earlier authenticate register-user from the login JSON body only. */
export const BROWSER_SESSION_SINCE = '1.2.1';

export function parseAppVersion(value: string | null | undefined): [number, number, number] | null {
  const match = String(value ?? '')
    .trim()
    .match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

export function compareAppVersion(left: string, right: string): number | null {
  const a = parseAppVersion(left);
  const b = parseAppVersion(right);
  if (!a || !b) {
    return null;
  }
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) {
      return a[i] - b[i];
    }
  }
  return 0;
}

export function requiresBrowserSessionCookie(appVersion?: string | null): boolean {
  const cmp = compareAppVersion(appVersion ?? '', BROWSER_SESSION_SINCE);
  return cmp != null && cmp >= 0;
}
