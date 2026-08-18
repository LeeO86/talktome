import { Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { audioSessionStatusLabel, iosPttEnabled } from '../audio/policy';
import { pttStatusLabel } from '../ptt/policy';
import { describeBleConnection } from '../ble/native';
import { describeBleTarget, type BleTargetSelection } from '../ble/target';
import { fgsStatusLabel } from '../background/fgs';
import { productionChoices } from '../protocol';
import { session, useSessionStore } from '../session/store';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function SettingsScreen({ visible, onClose }: Props) {
  const store = useSessionStore();
  const selection = session.bluetoothButtonSelection();
  const candidates = session.bluetoothButtonCandidates();
  const bleState = {
    kind: store.bleKind,
    name: store.bleName || undefined,
    message: store.bleMessage || undefined,
  };
  const showConnect =
    store.bleKind === 'idle' ||
    store.bleKind === 'failed' ||
    store.bleKind === 'disconnected' ||
    store.bleKind === 'unavailable';
  const showDisconnect =
    store.bleKind === 'scanning' || store.bleKind === 'connecting' || store.bleKind === 'connected';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Pressable onPress={onClose} accessibilityRole="button">
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {store.productions.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Production</Text>
              {productionChoices(store.productions).map((choice) => {
                const selected = choice.id === store.productionId;
                return (
                  <Pressable
                    key={choice.id ?? 'default'}
                    style={[styles.row, selected && styles.rowSelected]}
                    onPress={() => {
                      void session.selectProduction(choice.id === null ? null : { id: choice.id, name: choice.name });
                      onClose();
                    }}
                  >
                    <Text style={styles.rowLabel}>{choice.name}</Text>
                    <Text style={styles.rowValue}>{selected ? 'Selected' : ''}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Layout</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Left-handed</Text>
              <Switch
                value={store.leftHanded}
                onValueChange={(value) => session.setLeftHanded(value)}
                trackColor={{ true: '#3DD6F5' }}
              />
            </View>
            <Text style={styles.footnote}>
              Moves talk controls and the landscape Reply column to the left, and slides right to
              lock — same as the web client.
            </Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Talk & select</Text>
              <Switch
                value={store.talkSelectMode}
                onValueChange={(value) => session.setTalkSelectMode(value)}
                trackColor={{ true: '#E23B4A' }}
              />
            </View>
            <Text style={styles.footnote}>
              Reply becomes a red Talk button. Cards only choose the destination; volume sliders
              stay. Tap a conference icon to set who you hear.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bluetooth Button</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Status</Text>
              <Text style={styles.rowValue}>{describeBleConnection(bleState)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Short press locks</Text>
              <Switch
                value={store.bleShortPressLocks}
                onValueChange={(value) => session.setBluetoothButtonShortPressLocks(value)}
                trackColor={{ true: '#3DD6F5' }}
              />
            </View>
            {showConnect ? (
              <Pressable style={styles.row} onPress={() => void session.connectBluetoothButton()}>
                <Text style={styles.actionLabel}>
                  {store.bleKind === 'scanning' ? 'Scanning…' : 'Connect'}
                </Text>
              </Pressable>
            ) : null}
            {showDisconnect ? (
              <Pressable style={styles.row} onPress={() => void session.disconnectBluetoothButton()}>
                <Text style={styles.actionLabel}>Disconnect</Text>
              </Pressable>
            ) : null}
            <Text style={styles.footnote}>
              GATT PTT-Z01-class buttons (service FFE0, characteristic FFE1). Press 0x01/0xAB,
              release 0x00/0xCD. Rebuild the Dev Client if Connect does nothing.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bluetooth Button Target</Text>
            <TargetChoice
              selection={{ kind: 'reply' }}
              current={selection}
              onPress={() => session.setBluetoothButtonTarget({ kind: 'reply' })}
            />
            {candidates.map((target) => (
              <TargetChoice
                key={`${target.type}-${target.id}`}
                selection={{ kind: 'target', type: target.type, id: target.id, label: target.label }}
                current={selection}
                onPress={() =>
                  session.setBluetoothButtonTarget({
                    kind: 'target',
                    type: target.type,
                    id: target.id,
                    label: target.label,
                  })
                }
              />
            ))}
            <Text style={styles.footnote}>
              Reply follows the last incoming talk or the last target you spoke to. Pick a fixed
              target if you want the button to ignore Reply.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Session</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Background</Text>
              <Text style={styles.rowValue}>
                {Platform.OS === 'ios'
                  ? audioSessionStatusLabel({
                      platform: 'ios',
                      available: store.audioSessionAvailable,
                      active: store.audioSessionActive,
                      keepalive: store.audioKeepalive,
                      pttEnabled: iosPttEnabled(),
                    })
                  : fgsStatusLabel({
                      available: store.fgsAvailable,
                      running: store.fgsRunning,
                      platform: Platform.OS,
                    })}
              </Text>
            </View>
            {Platform.OS === 'ios' ? (
              <View style={styles.row}>
                <Text style={styles.rowLabel}>PushToTalk</Text>
                <Text style={styles.rowValue}>
                  {pttStatusLabel({
                    enabledInBuild: iosPttEnabled(),
                    nativeAvailable: store.pttAvailable,
                    bootstrapEnabled: store.pttBootstrapEnabled,
                    joined: store.pttJoined,
                    verified: store.pttVerified,
                  })}
                </Text>
              </View>
            ) : null}
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Talk lock</Text>
              <Text style={styles.rowValue}>Slide to lock</Text>
            </View>
            <Text style={styles.footnote}>{store.capabilityReason}</Text>
            {Platform.OS === 'android' ? (
              <>
                <Pressable style={styles.row} onPress={() => void session.openBatteryEducation()}>
                  <Text style={styles.actionLabel}>Battery settings</Text>
                </Pressable>
                <Text style={styles.footnote}>
                  Set TalkToMe to Unrestricted (Samsung: Device care) if the session dies after
                  Home or screen-off. This does not promise every OEM.
                </Text>
              </>
            ) : null}
            <Pressable
              style={styles.signOut}
              onPress={() => {
                onClose();
                void session.logout();
              }}
            >
              <Text style={styles.signOutText}>Sign Out</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function TargetChoice({
  selection,
  current,
  onPress,
}: {
  selection: BleTargetSelection;
  current: BleTargetSelection;
  onPress: () => void;
}) {
  const selected =
    selection.kind === 'reply'
      ? current.kind === 'reply'
      : current.kind === 'target' &&
        current.type === selection.type &&
        String(current.id) === String(selection.id);
  return (
    <Pressable style={[styles.row, selected && styles.rowSelected]} onPress={onPress}>
      <Text style={styles.rowLabel}>{describeBleTarget(selection)}</Text>
      <Text style={styles.rowValue}>{selected ? 'Selected' : ''}</Text>
    </Pressable>
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
    padding: 16,
    gap: 18,
  },
  section: {
    backgroundColor: '#FFFFFF',
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
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  actionLabel: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  footnote: {
    color: '#6D6D72',
    fontSize: 13,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  signOut: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  signOutText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
});
