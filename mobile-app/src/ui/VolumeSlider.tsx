import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from './theme';
import { volumeFromTouch } from './volumeFromTouch';

type Props = {
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  flex?: boolean;
};

export function VolumeSlider({ value, disabled, onChange, flex = false }: Props) {
  const originX = useRef(0);
  const width = useRef(1);
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;

  const applyPageX = (pageX: number) => {
    if (disabled) {
      return;
    }
    const next = volumeFromTouch(pageX, originX.current, width.current);
    setDraft(next);
    onChange(next);
  };

  const endDrag = () => {
    setDraft(null);
  };

  return (
    <View
      collapsable={false}
      accessibilityRole="adjustable"
      accessibilityLabel="Volume"
      style={[styles.track, flex && styles.flex, disabled && styles.disabled]}
      onLayout={(event) => {
        width.current = event.nativeEvent.layout.width || 1;
      }}
      onStartShouldSetResponder={() => !disabled}
      onMoveShouldSetResponder={() => !disabled}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event) => {
        const { pageX, locationX } = event.nativeEvent;
        originX.current = pageX - locationX;
        applyPageX(pageX);
      }}
      onResponderMove={(event) => applyPageX(event.nativeEvent.pageX)}
      onResponderRelease={endDrag}
      onResponderTerminate={endDrag}
    >
      <View pointerEvents="none" style={styles.rail} />
      <View pointerEvents="none" style={[styles.fill, { width: `${shown * 100}%` }]} />
      <View pointerEvents="none" style={[styles.thumb, { left: `${shown * 100}%` }]} />
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
