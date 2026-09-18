import { Modal, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useCallback, useEffect, useState } from 'react';

import { audioSessionStatusLabel, iosPttEnabled } from '../audio/policy';
import { describeAudioRouteKind } from '../audio/routes';
import { pttStatusLabel, shouldShowPttJoinBanner } from '../ptt/policy';
import { describePttDevicesSummary } from '../ble/bindings';
import { fgsStatusLabel } from '../background/fgs';
import { FEED_DIM_DB_OPTIONS, dimDbFromSliderPosition, sliderPositionFromDimDb } from '../session/operatorAudio';
import { session, useSessionStore } from '../session/store';
import { describeWatchRemoteStatus, watchRemoteShortStatus, watchRemoteStatus } from '../watch/native';
import { androidSafeArea } from './androidSafeArea';
import { PttAddDevicePage, PttDeviceDetailPage, PttDevicesPage } from './PttSettingsScreens';
import {
  SettingsActionRow,
  SettingsFootnote,
  SettingsHeader,
  SettingsNavRow,
  SettingsRow,
  SettingsSection,
  settingsStyles,
} from './settingsChrome';
import { VolumeSlider } from './VolumeSlider';

type Props = {
  visible: boolean;
  onClose: () => void;
};

type SettingsPage =
  | { kind: 'root' }
  | { kind: 'ptt' }
  | { kind: 'ptt-add' }
  | { kind: 'ptt-device'; id: string }
  | { kind: 'debug' };

export function SettingsScreen({ visible, onClose }: Props) {
  const store = useSessionStore();
  const audio = store.operatorAudio;
  const [page, setPage] = useState<SettingsPage>({ kind: 'root' });
  const showPttList = useCallback(() => setPage({ kind: 'ptt' }), []);

  useEffect(() => {
    if (visible) {
      session.refreshAudioDevices();
      return;
    }
    setPage({ kind: 'root' });
    void session.cancelButtonPairing();
  }, [visible]);

  const header = headerForPage(page, store.bleBindings.find((item) => page.kind === 'ptt-device' && item.id === page.id)?.name);

  const goBack = () => {
    if (page.kind === 'ptt-add' || page.kind === 'ptt-device') {
      setPage({ kind: 'ptt' });
      return;
    }
    setPage({ kind: 'root' });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[settingsStyles.sheet, androidSafeArea]}>
        <SettingsHeader
          title={header.title}
          backLabel={header.backLabel}
          onBack={page.kind === 'root' ? undefined : goBack}
          onDone={onClose}
        />

        <ScrollView contentContainerStyle={settingsStyles.body}>
          {page.kind === 'root' ? (
            <>
              <SettingsSection title="Layout">
                <View style={settingsStyles.row}>
                  <Text style={settingsStyles.rowLabel}>Left-handed</Text>
                  <Switch
                    value={store.leftHanded}
                    onValueChange={(value) => session.setLeftHanded(value)}
                    trackColor={{ true: '#3DD6F5' }}
                  />
                </View>
                <SettingsFootnote>
                  Moves the volume ring and the landscape Reply column to the left, and slides right to
                  lock — same as the web client.
                </SettingsFootnote>
                <View style={settingsStyles.row}>
                  <Text style={settingsStyles.rowLabel}>Talk & select</Text>
                  <Switch
                    value={store.talkSelectMode}
                    onValueChange={(value) => session.setTalkSelectMode(value)}
                    trackColor={{ true: '#E23B4A' }}
                  />
                </View>
                <SettingsFootnote>
                  Reply becomes a red Talk button. Cards only choose the destination. Tap the volume
                  ring to set level in dB and mute. Double-tap a ring to mute. Tap a conference icon to set who you hear.
                </SettingsFootnote>
                <View style={settingsStyles.row}>
                  <Text style={settingsStyles.rowLabel}>Lock multiple targets</Text>
                  <Switch
                    value={store.lockMultipleTargets}
                    onValueChange={(value) => session.setLockMultipleTargets(value)}
                    trackColor={{ true: '#3DD6F5' }}
                  />
                </View>
                <SettingsFootnote>
                  Slide-to-lock adds targets to the locked set instead of replacing it. Tap a locked
                  card to drop just that target — same as the web client.
                </SettingsFootnote>
                <View style={settingsStyles.row}>
                  <Text style={settingsStyles.rowLabel}>Horizontal volume fader</Text>
                  <Switch
                    value={audio.volumeFader}
                    onValueChange={(value) => session.setOperatorAudio({ volumeFader: value })}
                    trackColor={{ true: '#3DD6F5' }}
                  />
                </View>
                <SettingsFootnote>
                  Replaces the plus/minus buttons in the volume overlay and conference member list with
                  a slider.
                </SettingsFootnote>
              </SettingsSection>

              <SettingsSection title="Incoming audio">
                <View style={settingsStyles.row}>
                  <Text style={settingsStyles.rowLabel}>Dim feeds when addressed</Text>
                  <Switch
                    value={audio.feedDimIncoming}
                    onValueChange={(value) => session.setOperatorAudio({ feedDimIncoming: value })}
                    trackColor={{ true: '#3DD6F5' }}
                  />
                </View>
                <View style={settingsStyles.row}>
                  <Text style={settingsStyles.rowLabel}>Dim feeds while speaking</Text>
                  <Switch
                    value={audio.feedDimSelf}
                    onValueChange={(value) => session.setOperatorAudio({ feedDimSelf: value })}
                    trackColor={{ true: '#3DD6F5' }}
                  />
                </View>
                <View style={settingsStyles.row}>
                  <Text style={settingsStyles.rowLabel}>Dim amount</Text>
                  <Text style={settingsStyles.rowValue}>{audio.feedDimDb} dB</Text>
                </View>
                <View style={settingsStyles.sliderRow}>
                  <Text style={settingsStyles.sliderHint}>{FEED_DIM_DB_OPTIONS[0]}</Text>
                  <VolumeSlider
                    light
                    flex
                    accessibilityLabel="Dim amount"
                    value={sliderPositionFromDimDb(audio.feedDimDb)}
                    quantize={(position) => sliderPositionFromDimDb(dimDbFromSliderPosition(position))}
                    onChange={(position) => session.setOperatorAudio({ feedDimDb: dimDbFromSliderPosition(position) })}
                  />
                  <Text style={settingsStyles.sliderHint}>{FEED_DIM_DB_OPTIONS[FEED_DIM_DB_OPTIONS.length - 1]}</Text>
                </View>
                <SettingsFootnote>
                  Same defaults as the web client: dim when someone calls you, not while you talk, by
                  14 dB.
                </SettingsFootnote>
              </SettingsSection>

              <SettingsSection title="Microphone and speaker">
                {store.audioRoutes.map((route) => (
                  <SettingsRow
                    key={route.id}
                    label={route.label}
                    value={route.selected ? 'Selected' : describeAudioRouteKind(route.kind)}
                    selected={route.selected}
                    onPress={() => void session.selectAudioDevice(route.id)}
                  />
                ))}
                <SettingsFootnote>
                  In-call style combos: phone earpiece, speaker, or a connected headset. Audio stays in
                  communication mode so echo cancellation can run.
                </SettingsFootnote>
              </SettingsSection>

              <SettingsSection title="Accessories">
                <SettingsNavRow
                  label="Push-to-talk devices"
                  value={describePttDevicesSummary(store.bleBindings, store.bleDevices)}
                  onPress={() => setPage({ kind: 'ptt' })}
                />
              </SettingsSection>

              {Platform.OS === 'ios' ? (
                <SettingsSection title="Apple Watch">
                  <SettingsRow label="Remote" value={watchRemoteShortStatus(watchRemoteStatus())} />
                  <SettingsFootnote>
                    {describeWatchRemoteStatus(watchRemoteStatus())} The watch lists Reply, then the
                    same online talk targets as the phone. Hold a row to talk; release to stop. Audio
                    stays on the iPhone.
                  </SettingsFootnote>
                </SettingsSection>
              ) : null}

              <SettingsSection title="Session">
                <SettingsRow
                  label="Background"
                  value={
                    Platform.OS === 'ios'
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
                        })
                  }
                />
                {Platform.OS === 'ios' ? (
                  <>
                    <SettingsRow
                      label="PushToTalk"
                      value={pttStatusLabel({
                        enabledInBuild: iosPttEnabled(),
                        nativeAvailable: store.pttAvailable,
                        bootstrapEnabled: store.pttBootstrapEnabled,
                        joined: store.pttJoined,
                        verified: store.pttVerified,
                      })}
                    />
                    {shouldShowPttJoinBanner({
                      platform: Platform.OS,
                      pttEnabled: iosPttEnabled(),
                      bootstrapEnabled: store.pttBootstrapEnabled,
                      joined: store.pttJoined,
                    }) ? (
                      <SettingsActionRow
                        label="Join PushToTalk channel"
                        onPress={() => {
                          void session.joinSystemPttChannel();
                          onClose();
                        }}
                      />
                    ) : null}
                    <SettingsFootnote>
                      Lock Screen, Dynamic Island, and the home widget have Reply lock (toggle locked
                      reply) and Disconnect. On iOS 18, add those same controls to Control Center or the
                      Action Button.
                    </SettingsFootnote>
                  </>
                ) : null}
                {Platform.OS === 'android' ? (
                  <>
                    <SettingsActionRow
                      label="Battery settings"
                      onPress={() => void session.openBatteryEducation()}
                    />
                    <SettingsFootnote>
                      Set TalkToMe to Unrestricted (Samsung: Device care) if the session dies after
                      Home or screen-off. This does not promise every OEM.
                    </SettingsFootnote>
                  </>
                ) : null}
                <SettingsNavRow label="Debug" onPress={() => setPage({ kind: 'debug' })} />
                <Pressable
                  style={settingsStyles.signOut}
                  onPress={() => {
                    onClose();
                    void session.leaveToProfiles();
                  }}
                >
                  <Text style={settingsStyles.signOutText}>Sign Out</Text>
                </Pressable>
              </SettingsSection>
            </>
          ) : null}

          {page.kind === 'ptt' ? (
            <PttDevicesPage
              onAddDevice={() => setPage({ kind: 'ptt-add' })}
              onOpenDevice={(id) => setPage({ kind: 'ptt-device', id })}
            />
          ) : null}

          {page.kind === 'ptt-add' ? <PttAddDevicePage onBound={showPttList} /> : null}

          {page.kind === 'ptt-device' ? (
            <PttDeviceDetailPage deviceId={page.id} onDeleted={showPttList} />
          ) : null}

          {page.kind === 'debug' ? <DebugSettingsPage /> : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function headerForPage(page: SettingsPage, deviceName?: string): { title: string; backLabel: string } {
  switch (page.kind) {
    case 'ptt':
      return { title: 'PTT devices', backLabel: 'Settings' };
    case 'ptt-add':
      return { title: 'Add a device', backLabel: 'Devices' };
    case 'ptt-device':
      return { title: deviceName || 'Accessory', backLabel: 'Devices' };
    case 'debug':
      return { title: 'Debug', backLabel: 'Settings' };
    default:
      return { title: 'Settings', backLabel: 'Settings' };
  }
}

function DebugSettingsPage() {
  const store = useSessionStore();
  const audio = store.operatorAudio;

  return (
    <>
      <SettingsSection title="Audio">
        <SettingsRow label="Used mic" value={store.audioInputLabel || store.captureMicLabel} />
        <SettingsRow label="Used speaker" value={store.audioOutputLabel} />
        <View style={settingsStyles.row}>
          <Text style={settingsStyles.rowLabel}>Echo cancellation</Text>
          <Switch
            value={audio.echoCancellation}
            onValueChange={(value) => session.setOperatorAudio({ echoCancellation: value })}
            trackColor={{ true: '#3DD6F5' }}
          />
        </View>
        <SettingsFootnote>
          {processingLine('Echo cancellation', audio.echoCancellation, store.captureEchoCancellation, store.audioVoiceProcessing)}
        </SettingsFootnote>
        <View style={settingsStyles.row}>
          <Text style={settingsStyles.rowLabel}>Noise suppression</Text>
          <Switch
            value={audio.noiseSuppression}
            onValueChange={(value) => session.setOperatorAudio({ noiseSuppression: value })}
            trackColor={{ true: '#3DD6F5' }}
          />
        </View>
        <SettingsFootnote>
          {processingLine('Noise suppression', audio.noiseSuppression, store.captureNoiseSuppression, store.audioVoiceProcessing)}
        </SettingsFootnote>
        <View style={settingsStyles.row}>
          <Text style={settingsStyles.rowLabel}>Auto gain</Text>
          <Switch
            value={audio.autoGainControl}
            onValueChange={(value) => session.setOperatorAudio({ autoGainControl: value })}
            trackColor={{ true: '#3DD6F5' }}
          />
        </View>
        <SettingsFootnote>
          {processingLine('Auto gain', audio.autoGainControl, store.captureAutoGainControl, store.audioVoiceProcessing)}
          {store.audioVoiceProcessing ? ' Voice-processing session is on.' : ' Voice-processing session is off.'}
        </SettingsFootnote>
      </SettingsSection>

      <SettingsSection title="Session">
        <SettingsRow label="Talk lock" value="Slide to lock" />
        <SettingsRow label="Server version" value={store.serverAppVersion || 'Unknown'} />
        <SettingsRow
          label="Incoming audio"
          value={`${store.activeRemoteCount} live / ${store.overBudget ? 'over budget' : 'ok'}`}
        />
        {store.capabilityReason ? <SettingsFootnote>{store.capabilityReason}</SettingsFootnote> : null}
        {store.pttDiagnostic ? <SettingsFootnote>{store.pttDiagnostic}</SettingsFootnote> : null}
        {store.mediaDebug ? <SettingsFootnote>{store.mediaDebug}</SettingsFootnote> : null}
        <SettingsFootnote>
          Camera tally uses a red PGM frame or a green preview frame, same as the web client.
          Incoming audio follows the selected production.
        </SettingsFootnote>
      </SettingsSection>
      {store.pttHardwareLog.length > 0 ? (
        <SettingsSection title="PTT hardware">
          {store.pttHardwareLog.slice(-12).map((line, index) => (
            <SettingsFootnote key={`${index}-${line}`}>{line}</SettingsFootnote>
          ))}
        </SettingsSection>
      ) : null}
    </>
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
