import { useEffect, useState } from 'react';
import { Platform, Switch, Text, View } from 'react-native';

import {
  BLE_MAX_ACCESSORIES,
  describeBindingTargets,
  describeBleDeviceStatus,
  describeBleReleaseTimeout,
  liveDeviceById,
  visibleButtons,
  visibleTalkButtons,
} from '../ble/bindings';
import { BLE_BUTTON_PAIRING_MS } from '../ble/catalog';
import { describeBleTarget, type BleTargetSelection } from '../ble/target';
import { describePttButton, describePttDeviceKind, isChannelButton, ONBOARD_DEVICE_ID } from '../hardware/events';
import type { PttButton } from '../hardware/events';
import { session, useSessionStore } from '../session/store';
import {
  SettingsActionRow,
  SettingsFootnote,
  SettingsHint,
  SettingsNavRow,
  SettingsRow,
  SettingsSection,
  useSettingsStyles,
} from './settingsChrome';

export function PttDevicesPage({
  onAddDevice,
  onOpenDevice,
}: {
  onAddDevice: () => void;
  onOpenDevice: (id: string) => void;
}) {
  const store = useSessionStore();
  const styles = useSettingsStyles();
  const atLimit = store.bleBindings.length >= BLE_MAX_ACCESSORIES;

  return (
    <>
      <SettingsSection title="Devices">
        {store.bleBindings.length === 0 ? (
          <SettingsFootnote>No PTT accessories yet. Add one below.</SettingsFootnote>
        ) : (
          store.bleBindings.map((binding) => {
            const live = liveDeviceById(store.bleDevices, binding.id, binding);
            return (
              <SettingsNavRow
                key={binding.id}
                label={binding.name}
                subtitle={describeBindingTargets(binding)}
                value={describeBleDeviceStatus(live, binding)}
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
        <SettingsHint
          full="Pair speaker-mic audio (HFP/HSP) in system Bluetooth first. Add a device here to bind the PTT button: hold it until TalkToMe hears a known command. Catalog names are only a hint — unknown Zello BLE, Classic serial, USB-C, and rugged-phone keys still bind."
          compact="Pair speaker-mic audio in system Bluetooth first. Hold PTT here to bind the button."
        />
      </SettingsSection>

      <SettingsSection title="Button behavior">
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Short press locks</Text>
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
        <SettingsHint
          full="If a PTT release is lost, TalkToMe closes the mic after this delay. Off never forces a release (disconnect still does). Tap to cycle 10s / 15s / 30s / 1 min / 2 min / Off."
          compact="Closes the mic if a PTT release is lost. Tap to cycle timeout / Off."
        />
      </SettingsSection>
    </>
  );
}

export function PttAddDevicePage({ onBound }: { onBound: () => void }) {
  const store = useSessionStore();
  const styles = useSettingsStyles();
  const [remaining, setRemaining] = useState(Math.round(BLE_BUTTON_PAIRING_MS / 1000));
  const [armed, setArmed] = useState(false);
  const serial = store.bondedSerialDevices.filter(
    (item) => !store.bleBindings.some((binding) => binding.id === item.id),
  );

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
  const message =
    store.blePairingMessage || (listening ? 'Hold a PTT button, SOS, or turn the channel knob.' : '');

  return (
    <>
      <SettingsSection>
        <View style={styles.pairingHero}>
          <Text style={styles.pairingTitle}>
            {listening ? 'Hold the PTT button' : store.blePairingFoundId ? 'Device added' : 'No button heard'}
          </Text>
          <Text style={styles.pairingBody}>{message}</Text>
          {listening ? <Text style={styles.pairingTimer}>{remaining}s</Text> : null}
        </View>
        {listening ? (
          <SettingsHint
            full="TalkToMe listens for Zello BLE notifies, Classic serial tokens, USB-C keycodes, and onboard rugged-phone keys (RG440, Sonim, Inrico, and anything that broadcasts Zello intents). Keep holding until the timer ends or the device appears."
            compact="Hold PTT until the timer ends or the device appears."
          />
        ) : (
          <SettingsActionRow label="Try again" onPress={() => void session.beginButtonPairing()} />
        )}
      </SettingsSection>
      {Platform.OS === 'android' && serial.length > 0 ? (
        <SettingsSection title="Bonded serial devices">
          {serial.map((item) => (
            <SettingsActionRow
              key={item.id}
              label={item.pttHint ? `${item.name} (PTT)` : item.name}
              onPress={() => void session.probeSerialAccessory(item.id)}
            />
          ))}
          <SettingsHint
            full="Zello speaker-mics that advertise PTT in the Bluetooth name are probed automatically. Pick any other bonded Classic device if its name does not contain PTT."
            compact="Names with PTT are probed automatically. Pick another bonded device if needed."
          />
        </SettingsSection>
      ) : null}
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
  const styles = useSettingsStyles();
  const binding = store.bleBindings.find((item) => item.id === deviceId);
  const live = liveDeviceById(store.bleDevices, deviceId, binding);
  const connected = live?.kind === 'connected' || live?.kind === 'connecting' || binding?.kind === 'onboard';
  const candidates = session.bluetoothButtonCandidates();
  const talkButtons = binding ? visibleTalkButtons(binding) : [];
  const hasChannel = binding ? visibleButtons(binding).some((button) => isChannelButton(button)) : false;

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
        <SettingsRow label="Transport" value={describePttDeviceKind(binding.kind)} />
        <SettingsRow label="Status" value={describeBleDeviceStatus(live, binding)} />
        {binding.kind === 'onboard' ? (
          <SettingsHint
            full="Phone keys stay available while TalkToMe is running, including with the screen off. On a RugGear RG440, set CustomKey to PTT so the side key broadcasts Zello intents."
            compact="Phone keys work with the screen off. On RG440 set CustomKey to PTT."
          />
        ) : connected ? (
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

      {talkButtons.map((button) => (
        <TalkTargetSection
          key={`${deviceId}-${button}`}
          deviceId={deviceId}
          button={button}
          candidates={candidates}
        />
      ))}

      {hasChannel ? (
        <SettingsSection title="Channel knob / up-down">
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Change PTT 1 target</Text>
            <Switch
              value={binding.rotaryRetargetsPtt1}
              onValueChange={(value) => session.setRotaryRetargetsPtt1(deviceId, value)}
              trackColor={{ true: '#3DD6F5' }}
            />
          </View>
          <SettingsHint
            full="When this is on, the channel knob and up/down retarget PTT 1. Otherwise they do nothing. SOS always replies."
            compact="Knob and up/down retarget PTT 1 when this is on. SOS always replies."
          />
        </SettingsSection>
      ) : null}

      <SettingsSection>
        <SettingsActionRow
          label={deviceId === ONBOARD_DEVICE_ID ? 'Remove this phone' : 'Delete device'}
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

function TalkTargetSection({
  deviceId,
  button,
  candidates,
}: {
  deviceId: string;
  button: PttButton;
  candidates: ReturnType<typeof session.bluetoothButtonCandidates>;
}) {
  const selection = session.bluetoothButtonSelection(deviceId, button);
  const lockedSos = button === 'sos';
  return (
    <SettingsSection title={`${describePttButton(button)} target`}>
      {lockedSos ? (
        <>
          <SettingsRow label="Reply" value="Always" selected />
          <SettingsFootnote>SOS always talks to Reply in this production.</SettingsFootnote>
        </>
      ) : (
        <>
          <TargetChoice
            selection={{ kind: 'reply' }}
            current={selection}
            onPress={() => session.setBluetoothButtonTarget({ kind: 'reply' }, deviceId, button)}
          />
          {candidates.map((target) => (
            <TargetChoice
              key={`${deviceId}-${button}-${target.type}-${target.id}`}
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
                  button,
                )
              }
            />
          ))}
          <SettingsHint
            full="Reply follows this production (last incoming, else first talkable card). A fixed target is used only while that card exists here."
            compact="Reply follows last incoming, else the first talkable card."
          />
        </>
      )}
    </SettingsSection>
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
