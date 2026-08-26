import { useEffect, useState, type ComponentType } from 'react';
import {
  ActionSheetIOS,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { requireNativeViewManager } from 'expo-modules-core';

import { describeAudioRouteKind, hasSystemRoutePicker, type AudioRouteKind } from '../audio/routes';
import { session, useSessionStore } from '../session/store';
import { HeadphonesIcon, PhoneIcon, SpeakerIcon } from './icons';
import { colors } from './theme';

export function AudioRouteButton() {
  const routes = useSessionStore((state) => state.audioRoutes);
  const selected = routes.find((route) => route.selected) ?? routes[0];
  const [open, setOpen] = useState(false);
  const systemPicker = Platform.OS === 'ios' && hasSystemRoutePicker();

  useEffect(() => {
    session.refreshAudioDevices();
  }, []);

  const kind = selected?.kind ?? 'speaker';
  const label = selected ? describeAudioRouteKind(kind) : 'Speaker';
  const listed =
    routes.length > 0 ? routes : [{ id: 'speaker', label: 'Speaker', kind: 'speaker' as const }];

  const openFallbackPicker = () => {
    session.refreshAudioDevices();
    if (Platform.OS === 'ios') {
      const options = [...listed.map((route) => route.label), 'Cancel'];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Play audio on',
          options,
          cancelButtonIndex: options.length - 1,
          userInterfaceStyle: 'dark',
        },
        (index) => {
          const route = listed[index];
          if (route) {
            void session.selectAudioDevice(route.id);
          }
        },
      );
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <View
        collapsable={false}
        style={styles.button}
        accessibilityElementsHidden={systemPicker}
        importantForAccessibility={systemPicker ? 'no-hide-descendants' : 'yes'}
      >
        <View pointerEvents="none">
          <RouteKindIcon kind={kind} />
        </View>
        {systemPicker ? (
          <IosSystemRoutePicker />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Audio output ${label}`}
            accessibilityHint="Choose speaker, phone, or headset"
            onPress={openFallbackPicker}
            style={StyleSheet.absoluteFill}
          />
        )}
      </View>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <Text style={styles.title}>Play audio on</Text>
            {listed.map((route) => {
              const active = route.selected || route.id === selected?.id;
              return (
                <Pressable
                  key={route.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    void session.selectAudioDevice(route.id);
                    setOpen(false);
                  }}
                  style={[styles.row, active && styles.rowSelected]}
                >
                  <RouteKindIcon kind={route.kind} />
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {route.label}
                  </Text>
                  {active ? <Text style={styles.rowValue}>Selected</Text> : null}
                </Pressable>
              );
            })}
            <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.done}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

function IosSystemRoutePicker() {
  try {
    const NativeView = requireNativeViewManager('TalkToMeAudioSession') as ComponentType<{
      style?: object;
    }>;
    return <NativeView style={StyleSheet.absoluteFill} />;
  } catch {
    return null;
  }
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
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  sheet: {
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
