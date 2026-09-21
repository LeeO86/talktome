import { Modal, Platform, Pressable, ScrollView, Text, View, useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
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
  SettingsHint,
  SettingsNavRow,
  SettingsRow,
  SettingsSection,
  SettingsSwitchRow,
  SettingsThemeProvider,
  useSettingsStyles,
  useSettingsTheme,
} from './settingsChrome';
import { VolumeSlider } from './VolumeSlider';

type Props = {
  visible: boolean;
  onClose: () => void;
};

type SettingsPage =
  | { kind: 'root' }
  | { kind: 'layout' }
  | { kind: 'audio' }
  | { kind: 'ptt' }
  | { kind: 'ptt-add' }
  | { kind: 'ptt-device'; id: string }
  | { kind: 'debug' };

export function SettingsScreen({ visible, onClose }: Props) {
  const store = useSessionStore();
  const scheme = useColorScheme();
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

  const header = headerForPage(
    page,
    store.bleBindings.find((item) => page.kind === 'ptt-device' && item.id === page.id)?.name,
  );

  const goBack = () => {
    if (page.kind === 'ptt-add' || page.kind === 'ptt-device') {
      setPage({ kind: 'ptt' });
      return;
    }
    setPage({ kind: 'root' });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SettingsThemeProvider scheme={scheme}>
        <SettingsSheet
          header={header}
          page={page}
          onBack={page.kind === 'root' ? undefined : goBack}
          onClose={onClose}
          onOpenLayout={() => setPage({ kind: 'layout' })}
          onOpenAudio={() => setPage({ kind: 'audio' })}
          onOpenAccessories={() => setPage({ kind: 'ptt' })}
          onOpenDebug={() => setPage({ kind: 'debug' })}
          onAddDevice={() => setPage({ kind: 'ptt-add' })}
          onOpenDevice={(id) => setPage({ kind: 'ptt-device', id })}
          showPttList={showPttList}
        />
      </SettingsThemeProvider>
    </Modal>
  );
}

function SettingsSheet({
  header,
  page,
  onBack,
  onClose,
  onOpenLayout,
  onOpenAudio,
  onOpenAccessories,
  onOpenDebug,
  onAddDevice,
  onOpenDevice,
  showPttList,
}: {
  header: { title: string; backLabel: string };
  page: SettingsPage;
  onBack?: () => void;
  onClose: () => void;
  onOpenLayout: () => void;
  onOpenAudio: () => void;
  onOpenAccessories: () => void;
  onOpenDebug: () => void;
  onAddDevice: () => void;
  onOpenDevice: (id: string) => void;
  showPttList: () => void;
}) {
  const store = useSessionStore();
  const styles = useSettingsStyles();
  const { scheme } = useSettingsTheme();

  return (
    <View style={[styles.sheet, androidSafeArea]}>
      {Platform.OS === 'android' ? <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} /> : null}
      <SettingsHeader
        title={header.title}
        backLabel={header.backLabel}
        onBack={onBack}
        onDone={onClose}
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
        {page.kind === 'root' ? (
          <>
            <SettingsSection>
              <SettingsNavRow label="Layout" onPress={onOpenLayout} />
              <SettingsNavRow label="Audio" onPress={onOpenAudio} />
              <SettingsNavRow
                label="Accessories"
                value={describePttDevicesSummary(store.bleBindings, store.bleDevices)}
                onPress={onOpenAccessories}
              />
              <SettingsNavRow label="Debug" onPress={onOpenDebug} />
            </SettingsSection>
            <SettingsSection>
              <Pressable
                style={styles.signOut}
                onPress={() => {
                  onClose();
                  void session.leaveToProfiles();
                }}
              >
                <Text style={styles.signOutText}>Sign Out</Text>
              </Pressable>
            </SettingsSection>
          </>
        ) : null}

        {page.kind === 'layout' ? <LayoutSettingsPage /> : null}
        {page.kind === 'audio' ? <AudioSettingsPage /> : null}

        {page.kind === 'ptt' ? (
          <>
            <PttDevicesPage onAddDevice={onAddDevice} onOpenDevice={onOpenDevice} />
            {Platform.OS === 'ios' ? <WatchSettingsSection /> : null}
          </>
        ) : null}

        {page.kind === 'ptt-add' ? <PttAddDevicePage onBound={showPttList} /> : null}

        {page.kind === 'ptt-device' ? (
          <PttDeviceDetailPage deviceId={page.id} onDeleted={showPttList} />
        ) : null}

        {page.kind === 'debug' ? <DebugSettingsPage onClose={onClose} /> : null}
      </ScrollView>
    </View>
  );
}

function headerForPage(page: SettingsPage, deviceName?: string): { title: string; backLabel: string } {
  switch (page.kind) {
    case 'layout':
      return { title: 'Layout', backLabel: 'Settings' };
    case 'audio':
      return { title: 'Audio', backLabel: 'Settings' };
    case 'ptt':
      return { title: 'Accessories', backLabel: 'Settings' };
    case 'ptt-add':
      return { title: 'Add a device', backLabel: 'Accessories' };
    case 'ptt-device':
      return { title: deviceName || 'Accessory', backLabel: 'Accessories' };
    case 'debug':
      return { title: 'Debug', backLabel: 'Settings' };
    default:
      return { title: 'Settings', backLabel: 'Settings' };
  }
}

function LayoutSettingsPage() {
  const store = useSessionStore();
  const audio = store.operatorAudio;

  return (
    <>
      <SettingsSection>
        <SettingsSwitchRow
          label="Left-handed"
          value={store.leftHanded}
          onValueChange={(value) => session.setLeftHanded(value)}
        />
        <SettingsHint
          full="Moves the volume ring and the phone-landscape Reply column to the left, and slides right to lock — same as the web client. Tablets keep Reply on the bottom."
          compact="Volume and phone-landscape Reply move left. Slide right to lock."
        />
        <SettingsSwitchRow
          label="Talk & select"
          value={store.talkSelectMode}
          onValueChange={(value) => session.setTalkSelectMode(value)}
          trackColor="#E23B4A"
        />
        <SettingsHint
          full="Reply becomes a red Talk button. Cards only choose the destination. Tap the volume ring to set level in dB and mute. Double-tap a ring to mute. Tap a conference icon to set who you hear."
          compact="Reply becomes Talk. Cards pick the destination. Tap dB to set level."
        />
        <SettingsSwitchRow
          label="Lock multiple targets"
          value={store.lockMultipleTargets}
          onValueChange={(value) => session.setLockMultipleTargets(value)}
        />
        <SettingsHint
          full="Slide-to-lock adds targets to the locked set instead of replacing it. Tap a locked card to drop just that target — same as the web client."
          compact="Slide-to-lock adds targets. Tap a locked card to drop it."
        />
        <SettingsSwitchRow
          label="Horizontal volume fader"
          value={audio.volumeFader}
          onValueChange={(value) => session.setOperatorAudio({ volumeFader: value })}
        />
        <SettingsHint
          full="Replaces the plus/minus buttons in the volume overlay and conference member list with a slider."
          compact="Uses a slider instead of plus/minus."
        />
        <SettingsSwitchRow
          label="Thumb-edge talk control"
          value={store.edgeTalkAffordance}
          onValueChange={(value) => session.setEdgeTalkAffordance(value)}
        />
        <SettingsHint
          full="Moves the walkie-talkie to the phone’s edge so you can hit it with a thumb. Talkable cards always show the icon; this only widens the hit target. In Talk & select it becomes a checkmark. The extra edge target is hidden in phone landscape, where cards use two columns."
          compact="Widens the walkie toward the phone edge. Hidden in phone landscape."
        />
      </SettingsSection>
    </>
  );
}

function AudioSettingsPage() {
  const store = useSessionStore();
  const audio = store.operatorAudio;
  const styles = useSettingsStyles();
  const { scheme } = useSettingsTheme();

  return (
    <>
      <SettingsSection title="Incoming audio">
        <SettingsSwitchRow
          label="Dim feeds when addressed"
          value={audio.feedDimIncoming}
          onValueChange={(value) => session.setOperatorAudio({ feedDimIncoming: value })}
        />
        <SettingsSwitchRow
          label="Dim feeds while speaking"
          value={audio.feedDimSelf}
          onValueChange={(value) => session.setOperatorAudio({ feedDimSelf: value })}
        />
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Dim amount</Text>
          <Text style={styles.rowValue}>{audio.feedDimDb} dB</Text>
        </View>
        <View style={styles.sliderRow}>
          <Text style={styles.sliderHint}>{FEED_DIM_DB_OPTIONS[0]}</Text>
          <VolumeSlider
            light={scheme === 'light'}
            flex
            accessibilityLabel="Dim amount"
            value={sliderPositionFromDimDb(audio.feedDimDb)}
            quantize={(position) => sliderPositionFromDimDb(dimDbFromSliderPosition(position))}
            onChange={(position) => session.setOperatorAudio({ feedDimDb: dimDbFromSliderPosition(position) })}
          />
          <Text style={styles.sliderHint}>{FEED_DIM_DB_OPTIONS[FEED_DIM_DB_OPTIONS.length - 1]}</Text>
        </View>
        <SettingsHint
          full="Same defaults as the web client: dim when someone calls you, not while you talk, by 15 dB."
          compact="Dim when called, not while you talk. Default 15 dB."
        />
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
        <SettingsHint
          full="In-call style combos: phone earpiece, speaker, or a connected headset. Audio stays in communication mode so echo cancellation can run."
          compact="Earpiece, speaker, or headset. Stays in communication mode."
        />
      </SettingsSection>

      <SettingsSection title="Voice processing">
        <SettingsSwitchRow
          label="Echo cancellation"
          value={audio.echoCancellation}
          onValueChange={(value) => session.setOperatorAudio({ echoCancellation: value })}
        />
        <SettingsFootnote>
          {processingLine('Echo cancellation', audio.echoCancellation, store.captureEchoCancellation, store.audioVoiceProcessing)}
        </SettingsFootnote>
        <SettingsSwitchRow
          label="Noise suppression"
          value={audio.noiseSuppression}
          onValueChange={(value) => session.setOperatorAudio({ noiseSuppression: value })}
        />
        <SettingsFootnote>
          {processingLine('Noise suppression', audio.noiseSuppression, store.captureNoiseSuppression, store.audioVoiceProcessing)}
        </SettingsFootnote>
        <SettingsSwitchRow
          label="Auto gain"
          value={audio.autoGainControl}
          onValueChange={(value) => session.setOperatorAudio({ autoGainControl: value })}
        />
        <SettingsFootnote>
          {processingLine('Auto gain', audio.autoGainControl, store.captureAutoGainControl, store.audioVoiceProcessing)}
          {store.audioVoiceProcessing ? ' Voice-processing session is on.' : ' Voice-processing session is off.'}
        </SettingsFootnote>
      </SettingsSection>
    </>
  );
}

function WatchSettingsSection() {
  return (
    <SettingsSection title="Apple Watch">
      <SettingsRow label="Remote" value={watchRemoteShortStatus(watchRemoteStatus())} />
      <SettingsHint
        full={`${describeWatchRemoteStatus(watchRemoteStatus())} The watch lists Reply, then the same online talk targets as the phone. Hold a row to talk; release to stop. Audio stays on the iPhone.`}
        compact={`${describeWatchRemoteStatus(watchRemoteStatus())} Hold a row to talk. Audio stays on the iPhone.`}
      />
    </SettingsSection>
  );
}

function DebugSettingsPage({ onClose }: { onClose: () => void }) {
  const store = useSessionStore();

  return (
    <>
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
        <SettingsRow label="Talk lock" value="Slide to lock" />
        <SettingsRow label="Server version" value={store.serverAppVersion || 'Unknown'} />
        <SettingsRow
          label="Incoming audio"
          value={`${store.activeRemoteCount} live / ${store.overBudget ? 'over budget' : 'ok'}`}
        />
        <SettingsRow label="Used mic" value={store.audioInputLabel || store.captureMicLabel} />
        <SettingsRow label="Used speaker" value={store.audioOutputLabel} />
        {store.capabilityReason ? <SettingsFootnote>{store.capabilityReason}</SettingsFootnote> : null}
        {store.mediaDebug ? <SettingsFootnote>{store.mediaDebug}</SettingsFootnote> : null}
        <SettingsHint
          full="Camera tally uses a red PGM frame or a green preview frame, same as the web client. Incoming audio follows the selected production."
          compact="PGM is a red frame, preview is green. Audio follows the production."
        />
      </SettingsSection>

      <SettingsSection title="PushToTalk">
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
            <SettingsHint
              full="Lock Screen, Dynamic Island, and the home widget have Reply lock (toggle locked reply) and Disconnect. On iOS 18, add those same controls to Control Center or the Action Button."
              compact="Lock Screen and widget have Reply lock and Disconnect."
            />
          </>
        ) : (
          <SettingsHint
            full="Android hardware PTT uses BLE, Classic serial, USB-C, and onboard keys. Pair accessories under Accessories."
            compact="Hardware PTT: BLE, serial, USB-C, and phone keys."
          />
        )}
        {store.pttDiagnostic ? <SettingsFootnote>{store.pttDiagnostic}</SettingsFootnote> : null}
      </SettingsSection>

      {Platform.OS === 'android' ? (
        <SettingsSection title="Battery">
          <SettingsActionRow label="Battery settings" onPress={() => void session.openBatteryEducation()} />
          <SettingsHint
            full="Set TalkToMe to Unrestricted (Samsung: Device care) if the session dies after Home or screen-off. This does not promise every OEM."
            compact="Set TalkToMe to Unrestricted if the session dies after Home."
          />
        </SettingsSection>
      ) : null}

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
