import { useEffect, useRef } from 'react';
import { Pressable, type StyleProp, Text, type TextStyle, type ViewStyle } from 'react-native';

export const NUDGE_HOLD_DELAY_MS = 420;
export const NUDGE_HOLD_INTERVAL_MS = 180;

type Props = {
  accessibilityLabel: string;
  onNudge: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  children: string;
};

export function NudgeButton({ accessibilityLabel, onNudge, style, textStyle, children }: Props) {
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
      <Text style={textStyle}>{children}</Text>
    </Pressable>
  );
}
