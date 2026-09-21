import { InvalidServerAddressError, parseServerAddress } from './parseServerAddress';

export type ParsedConnectPayload = {
  serverAddress?: string;
  token?: string;
};

const BARE_TOKEN = /^[A-Za-z0-9_-]{16,}$/;

export function parseConnectPayload(input: string): ParsedConnectPayload {
  const trimmed = input.trim();
  if (!trimmed) {
    return {};
  }

  if (trimmed.startsWith('#') || trimmed.toLowerCase().startsWith('login=')) {
    const hash = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
    const token = new URLSearchParams(hash).get('login')?.trim();
    return token ? { token } : {};
  }

  if (BARE_TOKEN.test(trimmed) && !trimmed.includes('.')) {
    return { token: trimmed };
  }

  const candidate = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return {};
  }

  if (url.protocol !== 'https:') {
    return {};
  }

  const token =
    new URLSearchParams(url.hash.replace(/^#/, '')).get('login')?.trim() ||
    url.searchParams.get('login')?.trim() ||
    undefined;

  let serverAddress: string | undefined;
  try {
    serverAddress = parseServerAddress(trimmed).baseUrl;
  } catch (error) {
    if (!(error instanceof InvalidServerAddressError)) {
      throw error;
    }
  }

  return {
    ...(serverAddress ? { serverAddress } : {}),
    ...(token ? { token } : {}),
  };
}
