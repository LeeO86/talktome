import { Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useEffect } from 'react';

import { audioSessionStatusLabel, iosPttEnabled } from '../audio/policy';
import { describeAudioRouteKind } from '../audio/routes';
import { pttStatusLabel, shouldShowPttJoinBanner } from '../ptt/policy';
import { describeBleConnection } from '../ble/native';
import { describeBleTarget, type BleTargetSelection } from '../ble/target';
import { fgsStatusLabel } from '../background/fgs';
import { FEED_DIM_DB_OPTIONS, dimDbFromSliderPosition, sliderPositionFromDimDb } from '../session/operatorAudio';
import { session, useSessionStore } from '../session/store';
import { describeWatchRemoteStatus, watchRemoteShortStatus, watchRemoteStatus } from '../watch/native';
import { androidSafeArea } from './androidSafeArea';
import { VolumeSlider } from './VolumeSlider';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function SettingsScreen({ visible, onClose }: Props) {
  const store = useSessionStore();
  const audio = store.operatorAudio;
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

  useEffect(() => {
    if (visible) {
      session.refreshAudioDevices();
    }
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, androidSafeArea]}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Pressable onPress={onClose} accessibilityRole="button">
            <Text style={styles.done}>Done</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
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
              Moves the volume ring and the landscape Reply column to the left, and slides right to
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
              Reply becomes a red Talk button. Cards only choose the destination. Tap the volume
              ring to set level in dB and mute. Double-tap a ring to mute. Tap a conference icon to set who you hear.
            </Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Horizontal volume fader</Text>
              <Switch
                value={audio.volumeFader}
                onValueChange={(value) => session.setOperatorAudio({ volumeFader: value })}
                trackColor={{ true: '#3DD6F5' }}
              />
            </View>
            <Text style={styles.footnote}>
              Replaces the plus/minus buttons in the volume overlay and conference member list with
              a slider.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Incoming audio</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Dim feeds when addressed</Text>
              <Switch
                value={audio.feedDimIncoming}
                onValueChange={(value) => session.setOperatorAudio({ feedDimIncoming: value })}
                trackColor={{ true: '#3DD6F5' }}
              />
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Dim feeds while speaking</Text>
              <Switch
                value={audio.feedDimSelf}
                onValueChange={(value) => session.setOperatorAudio({ feedDimSelf: value })}
                trackColor={{ true: '#3DD6F5' }}
              />
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Dim amount</Text>
              <Text style={styles.rowValue}>{audio.feedDimDb} dB</Text>
            </View>
            <View style={styles.sliderRow}>
              <Text style={styles.sliderHint}>{FEED_DIM_DB_OPTIONS[0]}</Text>
              <VolumeSlider
                light
                flex
                accessibilityLabel="Dim amount"
                value={sliderPositionFromDimDb(audio.feedDimDb)}
                quantize={(position) => sliderPositionFromDimDb(dimDbFromSliderPosition(position))}
                onChange={(position) => session.setOperatorAudio({ feedDimDb: dimDbFromSliderPosition(position) })}
              />
              <Text style={styles.sliderHint}>{FEED_DIM_DB_OPTIONS[FEED_DIM_DB_OPTIONS.length - 1]}</Text>
            </View>
            <Text style={styles.footnote}>
              Same defaults as the web client: dim when someone calls you, not while you talk, by
              14 dB.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Microphone and speaker</Text>
            {store.audioRoutes.map((route) => (
              <Pressable
                key={route.id}
                style={[styles.row, route.selected && styles.rowSelected]}
                onPress={() => void session.selectAudioDevice(route.id)}
              >
                <Text style={styles.rowLabel}>{route.label}</Text>
                <Text style={styles.rowValue}>
                  {route.selected ? 'Selected' : describeAudioRouteKind(route.kind)}
                </Text>
              </Pressable>
            ))}
            <Text style={styles.footnote}>
              In-call style combos: phone earpiece, speaker, or a connected headset. Audio stays in
              communication mode so echo cancellation can run.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Audio debug</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Used mic</Text>
              <Text style={styles.rowValue}>{store.audioInputLabel || store.captureMicLabel}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Used speaker</Text>
              <Text style={styles.rowValue}>{store.audioOutputLabel}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Echo cancellation</Text>
              <Switch
                value={audio.echoCancellation}
                onValueChange={(value) => session.setOperatorAudio({ echoCancellation: value })}
                trackColor={{ true: '#3DD6F5' }}
              />
            </View>
            <Text style={styles.footnote}>
              {processingLine('Echo cancellation', audio.echoCancellation, store.captureEchoCancellation, store.audioVoiceProcessing)}
            </Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Noise suppression</Text>
              <Switch
                value={audio.noiseSuppression}
                onValueChange={(value) => session.setOperatorAudio({ noiseSuppression: value })}
                trackColor={{ true: '#3DD6F5' }}
              />
            </View>
            <Text style={styles.footnote}>
              {processingLine('Noise suppression', audio.noiseSuppression, store.captureNoiseSuppression, store.audioVoiceProcessing)}
            </Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Auto gain</Text>
              <Switch
                value={audio.autoGainControl}
                onValueChange={(value) => session.setOperatorAudio({ autoGainControl: value })}
                trackColor={{ true: '#3DD6F5' }}
              />
            </View>
            <Text style={styles.footnote}>
              {processingLine('Auto gain', audio.autoGainControl, store.captureAutoGainControl, store.audioVoiceProcessing)}
              {store.audioVoiceProcessing ? ' Voice-processing session is on.' : ' Voice-processing session is off.'}
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
              release 0x00/0xCD.
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

          {Platform.OS === 'ios' ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Apple Watch</Text>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Remote</Text>
                <Text style={styles.rowValue}>{watchRemoteShortStatus(watchRemoteStatus())}</Text>
              </View>
              <Text style={styles.footnote}>
                {describeWatchRemoteStatus(watchRemoteStatus())} The watch lists Reply, then the
                same online talk targets as the phone. Hold a row to talk; release to stop. Audio
                stays on the iPhone.
              </Text>
            </View>
          ) : null}

          {Platform.OS === 'ios' ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Session controls</Text>
              <Text style={styles.footnote}>
                Lock Screen, Dynamic Island, and the home widget have Reply lock (toggle locked
                reply) and Disconnect. On iOS 18, add those same controls to Control Center or the
                Action Button. Shortcuts still include Reply lock and Disconnect.
              </Text>
            </View>
          ) : null}

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
                      pttJoined: store.pttJoined,
                    })
                  : fgsStatusLabel({
                      available: store.fgsAvailable,
                      running: store.fgsRunning,
                      platform: Platform.OS,
                    })}
              </Text>
            </View>
            {Platform.OS === 'ios' ? (
              <>
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
                {shouldShowPttJoinBanner({
                  platform: Platform.OS,
                  pttEnabled: iosPttEnabled(),
                  bootstrapEnabled: store.pttBootstrapEnabled,
                  joined: store.pttJoined,
                }) ? (
                  <Pressable
                    style={styles.row}
                    onPress={() => {
                      void session.joinSystemPttChannel();
                      onClose();
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={styles.actionLabel}>Join PushToTalk channel</Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Talk lock</Text>
              <Text style={styles.rowValue}>Slide to lock</Text>
            </View>
            <Text style={styles.footnote}>{store.capabilityReason}</Text>
            {store.pttDiagnostic ? <Text style={styles.footnote}>{store.pttDiagnostic}</Text> : null}
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
                void session.leaveToProfiles();
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

function processingLine(
  label: string,
  requested: boolean,
  applied: boolean | null,
  voiceProcessing: boolean,
): string {
  if (applied === true) {
    return `${label} is on.`;
  }
  if (applied === false) {
    return requested ? `${label} was requested but the track reports off.` : `${label} is off.`;
  }
  if (requested && voiceProcessing) {
    return `${label} is requested and the call session is using voice processing.`;
  }
  if (requested) {
    return `${label} is requested.`;
  }
  return `${label} is off.`;
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
    flex: 1,
    paddingRight: 12,
  },
  rowValue: {
    color: '#6D6D72',
    fontSize: 16,
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  sliderHint: {
    color: '#6D6D72',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    width: 32,
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
