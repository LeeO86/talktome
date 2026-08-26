import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { volumeFromMeterFill, volumeMeterFill } from '../protocol';
import { colors } from './theme';
import { volumeFromTouch } from './volumeFromTouch';

type Props = {
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  flex?: boolean;
  light?: boolean;
  accessibilityLabel?: string;
  quantize?: (value: number) => number;
  logarithmic?: boolean;
};

export function VolumeSlider({
  value,
  disabled,
  onChange,
  flex = false,
  light = false,
  accessibilityLabel = 'Volume',
  quantize,
  logarithmic = false,
}: Props) {
  const originX = useRef(0);
  const width = useRef(1);
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? (logarithmic ? volumeMeterFill(value) : value);

  const applyPageX = (pageX: number) => {
    if (disabled) {
      return;
    }
    const next = quantize
      ? quantize(volumeFromTouch(pageX, originX.current, width.current))
      : volumeFromTouch(pageX, originX.current, width.current);
    setDraft(next);
    onChange(logarithmic ? volumeFromMeterFill(next) : next);
  };

  const endDrag = () => {
    setDraft(null);
  };

  return (
    <View
      collapsable={false}
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
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
      <View pointerEvents="none" style={[styles.rail, light && styles.railLight]} />
      <View pointerEvents="none" style={[styles.fill, { width: `${shown * 100}%` }]} />
      <View pointerEvents="none" style={[styles.thumb, light && styles.thumbLight, { left: `${shown * 100}%` }]} />
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
  railLight: {
    backgroundColor: 'rgba(60, 60, 67, 0.18)',
  },
  thumbLight: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
});
