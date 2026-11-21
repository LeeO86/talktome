// Derived from talktome-apple ServerAddressParser.swift @ 004d6e76 by Daniel Jocher.

export class InvalidServerAddressError extends Error {
  constructor(message = 'The server address is invalid.') {
    super(message);
    this.name = 'InvalidServerAddressError';
  }
}

export type ParsedServerAddress = {
  label: string;
  baseUrl: string;
};

export function parseServerAddress(input: string): ParsedServerAddress {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new InvalidServerAddressError();
  }

  const candidate = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new InvalidServerAddressError();
  }

  if (url.protocol === 'http:') {
    throw new InvalidServerAddressError('The server address must use HTTPS.');
  }
  if (url.protocol !== 'https:') {
    throw new InvalidServerAddressError();
  }
  if (!url.hostname) {
    throw new InvalidServerAddressError();
  }

  if (url.pathname && url.pathname !== '/') {
    const trimmedPath = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
    const parts = trimmedPath.split('/').filter(Boolean);
    parts.pop();
    url.pathname = parts.length > 0 ? `/${parts.join('/')}` : '';
  } else {
    url.pathname = '';
  }
  url.search = '';
  url.hash = '';

  return {
    label: url.hostname,
    baseUrl: url.toString().replace(/\/$/, ''),
  };
}

export function isLikelyLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.localhost')) {
    return true;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) {
    return false;
  }
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  if (a === 10 || a === 127) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  return false;
}
