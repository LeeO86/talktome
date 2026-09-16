import { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';

import {
  BLE_MAX_ACCESSORIES,
  describeBleDeviceStatus,
  describeBleReleaseTimeout,
  liveDeviceById,
} from '../ble/bindings';
import { BLE_BUTTON_PAIRING_MS } from '../ble/catalog';
import { describeBleTarget, type BleTargetSelection } from '../ble/target';
import { session, useSessionStore } from '../session/store';
import {
  SettingsActionRow,
  SettingsFootnote,
  SettingsNavRow,
  SettingsRow,
  SettingsSection,
  settingsStyles,
} from './settingsChrome';

export function PttDevicesPage({
  onAddDevice,
  onOpenDevice,
}: {
  onAddDevice: () => void;
  onOpenDevice: (id: string) => void;
}) {
  const store = useSessionStore();
  const atLimit = store.bleBindings.length >= BLE_MAX_ACCESSORIES;

  return (
    <>
      <SettingsSection title="Devices">
        {store.bleBindings.length === 0 ? (
          <SettingsFootnote>No PTT accessories yet. Add one below.</SettingsFootnote>
        ) : (
          store.bleBindings.map((binding) => {
            const live = liveDeviceById(store.bleDevices, binding.id);
            return (
              <SettingsNavRow
                key={binding.id}
                label={binding.name}
                subtitle={describeBleTarget(binding.target)}
                value={describeBleDeviceStatus(live)}
                onPress={() => onOpenDevice(binding.id)}
              />
            );
          })
        )}
        <SettingsActionRow
          label={atLimit ? `Limit of ${BLE_MAX_ACCESSORIES} accessories` : 'Add a device'}
          disabled={atLimit}
          onPress={onAddDevice}
        />
        <SettingsFootnote>
          Pair speaker-mic audio (HFP/HSP) in system Bluetooth first. Add a device here to bind the
          PTT button: hold it until TalkToMe hears a known command. Catalog names are only a hint
          — unknown buttons that speak Zello or HM-10 notifies still bind.
        </SettingsFootnote>
      </SettingsSection>

      <SettingsSection title="Button behavior">
        <View style={settingsStyles.row}>
          <Text style={settingsStyles.rowLabel}>Short press locks</Text>
          <Switch
            value={store.bleShortPressLocks}
            onValueChange={(value) => session.setBluetoothButtonShortPressLocks(value)}
            trackColor={{ true: '#3DD6F5' }}
          />
        </View>
        <SettingsRow
          label="Release timeout"
          value={describeBleReleaseTimeout(store.bleReleaseTimeoutMs)}
          onPress={() => session.cycleBluetoothReleaseTimeout()}
        />
        <SettingsFootnote>
          If a PTT release notify is lost, TalkToMe closes the mic after this delay. Off never
          forces a release (disconnect still does). Tap to cycle 10s / 15s / 30s / 1 min / 2 min /
          Off.
        </SettingsFootnote>
      </SettingsSection>
    </>
  );
}

export function PttAddDevicePage({ onBound }: { onBound: () => void }) {
  const store = useSessionStore();
  const [remaining, setRemaining] = useState(Math.round(BLE_BUTTON_PAIRING_MS / 1000));
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    void session.beginButtonPairing();
    return () => {
      void session.cancelButtonPairing();
    };
  }, []);

  useEffect(() => {
    if (store.blePairingActive) {
      setArmed(true);
    }
  }, [store.blePairingActive]);

  useEffect(() => {
    if (armed && store.blePairingFoundId) {
      onBound();
    }
  }, [armed, onBound, store.blePairingFoundId]);

  useEffect(() => {
    if (!store.blePairingActive) {
      return;
    }
    const started = Date.now();
    setRemaining(Math.round(BLE_BUTTON_PAIRING_MS / 1000));
    const timer = setInterval(() => {
      setRemaining(Math.max(0, Math.round((BLE_BUTTON_PAIRING_MS - (Date.now() - started)) / 1000)));
    }, 250);
    return () => clearInterval(timer);
  }, [store.blePairingActive]);

  const listening = store.blePairingActive;
  const message = store.blePairingMessage || (listening ? 'Hold the PTT button on the accessory.' : '');

  return (
    <>
      <SettingsSection>
        <View style={settingsStyles.pairingHero}>
          <Text style={settingsStyles.pairingTitle}>
            {listening ? 'Hold the PTT button' : store.blePairingFoundId ? 'Device added' : 'No button heard'}
          </Text>
          <Text style={settingsStyles.pairingBody}>{message}</Text>
          {listening ? <Text style={settingsStyles.pairingTimer}>{remaining}s</Text> : null}
        </View>
        {listening ? (
          <SettingsFootnote>
            TalkToMe listens for a known Zello or HM-10 press or release. Keep holding until the
            timer ends or the device appears.
          </SettingsFootnote>
        ) : (
          <SettingsActionRow label="Try again" onPress={() => void session.beginButtonPairing()} />
        )}
      </SettingsSection>
    </>
  );
}

export function PttDeviceDetailPage({
  deviceId,
  onDeleted,
}: {
  deviceId: string;
  onDeleted: () => void;
}) {
  const store = useSessionStore();
  const binding = store.bleBindings.find((item) => item.id === deviceId);
  const live = liveDeviceById(store.bleDevices, deviceId);
  const connected = live?.kind === 'connected' || live?.kind === 'connecting';
  const selection = session.bluetoothButtonSelection(deviceId);
  const candidates = session.bluetoothButtonCandidates();

  useEffect(() => {
    if (!binding) {
      onDeleted();
    }
  }, [binding, onDeleted]);

  if (!binding) {
    return null;
  }

  return (
    <>
      <SettingsSection title="Accessory">
        <SettingsRow label="Status" value={describeBleDeviceStatus(live)} />
        {connected ? (
          <SettingsActionRow
            label="Disconnect"
            onPress={() => void session.disconnectBluetoothButton(deviceId)}
          />
        ) : (
          <SettingsActionRow
            label="Connect"
            onPress={() => void session.connectKnownBluetoothAccessory(deviceId)}
          />
        )}
      </SettingsSection>

      <SettingsSection title="Talk target">
        <TargetChoice
          selection={{ kind: 'reply' }}
          current={selection}
          onPress={() => session.setBluetoothButtonTarget({ kind: 'reply' }, deviceId)}
        />
        {candidates.map((target) => (
          <TargetChoice
            key={`${deviceId}-${target.type}-${target.id}`}
            selection={{
              kind: 'target',
              type: target.type,
              id: target.id,
              label: target.label,
            }}
            current={selection}
            onPress={() =>
              session.setBluetoothButtonTarget(
                {
                  kind: 'target',
                  type: target.type,
                  id: target.id,
                  label: target.label,
                },
                deviceId,
              )
            }
          />
        ))}
        <SettingsFootnote>
          Reply is the default. It follows this production (last incoming, else first talkable
          card). A fixed target is used only while that card exists here.
        </SettingsFootnote>
      </SettingsSection>

      <SettingsSection>
        <SettingsActionRow
          label="Delete device"
          destructive
          onPress={() => {
            session.removeBluetoothAccessory(deviceId);
            onDeleted();
          }}
        />
      </SettingsSection>
    </>
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
    <SettingsRow label={describeBleTarget(selection)} value={selected ? 'Selected' : ''} selected={selected} onPress={onPress} />
  );
}
