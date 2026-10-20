import { Modal, Platform, Pressable, ScrollView, Text, View, useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';

import { audioSessionStatusLabel, iosPttEnabled } from '../audio/policy';
import { describeAudioRouteKind } from '../audio/routes';
import { pttStatusLabel, shouldShowPttJoinBanner } from '../ptt/policy';
import { loadTalkLinkToken } from '../talk/talkLink';
import { describePttDevicesSummary } from '../ble/bindings';
import { fgsStatusLabel } from '../background/fgs';
import { FEED_DIM_DB_OPTIONS, dimDbFromSliderPosition, sliderPositionFromDimDb } from '../session/operatorAudio';
import { mainButtonCandidates, mainButtonStorageKey, resolveMainButton } from '../session/mainButton';
import { moveTargetOrder } from '../session/targetOrder';
import { session, useSessionStore } from '../session/store';
import { talkTargetIdentity, type TalkTarget } from '../protocol';
import { describeWatchRemoteStatus, watchRemoteShortStatus, watchRemoteStatus } from '../watch/native';
import { androidSafeArea } from './androidSafeArea';
import { PageStack, type PageStackHandle } from './PageStack';
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
  | { kind: 'main-button' }
  | { kind: 'arrange' }
  | { kind: 'audio' }
  | { kind: 'ptt' }
  | { kind: 'ptt-add' }
  | { kind: 'ptt-device'; id: string }
  | { kind: 'debug' };

export function SettingsScreen({ visible, onClose }: Props) {
  const store = useSessionStore();
  const scheme = useColorScheme();
  const [page, setPage] = useState<SettingsPage>({ kind: 'root' });
  const [sliderDragging, setSliderDragging] = useState(false);
  const stack = useRef<PageStackHandle>(null);
  // Every way back (header, edge swipe, after pairing or deleting an accessory) slides like iOS.
  const back = useCallback(() => stack.current?.pop(), []);

  useEffect(() => {
    if (visible) {
      session.refreshAudioDevices();
      return;
    }
    setPage({ kind: 'root' });
    setSliderDragging(false);
    void session.cancelButtonPairing();
  }, [visible]);

  const header = headerForPage(
    page,
    store.bleBindings.find((item) => page.kind === 'ptt-device' && item.id === page.id)?.name,
  );
  const parent = parentPage(page);

  const goBack = () => setPage(parent ?? { kind: 'root' });

  const pageActions = {
    showPttList: back,
    onClose,
    onOpenLayout: () => setPage({ kind: 'layout' }),
    onOpenMainButton: () => setPage({ kind: 'main-button' }),
    onOpenArrange: () => setPage({ kind: 'arrange' }),
    onOpenAudio: () => setPage({ kind: 'audio' }),
    onOpenAccessories: () => setPage({ kind: 'ptt' }),
    onOpenDebug: () => setPage({ kind: 'debug' }),
    onAddDevice: () => setPage({ kind: 'ptt-add' }),
    onOpenDevice: (id: string) => setPage({ kind: 'ptt-device', id }),
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SettingsThemeProvider scheme={scheme}>
        <PageStack
          ref={stack}
          animated={Platform.OS === 'ios'}
          swipeEnabled={Platform.OS === 'ios' && parent !== null && !sliderDragging}
          onBack={goBack}
          pageKey={page.kind === 'ptt-device' ? `${page.kind}:${page.id}` : page.kind}
          depth={pageDepth(page)}
          underlay={
            parent ? (
              <SettingsSheet
                {...pageActions}
                header={headerForPage(parent)}
                page={parent}
                onBack={parent.kind === 'root' ? undefined : back}
                scrollEnabled={false}
                onDimSliding={setSliderDragging}
              />
            ) : null
          }
        >
          <SettingsSheet
            {...pageActions}
            header={header}
            page={page}
            onBack={parent ? back : undefined}
            scrollEnabled={!sliderDragging}
            onDimSliding={setSliderDragging}
          />
        </PageStack>
      </SettingsThemeProvider>
    </Modal>
  );
}

function pageDepth(page: SettingsPage): number {
  const parent = parentPage(page);
  return parent ? pageDepth(parent) + 1 : 0;
}

/** The page "‹ Back" and the edge swipe return to; null on the root page. */
function parentPage(page: SettingsPage): SettingsPage | null {
  switch (page.kind) {
    case 'root':
      return null;
    case 'main-button':
    case 'arrange':
      return { kind: 'layout' };
    case 'ptt-add':
    case 'ptt-device':
      return { kind: 'ptt' };
    default:
      return { kind: 'root' };
  }
}

function SettingsSheet({
  header,
  page,
  onBack,
  onClose,
  scrollEnabled,
  onDimSliding,
  onOpenLayout,
  onOpenMainButton,
  onOpenArrange,
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
  scrollEnabled: boolean;
  onDimSliding: (active: boolean) => void;
  onOpenLayout: () => void;
  onOpenMainButton: () => void;
  onOpenArrange: () => void;
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

      <ScrollView scrollEnabled={scrollEnabled} style={styles.scroll} contentContainerStyle={styles.body}>
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

        {page.kind === 'layout' ? (
          <LayoutSettingsPage onOpenMainButton={onOpenMainButton} onOpenArrange={onOpenArrange} />
        ) : null}
        {page.kind === 'main-button' ? <MainButtonSettingsPage /> : null}
        {page.kind === 'arrange' ? <ArrangeTargetsPage /> : null}
        {page.kind === 'audio' ? <AudioSettingsPage onDimSliding={onDimSliding} /> : null}

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
    case 'main-button':
      return { title: 'Main button target', backLabel: 'Layout' };
    case 'arrange':
      return { title: 'Arrange targets', backLabel: 'Layout' };
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

function LayoutSettingsPage({
  onOpenMainButton,
  onOpenArrange,
}: {
  onOpenMainButton: () => void;
  onOpenArrange: () => void;
}) {
  const store = useSessionStore();
  const audio = store.operatorAudio;
  const main = resolveMainButton({
    storedIdentity: store.mainButtonTargets[mainButtonStorageKey(store.activeProfileId, store.productionId)],
    targets: store.targets,
    replyTarget: store.replyTarget,
    canTalk: (target) => session.canTalkTo(target),
  });
  const canArrange = store.identity?.kind === 'user';

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
        <SettingsNavRow label="Main button target" value={main.label} onPress={onOpenMainButton} />
        <SettingsHint
          full="Chooses what the bottom button does. Reply follows the last caller. A named target always talks to that target. Cards still talk on their own, same as the web client."
          compact="Sets the bottom button. Cards still talk on their own."
        />
        <SettingsSwitchRow
          label="Big main button"
          value={store.bigMainButton}
          onValueChange={(value) => session.setBigMainButton(value)}
        />
        <SettingsHint
          full="Makes the bottom button taller so it is harder to miss. Off until you turn it on."
          compact="Taller bottom button. Off until you turn it on."
        />
        {canArrange ? (
          <SettingsNavRow label="Arrange targets" onPress={onOpenArrange} />
        ) : null}
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
          full="Moves the walkie-talkie to the phone’s edge so you can hit it with a thumb. Talkable cards always show the icon; this only widens the hit target. Listen-only rows keep the empty slot so the other icons stay put. The extra edge target is hidden in phone landscape, where cards use two columns."
          compact="Widens the walkie toward the phone edge. Hidden in phone landscape."
        />
      </SettingsSection>
    </>
  );
}

function MainButtonSettingsPage() {
  const store = useSessionStore();
  const key = mainButtonStorageKey(store.activeProfileId, store.productionId);
  const stored = store.mainButtonTargets[key] ?? '';
  const selfId = store.identity?.kind === 'user' ? store.identity.id : null;
  const candidates = mainButtonCandidates(store.targets, selfId);
  const known = candidates.some((target) => talkTargetIdentity(target) === stored);

  return (
    <SettingsSection>
      <SettingsRow label="Reply" selected={!stored} onPress={() => session.setMainButtonTarget('')} />
      {candidates.map((target) => {
        const identity = talkTargetIdentity(target);
        const kind = target.type === 'conference' ? 'Conference' : 'User';
        return (
          <SettingsRow
            key={identity}
            label={target.label}
            value={kind}
            selected={stored === identity}
            onPress={() => session.setMainButtonTarget(identity)}
          />
        );
      })}
      {stored && !known ? <SettingsRow label="Unavailable target" value="Saved" selected /> : null}
      <SettingsHint
        full="Reply is the web client default. Pick a target to pin the bottom button. The choice is saved for this profile and production."
        compact="Reply, or pin one target. Saved for this production."
      />
    </SettingsSection>
  );
}

function arrangeKind(target: TalkTarget): string {
  if (target.type === 'conference') {
    return target.canTalk ? 'Conference' : 'Listen only';
  }
  if (target.type === 'feed') {
    return 'Feed';
  }
  return 'User';
}

function OrderArrow({
  direction,
  label,
  disabled,
  onPress,
}: {
  direction: 'up' | 'down';
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const styles = useSettingsStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.orderButton}
    >
      <Text style={[styles.orderArrow, disabled && styles.orderArrowDisabled]}>
        {direction === 'up' ? '↑' : '↓'}
      </Text>
    </Pressable>
  );
}

function ArrangeTargetsPage() {
  const targets = useSessionStore((state) => state.targets);
  const styles = useSettingsStyles();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const move = async (index: number, delta: number) => {
    if (busy) {
      return;
    }
    const next = moveTargetOrder(targets, index, index + delta);
    if (!next) {
      return;
    }
    setBusy(true);
    setMessage('Saving…');
    try {
      await session.saveTargetOrder(next);
      setMessage('Saved');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save target order');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {targets.length === 0 ? (
        <SettingsSection>
          <SettingsFootnote>No targets available.</SettingsFootnote>
        </SettingsSection>
      ) : (
        <SettingsSection style={styles.orderList}>
          {targets.map((target, index) => (
            <View
              key={talkTargetIdentity(target)}
              style={[styles.orderRow, index > 0 && styles.orderRowDivider]}
            >
              <View style={styles.orderText}>
                <Text style={styles.orderName} numberOfLines={1}>
                  {target.label}
                </Text>
                <Text style={styles.orderKind}>{arrangeKind(target)}</Text>
              </View>
              <View style={styles.orderButtons}>
                <OrderArrow
                  direction="up"
                  label={`Move ${target.label} up`}
                  disabled={busy || index === 0}
                  onPress={() => void move(index, -1)}
                />
                <OrderArrow
                  direction="down"
                  label={`Move ${target.label} down`}
                  disabled={busy || index === targets.length - 1}
                  onPress={() => void move(index, 1)}
                />
              </View>
            </View>
          ))}
        </SettingsSection>
      )}
      {message ? <SettingsFootnote>{message}</SettingsFootnote> : null}
      <SettingsHint
        full="Saves this order on the server, the same list the web client stores. Up and down avoid dragging inside a scrolling page."
        compact="Saves the same target order as the web client."
      />
    </>
  );
}

function AudioSettingsPage({ onDimSliding }: { onDimSliding: (active: boolean) => void }) {
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
            stepCount={FEED_DIM_DB_OPTIONS.length}
            quantize={(position) => sliderPositionFromDimDb(dimDbFromSliderPosition(position))}
            onSliding={onDimSliding}
            onChange={(position) => session.setOperatorAudio({ feedDimDb: dimDbFromSliderPosition(position) })}
          />
          <Text style={styles.sliderHint}>{FEED_DIM_DB_OPTIONS[FEED_DIM_DB_OPTIONS.length - 1]}</Text>
        </View>
        <SettingsHint
          full="Same defaults as the web client: dim when someone calls you, not while you talk, by 15 dB."
          compact="Dim when called, not while you talk. Default 15 dB."
        />
      </SettingsSection>

      <SettingsSection title="Connection">
        <SettingsSwitchRow
          label="Play connection sounds"
          value={audio.playConnectionSounds}
          onValueChange={(value) => session.setOperatorAudio({ playConnectionSounds: value })}
        />
        <SettingsHint
          full="Plays the disconnected and reconnected tones. The server’s Play connection sounds default applies until you change this. Pause and sign-out stay silent either way."
          compact="Disconnected and reconnected tones. Uses the server default until you change it."
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
  const [talkLinkToken, setTalkLinkToken] = useState('');

  useEffect(() => {
    let cancelled = false;
    void loadTalkLinkToken()
      .then((token) => {
        if (!cancelled) {
          setTalkLinkToken(token);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTalkLinkToken('');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
            {store.pttJoined ? (
              <SettingsActionRow label="Leave PushToTalk channel" onPress={() => void session.leaveSystemPtt()} />
            ) : null}
            <SettingsHint
              full="Lock Screen, Dynamic Island, and the home widget have Reply lock and Disconnect without system Push to Talk. Join the system channel only when this server has an Apple push key. On iOS 18, the same controls can be added to Control Center or the Action Button."
              compact="Lock Screen and the widget do not need system Push to Talk."
            />
            {talkLinkToken ? (
              <SettingsFootnote>
                {`talktome://talk is ignored unless the link includes ?token=${talkLinkToken}`}
              </SettingsFootnote>
            ) : null}
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
