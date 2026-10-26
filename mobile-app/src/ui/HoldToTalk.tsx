import { useRef, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { didReachSlideToLockThreshold } from '../talk/slideToLock';

type Props = {
  accessibilityLabel: string;
  disabled?: boolean;
  locked?: boolean;
  leftHanded?: boolean;
  style?: StyleProp<ViewStyle>;
  onPress: () => void;
  onLock: () => void;
  onRelease: () => void;
  children: ReactNode;
};

export function HoldToTalk({
  accessibilityLabel,
  disabled,
  locked,
  leftHanded = false,
  style,
  onPress,
  onLock,
  onRelease,
  children,
}: Props) {
  const startX = useRef(0);
  const lockedByGesture = useRef(false);
  const skipRelease = useRef(false);

  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled), selected: Boolean(locked) }}
      style={[styles.hit, disabled && styles.disabled, style]}
      onStartShouldSetResponder={() => !disabled}
      onMoveShouldSetResponder={() => !disabled}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event) => {
        if (disabled) {
          return;
        }
        startX.current = event.nativeEvent.pageX;
        lockedByGesture.current = false;
        if (locked) {
          skipRelease.current = true;
          onPress();
          return;
        }
        skipRelease.current = false;
        onPress();
      }}
      onResponderMove={(event) => {
        if (disabled || skipRelease.current || lockedByGesture.current) {
          return;
        }
        if (didReachSlideToLockThreshold(event.nativeEvent.pageX, startX.current, leftHanded)) {
          lockedByGesture.current = true;
          onLock();
        }
      }}
      onResponderRelease={() => {
        if (skipRelease.current || lockedByGesture.current) {
          return;
        }
        onRelease();
      }}
      onResponderTerminate={() => {
        if (skipRelease.current || lockedByGesture.current) {
          return;
        }
        onRelease();
      }}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  hit: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.45,
  },
});
