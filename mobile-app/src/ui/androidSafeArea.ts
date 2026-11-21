import { Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { androidSafeAreaStyle, type AndroidSafeArea } from './androidSafeAreaStyle';

export function useAndroidSafeArea(): AndroidSafeArea {
  const insets = useSafeAreaInsets();
  return androidSafeAreaStyle(Platform.OS, insets, StatusBar.currentHeight);
}
