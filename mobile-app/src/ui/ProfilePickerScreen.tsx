import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { visibleProductionName } from '../protocol';
import { session, useSessionStore } from '../session/store';
import { isShortLandscapeScreen } from './layers';
import { QrIcon, TrashIcon } from './icons';
import { PrivacyPolicyLink } from './PrivacyPolicyLink';
import { colors } from './theme';

export function ProfilePickerScreen() {
  const { width, height } = useWindowDimensions();
  const compact = isShortLandscapeScreen(width, height);
  const profiles = useSessionStore((state) => state.profiles);
  const lastProfileId = useSessionStore((state) => state.activeProfileId);
  const busy = useSessionStore((state) => state.status === 'connecting');
  const error = useSessionStore((state) => state.error);
  const statusMessage = useSessionStore((state) => state.statusMessage);

  return (
    <View style={[styles.screen, compact && styles.screenCompact]}>
      <Text style={[styles.title, compact && styles.titleCompact]}>Profiles</Text>
      <Text style={[styles.subtitle, compact && styles.subtitleCompact]}>
        {compact ? 'Select a profile to connect.' : 'Tap a profile to connect. The trash can deletes it from this device.'}
      </Text>

      <ScrollView contentContainerStyle={[styles.list, compact && styles.listCompact]}>
        {profiles.map((profile) => {
          const production = visibleProductionName(profile.productionName);
          return (
            <View key={profile.id} style={[styles.card, profile.id === lastProfileId && styles.cardLast]}>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={() => void session.connectProfile(profile.id)}
                style={[styles.cardMain, compact && styles.cardMainCompact, busy && styles.busy]}
              >
                <Text style={[styles.name, compact && styles.actionTextCompact]}>{profile.username}</Text>
                <Text style={[styles.server, compact && styles.serverCompact]}>{profile.serverAddress}</Text>
                {production ? <Text style={[styles.production, compact && styles.serverCompact]}>{production}</Text> : null}
                {busy && profile.id === lastProfileId ? (
                  <View style={styles.connection} accessibilityLiveRegion="polite">
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={[styles.server, compact && styles.serverCompact]}>{statusMessage || 'Connecting…'}</Text>
                  </View>
                ) : null}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${profile.username}`}
                disabled={busy}
                onPress={() => {
                  Alert.alert('Remove profile?', `${profile.username}\n${profile.serverAddress}`, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Remove',
                      style: 'destructive',
                      onPress: () => void session.removeSavedProfile(profile.id),
                    },
                  ]);
                }}
                hitSlop={8}
                style={[styles.remove, compact && styles.removeCompact]}
              >
                <TrashIcon />
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      {error ? <Text style={[styles.error, compact && styles.errorCompact]} numberOfLines={compact ? 2 : undefined}
        accessibilityLiveRegion="polite">{error}</Text> : null}

      {busy ? (
        <Pressable accessibilityRole="button" onPress={() => session.cancelProfileConnection()} style={[styles.add, compact && styles.addCompact]}>
          <Text style={[styles.addText, compact && styles.actionTextCompact]}>Cancel connection</Text>
        </Pressable>
      ) : null}

      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => session.startAddProfile({ openScanner: true })}
        style={[styles.add, compact && styles.addCompact]}
      >
        <View style={styles.addRow}>
          <QrIcon color={colors.text} size={compact ? 15 : undefined} />
          <Text style={[styles.addText, compact && styles.actionTextCompact]}>Scan QR code</Text>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => session.startAddProfile()} style={[styles.add, compact && styles.addCompact]}>
        <Text style={[styles.addText, compact && styles.actionTextCompact]}>Add profile</Text>
      </Pressable>
      <PrivacyPolicyLink compact={compact} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  screenCompact: { paddingHorizontal: 10, paddingTop: 4 },
  titleCompact: { fontSize: 21 },
  subtitleCompact: { fontSize: 11, marginTop: 2, marginBottom: 5 },
  listCompact: { gap: 5, paddingBottom: 5 },
  cardMainCompact: { paddingHorizontal: 9, paddingVertical: 5 },
  serverCompact: { fontSize: 11, marginTop: 2 },
  removeCompact: { paddingHorizontal: 10, paddingVertical: 8 },
  errorCompact: { fontSize: 11, lineHeight: 14, marginBottom: 4 },
  addCompact: { minHeight: 28, marginBottom: 4, borderRadius: 9 },
  actionTextCompact: { fontSize: 13 },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    marginTop: 6,
    marginBottom: 20,
  },
  list: {
    gap: 10,
    paddingBottom: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardLast: {
    borderColor: 'rgba(61,214,245,0.45)',
  },
  cardMain: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  name: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  server: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
  },
  production: {
    color: colors.accent,
    fontSize: 13,
    marginTop: 6,
    fontWeight: '600',
  },
  remove: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: colors.danger,
    marginBottom: 8,
  },
  add: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  addText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  busy: {
    opacity: 0.6,
  },
  connection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
});
