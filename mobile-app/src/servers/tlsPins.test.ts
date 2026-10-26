import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadTlsPins, parseStoredTlsPins, saveTlsPins } from './tlsPins';

const secure = vi.hoisted(() => new Map<string, string>());
const legacy = vi.hoisted(() => new Map<string, string>());

vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => secure.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    secure.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    secure.delete(key);
  },
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => legacy.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      legacy.set(key, value);
    },
    removeItem: async (key: string) => {
      legacy.delete(key);
    },
  },
}));

const PIN = {
  hostname: 'intercom.local',
  sha256: 'ab'.repeat(32),
};

describe('parseStoredTlsPins', () => {
  it('keeps only host pins with a SHA-256 fingerprint', () => {
    expect(parseStoredTlsPins(JSON.stringify([PIN, { hostname: 'x', sha256: 'nope' }]))).toEqual([PIN]);
    expect(parseStoredTlsPins('not-json')).toEqual([]);
  });
});

describe('loadTlsPins', () => {
  beforeEach(() => {
    secure.clear();
    legacy.clear();
  });

  it('moves an AsyncStorage pin list into SecureStore', async () => {
    legacy.set('talktome.tls-pins', JSON.stringify([PIN]));
    await expect(loadTlsPins()).resolves.toEqual([PIN]);
    expect(JSON.parse(secure.get('talktome.tls-pins') ?? '')).toEqual([PIN]);
    expect(legacy.has('talktome.tls-pins')).toBe(false);
  });

  it('prefers SecureStore once a copy exists', async () => {
    secure.set('talktome.tls-pins', JSON.stringify([PIN]));
    legacy.set('talktome.tls-pins', JSON.stringify([{ hostname: 'old.example', sha256: 'cd'.repeat(32) }]));
    await expect(loadTlsPins()).resolves.toEqual([PIN]);
    expect(legacy.has('talktome.tls-pins')).toBe(false);
  });

  it('writes new pins only to SecureStore', async () => {
    await saveTlsPins([PIN]);
    expect(JSON.parse(secure.get('talktome.tls-pins') ?? '')).toEqual([PIN]);
    expect(legacy.has('talktome.tls-pins')).toBe(false);
  });
});
