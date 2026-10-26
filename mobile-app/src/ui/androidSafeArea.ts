import { Platform, StatusBar, type ViewStyle } from 'react-native';

/**
 * Extra insets for Android status / gesture bars. RN SafeAreaView only insets iOS,
 * so Android content sits under the clock, cutout, and home indicator.
 */
export const androidSafeArea: ViewStyle =
  Platform.OS === 'android'
    ? {
        paddingTop: (StatusBar.currentHeight ?? 24) + 8,
        paddingBottom: 28,
      }
    : {};
