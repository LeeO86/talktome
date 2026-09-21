const KEY = 'talktome.talk-link-token';

/**
 * `talktome://talk` can be opened by any app or page. Transmission is allowed
 * only when the link carries this install's token. Lock Screen and the widget
 * talk through Darwin notifications and do not use this URL.
 */
export function talkLinkAuthorizes(url: string, expectedToken: string | null | undefined): boolean {
  if (!expectedToken) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'talktome:') {
    return false;
  }
  const path = `${parsed.host}${parsed.pathname}`.replace(/\/+$/, '').replace(/^\/+/, '');
  if (path !== 'talk') {
    return false;
  }
  return parsed.searchParams.get('token') === expectedToken;
}

export async function loadTalkLinkToken(): Promise<string> {
  const SecureStore = await import('expo-secure-store');
  const existing = await SecureStore.getItemAsync(KEY);
  if (existing) {
    return existing;
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const token = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  await SecureStore.setItemAsync(KEY, token);
  return token;
}
