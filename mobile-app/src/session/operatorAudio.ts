import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_DIM_AMOUNT_DB,
  DIM_AMOUNT_DB_OPTIONS,
  migrateDimAmountDb,
  type ServerClientDefaults,
} from '../protocol/clientDefaults';

const KEY = 'talktome.operator-audio';

export const FEED_DIM_DB_OPTIONS = DIM_AMOUNT_DB_OPTIONS;
export const DEFAULT_FEED_DIM_DB = DEFAULT_DIM_AMOUNT_DB;

export type OperatorAudioSettings = {
  feedDimSelf: boolean;
  feedDimIncoming: boolean;
  feedDimDb: number;
  /** Web client "Play connection sounds". Disconnect and reconnect tones. */
  playConnectionSounds: boolean;
  volumeFader: boolean;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  audioRouteId: string;
};

export const DEFAULT_OPERATOR_AUDIO: OperatorAudioSettings = {
  feedDimSelf: false,
  feedDimIncoming: true,
  feedDimDb: DEFAULT_FEED_DIM_DB,
  playConnectionSounds: true,
  volumeFader: false,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  audioRouteId: 'speaker',
};

const BOOLEAN_KEYS = [
  'feedDimSelf',
  'feedDimIncoming',
  'playConnectionSounds',
  'volumeFader',
  'echoCancellation',
  'noiseSuppression',
  'autoGainControl',
] as const;

export function normalizeOperatorAudio(
  value?: Partial<OperatorAudioSettings> | null,
): OperatorAudioSettings {
  return {
    feedDimSelf: Boolean(value?.feedDimSelf),
    feedDimIncoming: value?.feedDimIncoming !== false,
    feedDimDb: normalizeFeedDimDb(value?.feedDimDb),
    playConnectionSounds: value?.playConnectionSounds !== false,
    volumeFader: Boolean(value?.volumeFader),
    echoCancellation: value?.echoCancellation !== false,
    noiseSuppression: value?.noiseSuppression !== false,
    autoGainControl: value?.autoGainControl !== false,
    audioRouteId:
      typeof value?.audioRouteId === 'string' && value.audioRouteId.trim()
        ? value.audioRouteId.trim()
        : DEFAULT_OPERATOR_AUDIO.audioRouteId,
  };
}

/**
 * Server-configured defaults mapped onto the mobile settings shape. These only
 * fill keys the user has never touched on this device; explicit choices win,
 * matching the web client's localStorage-over-server precedence.
 */
export function operatorAudioServerDefaults(
  defaults: ServerClientDefaults,
): Partial<OperatorAudioSettings> {
  const mapped: Partial<OperatorAudioSettings> = {};
  if (typeof defaults.dimAmountDb === 'number') {
    mapped.feedDimDb = normalizeFeedDimDb(defaults.dimAmountDb);
  }
  if (typeof defaults.dimFeedsWhileSpeaking === 'boolean') {
    mapped.feedDimSelf = defaults.dimFeedsWhileSpeaking;
  }
  if (typeof defaults.dimWhenAddressed === 'boolean') {
    mapped.feedDimIncoming = defaults.dimWhenAddressed;
  }
  if (typeof defaults.playConnectionSounds === 'boolean') {
    mapped.playConnectionSounds = defaults.playConnectionSounds;
  }
  if (typeof defaults.audioAutoProcessing === 'boolean') {
    mapped.echoCancellation = defaults.audioAutoProcessing;
    mapped.noiseSuppression = defaults.audioAutoProcessing;
    mapped.autoGainControl = defaults.audioAutoProcessing;
  }
  return mapped;
}

export function resolveOperatorAudio(
  overrides: Partial<OperatorAudioSettings>,
  serverDefaults: ServerClientDefaults = {},
): OperatorAudioSettings {
  return normalizeOperatorAudio({
    ...DEFAULT_OPERATOR_AUDIO,
    ...operatorAudioServerDefaults(serverDefaults),
    ...overrides,
  });
}

export function normalizeFeedDimDb(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_FEED_DIM_DB;
  }
  const migrated = migrateDimAmountDb(value);
  if (FEED_DIM_DB_OPTIONS.includes(migrated as (typeof FEED_DIM_DB_OPTIONS)[number])) {
    return migrated;
  }
  return DEFAULT_FEED_DIM_DB;
}

export function sliderPositionFromDimDb(db: number): number {
  const index = FEED_DIM_DB_OPTIONS.indexOf(normalizeFeedDimDb(db) as (typeof FEED_DIM_DB_OPTIONS)[number]);
  return Math.max(0, index) / (FEED_DIM_DB_OPTIONS.length - 1);
}

export function dimDbFromSliderPosition(position: number): number {
  const max = FEED_DIM_DB_OPTIONS.length - 1;
  const index = Math.round(Math.min(1, Math.max(0, position)) * max);
  return FEED_DIM_DB_OPTIONS[index] ?? DEFAULT_FEED_DIM_DB;
}

export function feedDuckingFactor(amountDb: number): number {
  return 10 ** (amountDb / 20);
}

export function shouldDuckFeeds(input: {
  dimSelf: boolean;
  dimIncoming: boolean;
  talking: boolean;
  incomingAddressed: boolean;
}): boolean {
  return (input.dimSelf && input.talking) || (input.dimIncoming && input.incomingAddressed);
}

/**
 * Loads only the keys the user explicitly changed on this device. Installs
 * that predate per-key tracking stored the full object; all of those keys
 * count as explicit choices, which keeps them stable under server defaults.
 */
export async function loadOperatorAudioOverrides(): Promise<Partial<OperatorAudioSettings>> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) {
    return {};
  }
  try {
    return pickOperatorAudioKeys(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return {};
  }
}

export async function saveOperatorAudioOverrides(
  overrides: Partial<OperatorAudioSettings>,
): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(pickOperatorAudioKeys(overrides)));
}

function pickOperatorAudioKeys(raw: Record<string, unknown>): Partial<OperatorAudioSettings> {
  const overrides: Partial<OperatorAudioSettings> = {};
  for (const key of BOOLEAN_KEYS) {
    if (typeof raw[key] === 'boolean') {
      overrides[key] = raw[key] as boolean;
    }
  }
  if (typeof raw.feedDimDb === 'number') {
    overrides.feedDimDb = normalizeFeedDimDb(raw.feedDimDb);
  }
  if (typeof raw.audioRouteId === 'string' && raw.audioRouteId.trim()) {
    overrides.audioRouteId = raw.audioRouteId.trim();
  }
  return overrides;
}
