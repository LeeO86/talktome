import { Pressable, StyleSheet, Text, View } from 'react-native';

import { productionChoices } from '../protocol';
import { session, useSessionStore } from '../session/store';
import { colors } from './theme';

export function ProductionPickerScreen() {
  const productions = useSessionStore((state) => state.productions);
  const selectedId = useSessionStore((state) => state.productionId);
  const error = useSessionStore((state) => state.error);
  const statusMessage = useSessionStore((state) => state.statusMessage);
  const busy = useSessionStore((state) => state.status === 'connecting');

  return (
    <View style={styles.screen}>
      <Text style={styles.brand}>Talktome Login</Text>
      <Text style={styles.subtitle}>Choose a production</Text>

      <View style={styles.card}>
        {productionChoices(productions).map((choice) => {
          const selected = choice.id === selectedId;
          return (
            <Pressable
              key={choice.id ?? 'default'}
              accessibilityRole="button"
              disabled={busy}
              onPress={() =>
                void session.selectProduction(choice.id === null ? null : { id: choice.id, name: choice.name })
              }
              style={[styles.choice, selected && styles.choiceSelected, busy && styles.choiceBusy]}
            >
              <Text style={styles.choiceText}>{choice.name}</Text>
            </Pressable>
          );
        })}
      </View>

      {statusMessage ? <Text style={styles.status}>{statusMessage}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable onPress={() => void session.leaveToProfiles()} style={styles.logout}>
        <Text style={styles.logoutText}>Profiles</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  brand: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.muted,
    marginTop: 8,
    marginBottom: 20,
    fontSize: 16,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 16,
    gap: 12,
    backgroundColor: colors.card,
  },
  choice: {
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: 'rgba(20,40,70,0.85)',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  choiceSelected: {
    backgroundColor: 'rgba(61,214,245,0.16)',
  },
  choiceBusy: {
    opacity: 0.6,
  },
  choiceText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  status: {
    color: colors.muted,
    marginTop: 16,
  },
  error: {
    color: colors.danger,
    marginTop: 12,
  },
  logout: {
    marginTop: 24,
    alignItems: 'center',
  },
  logoutText: {
    color: colors.accent,
    fontWeight: '600',
  },
});
