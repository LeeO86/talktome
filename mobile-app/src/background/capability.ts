import { Platform } from 'react-native';

import { audioSessionCapabilityReason, iosPttEnabled } from '../audio/policy';
import { pttCapabilityReason } from '../ptt/policy';
import { fgsCapabilityReason } from './fgs';

export type CapabilityTier = 'ptt' | 'audio-session' | 'fgs' | 'foreground';

export function advertisedCapability(input: {
  fgsRunning?: boolean;
  audioSessionAvailable?: boolean;
  audioSessionActive?: boolean;
  audioKeepalive?: boolean;
  pttAvailable?: boolean;
  pttBootstrapEnabled?: boolean;
  pttJoined?: boolean;
  pttVerified?: boolean;
} = {}): { tier: CapabilityTier; reason: string } {
  if (Platform.OS === 'ios') {
    if (iosPttEnabled()) {
      return {
        tier: 'ptt',
        reason: pttCapabilityReason({
          enabledInBuild: true,
          nativeAvailable: input.pttAvailable === true,
          bootstrapEnabled: input.pttBootstrapEnabled === true,
          joined: input.pttJoined === true,
          verified: input.pttVerified === true,
        }),
      };
    }
    return {
      tier: 'audio-session',
      reason: audioSessionCapabilityReason({
        available: input.audioSessionAvailable ?? false,
        active: input.audioSessionActive ?? false,
        keepalive: input.audioKeepalive ?? false,
        pttEnabled: false,
      }),
    };
  }
  return {
    tier: 'fgs',
    reason: fgsCapabilityReason(input.fgsRunning === true),
  };
}
