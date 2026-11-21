import AsyncStorage from '@react-native-async-storage/async-storage';

import { clampVolume } from '../protocol/audioPreference';

const KEY = 'talktome.conference-listen';

export type ConferenceListenState = {
  excluded: Record<string, number[]>;
  levels: Record<string, Record<string, number>>;
};

export const EMPTY_CONFERENCE_LISTEN: ConferenceListenState = {
  excluded: {},
  levels: {},
};

export function conferenceMemberLevel(
  state: ConferenceListenState,
  conferenceId: number | string,
  userId: number,
): number {
  const stored = state.levels[String(conferenceId)]?.[String(userId)];
  return stored == null ? 1 : clampVolume(stored);
}

export function conferenceMemberExcluded(
  state: ConferenceListenState,
  conferenceId: number | string,
  userId: number,
): boolean {
  return Boolean(state.excluded[String(conferenceId)]?.includes(userId));
}

export function conferenceMemberGain(
  state: ConferenceListenState,
  conferenceId: number | string,
  userId: number | null | undefined,
): number {
  if (userId == null || !Number.isFinite(userId)) {
    return 1;
  }
  if (conferenceMemberExcluded(state, conferenceId, userId)) {
    return 0;
  }
  return conferenceMemberLevel(state, conferenceId, userId);
}

export function setConferenceMemberListening(
  state: ConferenceListenState,
  conferenceId: number | string,
  userId: number,
  listening: boolean,
): ConferenceListenState {
  const key = String(conferenceId);
  const current = new Set(state.excluded[key] ?? []);
  if (listening) {
    current.delete(userId);
  } else {
    current.add(userId);
  }
  const excluded = { ...state.excluded };
  if (current.size === 0) {
    delete excluded[key];
  } else {
    excluded[key] = [...current].sort((a, b) => a - b);
  }
  return { ...state, excluded };
}

export function setConferenceMemberLevel(
  state: ConferenceListenState,
  conferenceId: number | string,
  userId: number,
  level: number,
): ConferenceListenState {
  const conferenceKey = String(conferenceId);
  const userKey = String(userId);
  const nextLevel = clampVolume(level);
  const conferenceLevels = { ...(state.levels[conferenceKey] ?? {}) };
  if (nextLevel >= 1) {
    delete conferenceLevels[userKey];
  } else {
    conferenceLevels[userKey] = nextLevel;
  }
  const levels = { ...state.levels };
  if (Object.keys(conferenceLevels).length === 0) {
    delete levels[conferenceKey];
  } else {
    levels[conferenceKey] = conferenceLevels;
  }
  return { ...state, levels };
}

export async function loadConferenceListen(): Promise<ConferenceListenState> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) {
    return EMPTY_CONFERENCE_LISTEN;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ConferenceListenState>;
    return {
      excluded: isIdMap(parsed.excluded) ? parsed.excluded : {},
      levels: isLevelMap(parsed.levels) ? parsed.levels : {},
    };
  } catch {
    return EMPTY_CONFERENCE_LISTEN;
  }
}

export async function saveConferenceListen(state: ConferenceListenState): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(state));
}

function isIdMap(value: unknown): value is Record<string, number[]> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isLevelMap(value: unknown): value is Record<string, Record<string, number>> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
