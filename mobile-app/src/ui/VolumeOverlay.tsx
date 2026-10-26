import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatLinearLevelDb } from '../protocol';
import { NudgeButton } from './NudgeButton';
import { colors } from './theme';
import { VolumeRing } from './VolumeRing';
import { VolumeSlider } from './VolumeSlider';

type Props = {
  visible: boolean;
  title: string;
  level: number;
  muted: boolean;
  embedded?: boolean;
  fader?: boolean;
  onNudge: (direction: 1 | -1) => void;
  onChange?: (level: number) => void;
  onToggleMute: () => void;
  onClose: () => void;
};

export function VolumeOverlay({
  visible,
  title,
  level,
  muted,
  embedded = false,
  fader = false,
  onNudge,
  onChange,
  onToggleMute,
  onClose,
}: Props) {
  const readout = muted ? 'Muted' : formatLinearLevelDb(level);
  if (!visible) {
    return null;
  }

  const sheet = (
    <View style={[styles.backdrop, embedded && styles.embedded]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close volume" />
      <View style={styles.sheet}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <VolumeRing level={level} muted={muted} accessibilityLabel={readout} />
        <Text style={[styles.db, muted && styles.mutedText]}>{readout}</Text>
        {fader && onChange ? (
          <View style={styles.fader}>
            <VolumeSlider value={level} disabled={muted} onChange={onChange} flex logarithmic />
          </View>
        ) : (
          <View style={styles.steppers}>
            <NudgeButton accessibilityLabel="Quieter" onNudge={() => onNudge(-1)} style={styles.step} textStyle={styles.stepText}>
              {'−'}
            </NudgeButton>
            <NudgeButton accessibilityLabel="Louder" onNudge={() => onNudge(1)} style={styles.step} textStyle={styles.stepText}>
              {'+'}
            </NudgeButton>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={muted ? 'Unmute' : 'Mute'}
          onPress={onToggleMute}
          style={[styles.mute, muted && styles.muteOn]}
        >
          <Text style={[styles.muteText, muted && styles.muteOnText]}>{muted ? 'Unmute' : 'Mute'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.done}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
    </View>
  );

  if (embedded) {
    return sheet;
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {sheet}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  embedded: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
    elevation: 20,
  },
  sheet: {
    borderRadius: 20,
    backgroundColor: '#121826',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    alignItems: 'center',
    gap: 12,
    zIndex: 1,
    elevation: 2,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  db: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  mutedText: {
    color: colors.danger,
  },
  steppers: {
    flexDirection: 'row',
    gap: 16,
  },
  fader: {
    alignSelf: 'stretch',
    paddingHorizontal: 4,
    paddingVertical: 12,
  },
  step: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: 'rgba(61,214,245,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(61,214,245,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '600',
    marginTop: -2,
  },
  mute: {
    alignSelf: 'stretch',
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  muteOn: {
    backgroundColor: colors.mute,
    borderColor: 'rgba(255,180,180,0.45)',
  },
  muteText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  muteOnText: {
    color: '#fff',
  },
  done: {
    alignSelf: 'stretch',
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
});
