// Standard operator talk profile from talktome public/client.js QUALITY_PROFILES @ bbb8e09.

export const STANDARD_OPUS = {
  codecOptions: {
    opusStereo: false,
    opusFec: true,
    opusDtx: false,
    opusMaxAverageBitrate: 64_000,
    opusPtime: 20,
  },
  encodings: [{ dtx: false, maxBitrate: 64_000 }],
};

export const TALK_GUM_CONSTRAINTS = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1,
    sampleRate: 48_000,
  },
  video: false,
} as const;
