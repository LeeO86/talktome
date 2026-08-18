import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from './theme';

type Props = {
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  flex?: boolean;
};

export function VolumeSlider({ value, disabled, onChange, flex = false }: Props) {
  const width = useRef(1);

  const setFromX = (x: number) => {
    if (disabled) {
      return;
    }
    onChange(Math.min(1, Math.max(0, x / width.current)));
  };

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel="Volume"
      style={[styles.track, flex && styles.flex, disabled && styles.disabled]}
      onLayout={(event) => {
        width.current = event.nativeEvent.layout.width || 1;
      }}
      onStartShouldSetResponder={() => !disabled}
      onMoveShouldSetResponder={() => !disabled}
      onResponderGrant={(event) => setFromX(event.nativeEvent.locationX)}
      onResponderMove={(event) => setFromX(event.nativeEvent.locationX)}
    >
      <View style={styles.rail} />
      <View style={[styles.fill, { width: `${value * 100}%` }]} />
      <View style={[styles.thumb, { left: `${value * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 28,
    justifyContent: 'center',
    width: 88,
    flexGrow: 0,
  },
  flex: {
    width: undefined,
    flexGrow: 1,
    flexShrink: 1,
  },
  disabled: {
    opacity: 0.4,
  },
  rail: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  fill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  thumb: {
    position: 'absolute',
    width: 16,
    height: 16,
    marginLeft: -8,
    borderRadius: 8,
    backgroundColor: colors.text,
  },
});
