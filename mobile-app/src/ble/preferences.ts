import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_BLE_TARGET, parseBleTargetSelection, type BleTargetSelection } from './target';

const KEY = 'talktome.ble-button';

export type BlePreferences = {
  shortPressLocksTalk: boolean;
  target: BleTargetSelection;
};

export const DEFAULT_BLE_PREFERENCES: BlePreferences = {
  shortPressLocksTalk: true,
  target: DEFAULT_BLE_TARGET,
};

export async function loadBlePreferences(): Promise<BlePreferences> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) {
    return DEFAULT_BLE_PREFERENCES;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<BlePreferences>;
    return {
      shortPressLocksTalk: parsed.shortPressLocksTalk !== false,
      target: parseBleTargetSelection(parsed.target),
    };
  } catch {
    return DEFAULT_BLE_PREFERENCES;
  }
}

export async function saveBlePreferences(preferences: BlePreferences): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(preferences));
}
