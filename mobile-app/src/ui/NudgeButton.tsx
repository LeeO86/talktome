import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from './theme';

export const NUDGE_HOLD_DELAY_MS = 420;
export const NUDGE_HOLD_INTERVAL_MS = 180;

type Props = {
  accessibilityLabel: string;
  direction: 1 | -1;
  onNudge: () => void;
  style?: StyleProp<ViewStyle>;
  symbolSize?: number;
};

export function NudgeButton({ accessibilityLabel, direction, onNudge, style, symbolSize = 14 }: Props) {
  const onNudgeRef = useRef(onNudge);
  onNudgeRef.current = onNudge;
  const delay = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (delay.current) {
      clearTimeout(delay.current);
      delay.current = null;
    }
    if (interval.current) {
      clearInterval(interval.current);
      interval.current = null;
    }
  };

  useEffect(() => stop, []);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={event => {
        if (event.nativeEvent.actionName === 'activate') onNudgeRef.current();
      }}
      onPressIn={() => {
        stop();
        onNudgeRef.current();
        delay.current = setTimeout(() => {
          interval.current = setInterval(() => onNudgeRef.current(), NUDGE_HOLD_INTERVAL_MS);
        }, NUDGE_HOLD_DELAY_MS);
      }}
      onPressOut={stop}
      style={style}
    >
      <View pointerEvents="none" style={[styles.symbol, { width: symbolSize, height: symbolSize }]}>
        <View style={styles.horizontal} />
        {direction > 0 ? <View style={styles.vertical} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  symbol: { alignItems: 'center', justifyContent: 'center' },
  horizontal: { width: '100%', height: 2, borderRadius: 1, backgroundColor: colors.text },
  vertical: { position: 'absolute', width: 2, height: '100%', borderRadius: 1, backgroundColor: colors.text },
});
