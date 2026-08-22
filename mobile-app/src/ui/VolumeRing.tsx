import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatLinearLevelDbShort, volumeMeterFill } from '../protocol';
import { SpeakerIcon } from './icons';
import { colors } from './theme';

const TICKS = 22;
const START_DEG = 218;
const SWEEP_DEG = 284;
const DOUBLE_PRESS_MS = 280;

type Props = {
  level: number;
  muted?: boolean;
  dimmed?: boolean;
  compact?: boolean;
  accessibilityLabel: string;
  onPress?: () => void;
  onDoublePress?: () => void;
};

export function VolumeRing({
  level,
  muted = false,
  dimmed = false,
  compact = false,
  accessibilityLabel,
  onPress,
  onDoublePress,
}: Props) {
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const size = compact ? 44 : 52;
  const filled = muted ? 0 : Math.round(volumeMeterFill(level) * TICKS);
  const accent = muted ? colors.danger : dimmed ? 'rgba(255,255,255,0.38)' : colors.accent;
  const track = muted ? 'rgba(255,140,140,0.28)' : 'rgba(255,255,255,0.16)';
  const label = muted ? null : formatLinearLevelDbShort(level);

  useEffect(() => {
    return () => {
      if (pending.current) {
        clearTimeout(pending.current);
      }
    };
  }, []);

  const handlePress = () => {
    if (!onDoublePress) {
      onPress?.();
      return;
    }
    if (pending.current) {
      clearTimeout(pending.current);
      pending.current = null;
      onDoublePress();
      return;
    }
    pending.current = setTimeout(() => {
      pending.current = null;
      onPress?.();
    }, DOUBLE_PRESS_MS);
  };

  const face = (
    <>
      {Array.from({ length: TICKS }, (_, index) => (
        <View
          key={index}
          pointerEvents="none"
          style={[
            styles.spoke,
            {
              width: size,
              height: size,
              transform: [{ rotate: `${START_DEG + (index / (TICKS - 1)) * SWEEP_DEG}deg` }],
            },
          ]}
        >
          <View
            style={[
              styles.tick,
              {
                backgroundColor: index < filled ? accent : track,
                height: size * 0.12,
              },
            ]}
          />
        </View>
      ))}
      <View pointerEvents="none" style={styles.label}>
        {muted ? (
          <SpeakerIcon muted color={colors.danger} size={compact ? 14 : 16} />
        ) : (
          <>
            <Text style={[styles.value, dimmed && styles.dimText, compact && styles.valueCompact]}>{label}</Text>
            <Text style={[styles.unit, dimmed && styles.dimText]}>dB</Text>
          </>
        )}
      </View>
    </>
  );

  if (!onPress && !onDoublePress) {
    return <View style={[styles.hit, { width: size, height: size }]}>{face}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={onDoublePress ? 'Double tap to mute or unmute' : undefined}
      onPress={handlePress}
      hitSlop={6}
      style={[styles.hit, { width: size, height: size }]}
    >
      {face}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  spoke: {
    position: 'absolute',
    alignItems: 'center',
  },
  tick: {
    width: 2.5,
    borderRadius: 1.5,
  },
  label: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    lineHeight: 14,
  },
  valueCompact: {
    fontSize: 11,
    lineHeight: 13,
  },
  unit: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: '600',
    marginTop: -1,
  },
  dimText: {
    color: 'rgba(255,255,255,0.45)',
  },
});
