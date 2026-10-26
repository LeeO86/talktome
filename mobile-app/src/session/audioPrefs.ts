import AsyncStorage from '@react-native-async-storage/async-storage';

import { normalizeAudioPreference, type TargetAudioPreference } from '../protocol/audioPreference';

const KEY = 'talktome.target-audio-preferences';

export async function loadAudioPreferences(): Promise<Record<string, TargetAudioPreference>> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<TargetAudioPreference>>;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, normalizeAudioPreference(value)]),
    );
  } catch {
    return {};
  }
}

export async function saveAudioPreferences(
  preferences: Record<string, TargetAudioPreference>,
): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(preferences));
}
