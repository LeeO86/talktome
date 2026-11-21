import { Platform } from 'react-native';

import { audioSessionCapabilityReason } from '../audio/policy';
import { fgsCapabilityReason } from './fgs';

export type CapabilityTier = 'audio-session' | 'fgs' | 'foreground';

export function advertisedCapability(input: {
  fgsRunning?: boolean;
  audioSessionAvailable?: boolean;
  audioSessionActive?: boolean;
  audioKeepalive?: boolean;
} = {}): { tier: CapabilityTier; reason: string } {
  if (Platform.OS === 'ios') {
    return {
      tier: 'audio-session',
      reason: audioSessionCapabilityReason({
        available: input.audioSessionAvailable ?? false,
        active: input.audioSessionActive ?? false,
        keepalive: input.audioKeepalive ?? false,
      }),
    };
  }
  return {
    tier: 'fgs',
    reason: fgsCapabilityReason(input.fgsRunning === true),
  };
}
