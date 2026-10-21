import { Alert, Pressable, Text, View } from 'react-native';

import { productionChoices, visibleProductionName } from '../protocol';
import { connectionHealthFromSession } from '../session/connectionHealth';
import { session, useSessionStore } from '../session/store';
import { ConnectionStatusBadge } from './ConnectionStatusBadge';
import {
  SettingsNavRow,
  SettingsRow,
  SettingsSection,
  useSettingsStyles,
  useSettingsTheme,
} from './settingsChrome';

/** Root page of the session sheet; Settings is pushed from here. */
export function SessionPage({
  onClose,
  onOpenSettings,
}: {
  onClose: () => void;
  onOpenSettings: () => void;
}) {
  const store = useSessionStore();
  const styles = useSettingsStyles();
  const { scheme } = useSettingsTheme();
  const production = visibleProductionName(store.productionName);
  const choices = store.productions.length > 0 ? productionChoices(store.productions) : [];
  const connection = connectionHealthFromSession(store);

  const disconnect = () => {
    Alert.alert(
      'Disconnect?',
      'You will appear offline. Opening the app again reconnects you to this production.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => {
            onClose();
            void session.disconnect();
          },
        },
      ],
    );
  };

  return (
    <>
      <SettingsSection title="Signed in as">
        <SettingsRow label={store.identity?.name ?? store.username} />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Connection</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
            <ConnectionStatusBadge health={connection} light={scheme === 'light'} />
          </View>
        </View>
        <SettingsRow label="Server" value={store.serverAddress} />
        {production && choices.length === 0 ? <SettingsRow label="Production" value={production} /> : null}
      </SettingsSection>

      {choices.length > 0 ? (
        <SettingsSection title="Production">
          {choices.map((choice) => {
            const selected = choice.id === store.productionId;
            return (
              <SettingsRow
                key={choice.id ?? 'default'}
                label={choice.name}
                value={selected ? 'Selected' : ''}
                selected={selected}
                onPress={() => {
                  void session.selectProduction(
                    choice.id === null ? null : { id: choice.id, name: choice.name },
                  );
                }}
              />
            );
          })}
        </SettingsSection>
      ) : null}

      <SettingsSection>
        <SettingsNavRow label="Settings" onPress={onOpenSettings} />
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onClose();
            void session.leaveToProfiles();
          }}
          style={[styles.row, styles.actionDivider]}
        >
          <Text style={styles.actionLabel}>Profiles</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={disconnect} style={styles.row}>
          <Text style={styles.destructiveLabel}>Disconnect</Text>
        </Pressable>
      </SettingsSection>
    </>
  );
}
