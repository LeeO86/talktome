// Operator talk profiles from talktome public/client.js QUALITY_PROFILES @ 0e7002d.

import type { AudioProfileName } from '../protocol/clientDefaults';

export type OpusProfile = {
  codecOptions: {
    opusStereo: boolean;
    opusFec: boolean;
    opusDtx: boolean;
    opusMaxAverageBitrate: number;
    opusPtime: number;
  };
  encodings: { dtx: boolean; maxBitrate: number }[];
};

export const OPUS_PROFILES: Record<AudioProfileName, OpusProfile> = {
  'ultra-low': {
    codecOptions: {
      opusStereo: false,
      opusFec: false,
      opusDtx: false,
      opusMaxAverageBitrate: 48_000,
      opusPtime: 5,
    },
    encodings: [{ dtx: false, maxBitrate: 48_000 }],
  },
  low: {
    codecOptions: {
      opusStereo: false,
      opusFec: false,
      opusDtx: false,
      opusMaxAverageBitrate: 64_000,
      opusPtime: 10,
    },
    encodings: [{ dtx: false, maxBitrate: 64_000 }],
  },
  standard: {
    codecOptions: {
      opusStereo: false,
      opusFec: true,
      opusDtx: false,
      opusMaxAverageBitrate: 64_000,
      opusPtime: 20,
    },
    encodings: [{ dtx: false, maxBitrate: 64_000 }],
  },
};

export const STANDARD_OPUS = OPUS_PROFILES.standard;

/**
 * The mobile app has no quality picker; it keeps its resilient standard
 * profile unless the server admin configured a default audio profile.
 */
export function talkOpusProfile(serverDefault?: AudioProfileName): OpusProfile {
  return (serverDefault && OPUS_PROFILES[serverDefault]) || STANDARD_OPUS;
}

export function talkGumConstraints(processing: {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}) {
  return {
    audio: {
      echoCancellation: processing.echoCancellation,
      noiseSuppression: processing.noiseSuppression,
      autoGainControl: processing.autoGainControl,
      channelCount: 1,
      sampleRate: 48_000,
    },
    video: false,
  } as const;
}

export const TALK_GUM_CONSTRAINTS = talkGumConstraints({
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
});
