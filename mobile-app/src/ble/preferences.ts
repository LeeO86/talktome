import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_BLE_RELEASE_TIMEOUT_MS,
  parseBleDeviceBindings,
  parseBleReleaseTimeoutMs,
  type BleDeviceBinding,
} from './bindings';
import { DEFAULT_BLE_TARGET, parseBleTargetSelection, type BleTargetSelection } from './target';

const KEY = 'talktome.ble-button';

export type BlePreferences = {
  shortPressLocksTalk: boolean;
  releaseTimeoutMs: number;
  target: BleTargetSelection;
  devices: BleDeviceBinding[];
};

export const DEFAULT_BLE_PREFERENCES: BlePreferences = {
  shortPressLocksTalk: true,
  releaseTimeoutMs: DEFAULT_BLE_RELEASE_TIMEOUT_MS,
  target: DEFAULT_BLE_TARGET,
  devices: [],
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
      releaseTimeoutMs: parseBleReleaseTimeoutMs(
        parsed.releaseTimeoutMs === undefined ? DEFAULT_BLE_RELEASE_TIMEOUT_MS : parsed.releaseTimeoutMs,
      ),
      target: parseBleTargetSelection(parsed.target),
      devices: parseBleDeviceBindings(parsed.devices),
    };
  } catch {
    return DEFAULT_BLE_PREFERENCES;
  }
}

export async function saveBlePreferences(preferences: BlePreferences): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(preferences));
}
