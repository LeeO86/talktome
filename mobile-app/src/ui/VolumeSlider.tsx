import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { volumeFromMeterFill, volumeMeterFill } from '../protocol';
import { colors } from './theme';
import { volumeFromTouch, volumeThumbLeft } from './volumeFromTouch';

export const VOLUME_THUMB_SIZE = 24;

type Props = {
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  flex?: boolean;
  light?: boolean;
  accessibilityLabel?: string;
  quantize?: (value: number) => number;
  logarithmic?: boolean;
  /** Draw a detent at each equal step, including both ends. */
  stepCount?: number;
  onSliding?: (active: boolean) => void;
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
  stepCount,
  onSliding,
}: Props) {
  const originX = useRef(0);
  const width = useRef(1);
  const [trackWidth, setTrackWidth] = useState(0);
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? (logarithmic ? volumeMeterFill(value) : value);
  const pad = VOLUME_THUMB_SIZE / 2;
  const thumbLeft = volumeThumbLeft(shown, trackWidth || width.current, VOLUME_THUMB_SIZE);

  const applyPageX = (pageX: number) => {
    if (disabled) {
      return;
    }
    const next = quantize
      ? quantize(volumeFromTouch(pageX, originX.current, width.current, pad))
      : volumeFromTouch(pageX, originX.current, width.current, pad);
    setDraft(next);
    onChange(logarithmic ? volumeFromMeterFill(next) : next);
  };

  const endDrag = () => {
    setDraft(null);
    onSliding?.(false);
  };

  const ticks =
    stepCount && stepCount > 1
      ? Array.from({ length: stepCount }, (_, index) => {
          const position = index / (stepCount - 1);
          const center = volumeThumbLeft(position, trackWidth || width.current, VOLUME_THUMB_SIZE) + VOLUME_THUMB_SIZE / 2;
          return (
            <View
              key={index}
              pointerEvents="none"
              style={[styles.tick, light && styles.tickLight, { left: center - 3 }]}
            />
          );
        })
      : null;

  return (
    <View
      collapsable={false}
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, flex && styles.flex, disabled && styles.disabled]}
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width || 1;
        width.current = nextWidth;
        setTrackWidth(nextWidth);
      }}
      onStartShouldSetResponder={() => !disabled}
      onStartShouldSetResponderCapture={() => !disabled}
      onMoveShouldSetResponder={() => !disabled}
      onMoveShouldSetResponderCapture={() => !disabled}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event) => {
        onSliding?.(true);
        const { pageX, locationX } = event.nativeEvent;
        originX.current = pageX - locationX;
        applyPageX(pageX);
      }}
      onResponderMove={(event) => applyPageX(event.nativeEvent.pageX)}
      onResponderRelease={endDrag}
      onResponderTerminate={endDrag}
    >
      <View pointerEvents="none" style={[styles.rail, light && styles.railLight]} />
      {ticks}
      <View pointerEvents="none" style={[styles.fill, { width: thumbLeft }]} />
      <View
        pointerEvents="none"
        style={[styles.thumb, light && styles.thumbLight, { left: thumbLeft }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 40,
    justifyContent: 'center',
    width: 88,
    flexGrow: 0,
    overflow: 'visible',
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
    left: VOLUME_THUMB_SIZE / 2,
    right: VOLUME_THUMB_SIZE / 2,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  fill: {
    position: 'absolute',
    left: VOLUME_THUMB_SIZE / 2,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  thumb: {
    position: 'absolute',
    width: VOLUME_THUMB_SIZE,
    height: VOLUME_THUMB_SIZE,
    borderRadius: VOLUME_THUMB_SIZE / 2,
    backgroundColor: colors.text,
  },
  tick: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  tickLight: {
    backgroundColor: 'rgba(60, 60, 67, 0.45)',
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
