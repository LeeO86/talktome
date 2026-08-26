import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'talktome.operator-audio';

export const FEED_DIM_DB_OPTIONS = [-6, -12, -14, -18, -24] as const;
export const DEFAULT_FEED_DIM_DB = -14;

export type OperatorAudioSettings = {
  feedDimSelf: boolean;
  feedDimIncoming: boolean;
  feedDimDb: number;
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
  volumeFader: false,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  audioRouteId: 'speaker',
};

export function normalizeOperatorAudio(
  value?: Partial<OperatorAudioSettings> | null,
): OperatorAudioSettings {
  return {
    feedDimSelf: Boolean(value?.feedDimSelf),
    feedDimIncoming: value?.feedDimIncoming !== false,
    feedDimDb: normalizeFeedDimDb(value?.feedDimDb),
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

export function normalizeFeedDimDb(value: number | null | undefined): number {
  if (typeof value === 'number' && FEED_DIM_DB_OPTIONS.includes(value as (typeof FEED_DIM_DB_OPTIONS)[number])) {
    return value;
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

export async function loadOperatorAudio(): Promise<OperatorAudioSettings> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) {
    return DEFAULT_OPERATOR_AUDIO;
  }
  try {
    return normalizeOperatorAudio(JSON.parse(raw) as Partial<OperatorAudioSettings>);
  } catch {
    return DEFAULT_OPERATOR_AUDIO;
  }
}

export async function saveOperatorAudio(settings: OperatorAudioSettings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(normalizeOperatorAudio(settings)));
}
