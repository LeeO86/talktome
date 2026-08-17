import type { IceServer } from '../protocol/types';

export type TlsMode = 'system' | 'trust-fingerprint';

export type ServerProfile = {
  id: string;
  label: string;
  baseUrl: string;
  tls: TlsMode;
  certSha256?: string;
  iceOverride?: IceServer[];
  lastIdentity?: { name: string };
};

export function createProfile(input: { label: string; baseUrl: string }): ServerProfile {
  return {
    id: `${input.baseUrl}::${Date.now()}`,
    label: input.label,
    baseUrl: input.baseUrl,
    tls: 'system',
  };
}
