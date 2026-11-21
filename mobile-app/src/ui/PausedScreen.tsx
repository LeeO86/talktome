import { Pressable, StyleSheet, Text, View } from 'react-native';

import { visibleProductionName } from '../protocol';
import { session, useSessionStore } from '../session/store';
import { colors } from './theme';

export function PausedScreen() {
  const store = useSessionStore();
  const production = visibleProductionName(store.productionName);
  const busy = store.status === 'connecting';

  return (
    <View style={styles.screen}>
      <Text style={styles.kicker}>Disconnected</Text>
      <Text style={styles.name}>{store.username}</Text>
      <Text style={styles.meta}>{store.serverAddress}</Text>
      {production ? <Text style={styles.meta}>{production}</Text> : null}
      <Text style={styles.hint}>
        You are offline for others. Reconnect to join the same production, or pick another profile.
      </Text>

      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void session.reconnectLastProfile()}
        style={[styles.primary, busy && styles.busy]}
      >
        <Text style={styles.primaryText}>{busy ? 'Connecting…' : 'Reconnect'}</Text>
      </Pressable>

      <Pressable accessibilityRole="button" onPress={() => session.openProfilePicker()} style={styles.secondary}>
        <Text style={styles.secondaryText}>Profiles</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  kicker: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  name: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '700',
    marginTop: 8,
  },
  meta: {
    color: colors.muted,
    fontSize: 15,
    marginTop: 6,
  },
  hint: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 20,
    marginBottom: 28,
  },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: '#071018',
    fontWeight: '700',
    fontSize: 17,
  },
  secondary: {
    marginTop: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: colors.accent,
    fontWeight: '600',
    fontSize: 16,
  },
  busy: {
    opacity: 0.6,
  },
});
