import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { productionChoices, visibleProductionName } from '../protocol';
import { connectionHealthFromSession } from '../session/connectionHealth';
import { session, useSessionStore } from '../session/store';
import { androidSafeArea } from './androidSafeArea';
import { ConnectionStatusBadge } from './ConnectionStatusBadge';

type Props = {
  visible: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
};

export function SessionSheet({ visible, onClose, onOpenSettings }: Props) {
  const store = useSessionStore();
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
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, androidSafeArea]}>
        <View style={styles.header}>
          <Text style={styles.title}>Session</Text>
          <Pressable onPress={onClose} accessibilityRole="button">
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.card}>
            <Text style={styles.label}>Signed in as</Text>
            <Text style={styles.value}>{store.identity?.name ?? store.username}</Text>
            <Text style={styles.label}>Connection</Text>
            <View style={styles.connectionRow}>
              <ConnectionStatusBadge health={connection} light />
              <Text style={styles.connectionDetail}>{connection.label}</Text>
            </View>
            <Text style={styles.label}>Server</Text>
            <Text style={styles.value}>{store.serverAddress}</Text>
            {production && choices.length === 0 ? (
              <>
                <Text style={styles.label}>Production</Text>
                <Text style={styles.value}>{production}</Text>
              </>
            ) : null}
          </View>

          {choices.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Production</Text>
              {choices.map((choice) => {
                const selected = choice.id === store.productionId;
                return (
                  <Pressable
                    key={choice.id ?? 'default'}
                    style={[styles.row, selected && styles.rowSelected]}
                    onPress={() => {
                      void session.selectProduction(
                        choice.id === null ? null : { id: choice.id, name: choice.name },
                      );
                    }}
                  >
                    <Text style={styles.rowLabel}>{choice.name}</Text>
                    <Text style={styles.rowValue}>{selected ? 'Selected' : ''}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onOpenSettings} style={styles.actionRow}>
              <Text style={styles.actionLabel}>Settings</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onClose();
                void session.leaveToProfiles();
              }}
              style={styles.actionRow}
            >
              <Text style={styles.actionLabel}>Profiles</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={disconnect} style={styles.actionRow}>
              <Text style={styles.danger}>Disconnect</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: '#111',
  },
  done: {
    color: '#007AFF',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 6,
  },
  body: {
    paddingBottom: 32,
  },
  card: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  label: {
    color: '#6D6D72',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 10,
    textTransform: 'uppercase',
  },
  value: {
    color: '#111',
    fontSize: 17,
    marginTop: 4,
  },
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  connectionDetail: {
    color: '#6D6D72',
    fontSize: 15,
    flexShrink: 1,
  },
  section: {
    marginHorizontal: 16,
    marginTop: 18,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    paddingBottom: 8,
  },
  sectionTitle: {
    color: '#6D6D72',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowSelected: {
    backgroundColor: '#E8F7FF',
  },
  rowLabel: {
    color: '#111',
    fontSize: 16,
  },
  rowValue: {
    color: '#6D6D72',
    fontSize: 16,
  },
  actions: {
    marginHorizontal: 16,
    marginTop: 18,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  actionRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  actionLabel: {
    color: '#007AFF',
    fontSize: 17,
    fontWeight: '600',
  },
  danger: {
    color: '#FF3B30',
    fontSize: 17,
    fontWeight: '600',
  },
});
