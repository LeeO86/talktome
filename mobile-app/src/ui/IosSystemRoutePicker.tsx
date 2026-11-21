import type { ComponentType } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { requireNativeViewManager } from 'expo-modules-core';

function loadPicker(): ComponentType<{ style?: object }> | null {
  if (Platform.OS !== 'ios') return null;
  try {
    return requireNativeViewManager('TalkToMeAudioSession');
  } catch {
    return null;
  }
}

// Expo returns a new React component class on each factory call. Resolve it
// once so route updates never unmount the view presenting Apple's menu.
const NativePicker = loadPicker();
export const iosSystemRoutePickerAvailable = NativePicker !== null;

export function IosSystemRoutePicker() {
  return NativePicker ? <NativePicker style={StyleSheet.absoluteFill} /> : null;
}
