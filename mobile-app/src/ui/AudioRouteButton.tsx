import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { describeAudioRouteKind, type AudioRouteKind } from '../audio/routes';
import { session, useSessionStore } from '../session/store';
import { HeadphonesIcon, PhoneIcon, SpeakerIcon } from './icons';
import { colors } from './theme';
import { IosSystemRoutePicker, iosSystemRoutePickerAvailable } from './IosSystemRoutePicker';

/** iOS owns route selection; Android and builds without the native picker use the app menu. */
export function AudioRouteButton({ onPress }: { onPress: () => void }) {
  const routes = useSessionStore((state) => state.audioRoutes);
  const selected = routes.find((route) => route.selected) ?? routes[0];
  const kind = selected?.kind ?? 'speaker';
  if (Platform.OS === 'ios' && iosSystemRoutePickerAvailable) {
    return (
      <View collapsable={false} style={styles.button}>
        <IosSystemRoutePicker />
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Audio output ${describeAudioRouteKind(kind)}`}
      accessibilityHint={Platform.OS === 'ios' ? 'Choose speaker or headset' : 'Choose speaker, phone, or headset'}
      onPress={onPress}
      style={styles.button}
    >
      <RouteKindIcon kind={kind} />
    </Pressable>
  );
}

export function AudioRouteMenu({ onClose }: { onClose: () => void }) {
  const routes = useSessionStore((state) => state.audioRoutes);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    session.refreshAudioDevices();
    return () => { mounted.current = false; };
  }, []);
  const select = async (id: string) => {
    setPending(id);
    setError(null);
    try {
      await session.selectAudioDevice(id);
      if (mounted.current) onClose();
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'Could not change audio output.');
    } finally {
      if (mounted.current) setPending(null);
    }
  };
  // Used on Android and only as a fallback when the native iOS picker is unavailable.
  const content = (
    <View style={styles.backdrop} accessibilityViewIsModal>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close audio output"
        style={StyleSheet.absoluteFill}
        onPress={onClose}
      />
      <View style={styles.sheet}>
        <Text accessibilityRole="header" style={styles.title}>Play audio on</Text>
        <ScrollView style={styles.routeList}>
          {routes.map((route) => (
            <Pressable
              key={route.id}
              accessibilityRole="button"
              accessibilityState={{ selected: route.selected, disabled: pending !== null, busy: pending === route.id }}
              disabled={pending !== null}
              onPress={() => void select(route.id)}
              style={[styles.row, route.selected && styles.rowSelected]}
            >
              <RouteKindIcon kind={route.kind} />
              <Text style={styles.rowLabel} numberOfLines={2}>{route.label}</Text>
              {pending === route.id ? <ActivityIndicator color={colors.accent} /> :
                route.selected ? <Text style={styles.rowValue}>Selected</Text> : null}
            </Pressable>
          ))}
        </ScrollView>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.done}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
  return Platform.OS === 'ios' ? content : (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>{content}</Modal>
  );
}

function RouteKindIcon({ kind }: { kind: AudioRouteKind }) {
  if (kind === 'receiver') {
    return <PhoneIcon color={colors.text} size={18} />;
  }
  if (kind === 'bluetooth' || kind === 'wired' || kind === 'usb') {
    return <HeadphonesIcon color={colors.text} size={18} />;
  }
  return <SpeakerIcon color={colors.text} size={18} />;
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    overflow: 'hidden',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 10,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  routeList: { maxHeight: '75%' },
  error: { color: colors.danger, paddingHorizontal: 16, paddingTop: 12 },
  sheet: {
    maxHeight: '85%',
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    borderRadius: 16,
    backgroundColor: '#121826',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    zIndex: 1,
  },
  title: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowSelected: {
    backgroundColor: 'rgba(61,214,245,0.12)',
  },
  rowLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    flexGrow: 1,
    flexShrink: 1,
  },
  rowValue: {
    color: colors.muted,
    fontSize: 14,
  },
  done: {
    margin: 16,
    marginTop: 8,
    backgroundColor: 'rgba(61,214,245,0.18)',
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
});
