import { AppState, Platform, type AppStateStatus } from 'react-native';

import {
  activateForIntercom,
  audioSessionAvailable,
  deactivateAudioSession,
  prepareForSystemManagedIntercom,
  reactivateForOutgoingTalkCapture,
  setWebRTCAudioEnabled,
  startBackgroundKeepalive,
  stopBackgroundKeepalive,
} from '../audio/session';
import {
  iosPttEnabled,
  shouldHandOffPlaybackToSystemPtt,
  shouldOwnAudioSession,
  shouldReactivateCaptureForTalk,
  shouldStartBackgroundKeepalive,
  shouldTeardownAudioWhenNotOwningSession,
} from '../audio/policy';
import { subscribeAudioRoutes } from '../audio/routes';
import { advertisedCapability } from '../background/capability';
import { foregroundServiceMode, shouldRetryForegroundService } from '../background/fgs';
import {
  foregroundServiceAvailable,
  foregroundServiceSnapshot,
  openBatterySettings,
  startForegroundService,
  stopForegroundService,
  subscribeForegroundService,
  updateForegroundService,
} from '../background/foregroundService';
import { requestAndroidBlePermissions, requestAndroidSessionPermissions } from '../background/permissions';
import { BleButtonPolicy } from '../ble/button';
import {
  aggregateBleKind,
  anyBleDeviceActive,
  bindingTarget,
  connectedBleDeviceNames,
  describeBleReleaseTimeout,
  mergeLiveBleDevices,
  nextBleReleaseTimeoutMs,
  removeBleDeviceBinding,
  upsertBleDeviceBinding,
} from '../ble/bindings';
import {
  BLE_BUTTON_PAIRING_MS,
  coerceNotifyBytes,
  decodeAccessoryNotify,
  FALLBACK_ACCESSORY_PROFILE,
  looksLikePttCommand,
  matchAccessoryProfile,
} from '../ble/catalog';
import {
  acceptPairedBleDevice,
  cancelButtonPairingBle,
  connectBleDevice,
  disconnectBle,
  startBleNative,
  startButtonPairingBle,
  subscribeBleNative,
  type BleConnectionState,
  type BleDeviceState,
} from '../ble/native';
import { saveBlePreferences } from '../ble/preferences';
import { BleReleaseWatchdog } from '../ble/watchdog';
import {
  bleTalkCandidates,
  describeBleTarget,
  resolveBleTalkTarget,
  type BleTargetSelection,
} from '../ble/target';
import { talkTargetIdentity, type TalkTarget } from '../protocol';
import { canJoinCachedSystemPtt, isHexPushToken, parseApplePttBootstrap, shouldUseSystemPtt } from '../ptt/policy';
import {
  beginPttJoin,
  lastPttDiagnostic,
  leavePttChannel,
  pttNativeAvailable,
  subscribePttNative,
  updatePttChannel,
} from '../ptt/native';
import { cachedPttChannel, type SavedProfile } from './remembered';
import { sessionPresence, presenceNotification } from './presence';
import { publishSessionPresence, subscribeAppTerminating, subscribeDisconnectShortcut, subscribeTalkShortcut } from './presenceNative';
import { shouldDisconnectForAppStateChange } from './presenceShutdown';
import { buildWatchRemoteSnapshot } from '../watch/snapshot';
import { publishWatchRemote, subscribeWatchRemote, ackWatchTalk, type WatchRemoteCommand } from '../watch/native';
import { bleFieldsFromSelection, bleSelectionFromState, useSessionStore } from './state';
import type { SessionController } from './sessionController';

/** Background surfaces: FGS, audio-session ownership, BLE button, Watch, presence, and system PTT. */
export class BackgroundCoordinator {
  private hardwareBound = false;
  private appStateSubscription: { remove: () => void } | null = null;
  private pendingPttRegistration: { token: string; channelUUID: string } | null = null;
  private readonly blePolicies = new Map<string, BleButtonPolicy>();
  private readonly bleWatchdogs = new Map<string, BleReleaseWatchdog>();

  constructor(private readonly c: SessionController) {}

  /** Apple requires requestJoinChannel from a user action while the app is foreground. */
  async joinSystemPttChannel(): Promise<void> {
    if (
      !shouldUseSystemPtt({
        platform: Platform.OS,
        pttEnabled: iosPttEnabled(),
        operatorReady: useSessionStore.getState().operatorReady,
        identityKind: useSessionStore.getState().identity?.kind,
      })
    ) {
      return;
    }
    const channelUUID = this.c.pttChannelUUID;
    const channelName = useSessionStore.getState().pttChannelName || 'Talktome';
    if (!channelUUID) {
      useSessionStore.setState({
        pttDiagnostic: 'System PTT join has no channel UUID from the server.',
        statusMessage: 'System PTT join has no channel UUID from the server.',
      });
      return;
    }
    await this.beginSystemPttJoin(channelUUID, channelName);
  }

  joinCachedSystemPttFromUserGesture(profile: SavedProfile): void {
    const cached = cachedPttChannel(profile);
    if (
      !cached ||
      !canJoinCachedSystemPtt({
        platform: Platform.OS,
        pttEnabled: iosPttEnabled(),
        channelUUID: cached.channelUUID,
        guest: Boolean(profile.guest),
      })
    ) {
      return;
    }
    this.c.pttChannelUUID = cached.channelUUID;
    useSessionStore.setState({
      pttChannelName: cached.channelName,
      pttDiagnostic: 'Joining system PTT channel…',
      statusMessage: 'Joining system PTT channel…',
    });
    this.c.pttJoin.begin();
    const joining = beginPttJoin(cached.channelUUID, cached.channelName);
    void joining.then((ok) => {
      if (!ok) {
        this.c.pttJoin.settle();
      }
    });
    void this.finishSystemPttJoin(joining);
  }

  private async beginSystemPttJoin(channelUUID: string, channelName: string): Promise<void> {
    this.c.pttChannelUUID = channelUUID;
    useSessionStore.setState({
      pttChannelName: channelName,
      pttDiagnostic: 'Joining system PTT channel…',
      statusMessage: 'Joining system PTT channel…',
    });
    if (!this.c.media) {
      this.c.pttJoin.begin();
    }
    const joining = beginPttJoin(channelUUID, channelName);
    void joining.then((ok) => {
      if (!ok) {
        this.c.pttJoin.settle();
      }
    });
    await this.finishSystemPttJoin(joining);
  }

  private async finishSystemPttJoin(joined: Promise<boolean>): Promise<void> {
    await joined;
    await new Promise((resolve) => setTimeout(resolve, 400));
    const nativeNote = lastPttDiagnostic().trim();
    if (!useSessionStore.getState().pttJoined && nativeNote) {
      useSessionStore.setState({
        pttDiagnostic: nativeNote,
        statusMessage: nativeNote,
      });
    }
  }

  bluetoothButtonCandidates(): TalkTarget[] {
    return bleTalkCandidates(useSessionStore.getState().targets);
  }

  bluetoothButtonSelection(deviceId?: string): BleTargetSelection {
    const state = useSessionStore.getState();
    const id = deviceId || state.bleFocusedDeviceId;
    return bindingTarget(state.bleBindings, id, bleSelectionFromState(state));
  }

  setBluetoothButtonTarget(selection: BleTargetSelection, deviceId?: string): void {
    const state = useSessionStore.getState();
    const id = deviceId || state.bleFocusedDeviceId;
    if (!id) {
      useSessionStore.setState({
        ...bleFieldsFromSelection(selection, state.bleShortPressLocks),
        statusMessage: `New accessories will talk to ${describeBleTarget(selection)}.`,
      });
      this.persistBlePreferences();
      return;
    }
    const bindings = upsertBleDeviceBinding(state.bleBindings, { id, target: selection });
    useSessionStore.setState({
      bleBindings: bindings,
      bleFocusedDeviceId: id,
      ...bleFieldsFromSelection(selection, state.bleShortPressLocks),
      statusMessage: `${this.accessoryLabel(id)} target set to ${describeBleTarget(selection)}.`,
    });
    this.persistBlePreferences();
  }

  setBluetoothButtonShortPressLocks(enabled: boolean): void {
    useSessionStore.setState({
      bleShortPressLocks: enabled,
      statusMessage: enabled
        ? 'Bluetooth accessory short press now locks talk.'
        : 'Bluetooth accessory short press lock disabled.',
    });
    this.persistBlePreferences();
  }

  cycleBluetoothReleaseTimeout(): void {
    const next = nextBleReleaseTimeoutMs(useSessionStore.getState().bleReleaseTimeoutMs);
    for (const watchdog of this.bleWatchdogs.values()) {
      watchdog.timeoutMs = next;
    }
    useSessionStore.setState({
      bleReleaseTimeoutMs: next,
      statusMessage:
        next <= 0
          ? 'Bluetooth accessory release timeout off.'
          : `Bluetooth accessory release timeout ${describeBleReleaseTimeout(next)}.`,
    });
    this.persistBlePreferences();
  }

  focusBluetoothAccessory(deviceId: string): void {
    const state = useSessionStore.getState();
    const target = bindingTarget(state.bleBindings, deviceId, bleSelectionFromState(state));
    useSessionStore.setState({
      bleFocusedDeviceId: deviceId,
      ...bleFieldsFromSelection(target, state.bleShortPressLocks),
    });
  }

  async connectBluetoothButton(): Promise<void> {
    await this.beginButtonPairing();
  }

  async beginButtonPairing(): Promise<void> {
    await requestAndroidBlePermissions();
    await startBleNative();
    const boundIds = useSessionStore.getState().bleBindings.map((item) => item.id);
    useSessionStore.setState({
      blePairingActive: true,
      blePairingFoundId: null,
      blePairingMessage: 'Hold the PTT button on the accessory.',
      bleScanning: true,
      statusMessage: 'Listening for a PTT button…',
    });
    const state = await startButtonPairingBle({
      timeoutMs: BLE_BUTTON_PAIRING_MS,
      boundIds,
    });
    this.publishBleState(state);
    if (!useSessionStore.getState().blePairingActive) {
      return;
    }
    if (state.kind === 'unavailable' || state.kind === 'failed') {
      useSessionStore.setState({
        blePairingActive: false,
        blePairingMessage: state.message || 'Could not scan for a PTT button.',
      });
    }
  }

  async cancelButtonPairing(): Promise<void> {
    if (!useSessionStore.getState().blePairingActive) {
      return;
    }
    const state = await cancelButtonPairingBle();
    useSessionStore.setState({
      blePairingActive: false,
      blePairingFoundId: null,
      blePairingMessage: '',
    });
    this.publishBleState(state);
  }

  async completeButtonPairing(deviceId: string): Promise<void> {
    const live = useSessionStore.getState().bleDevices.find((device) => device.id === deviceId);
    const name = live?.name?.trim() || 'PTT accessory';
    const state = await acceptPairedBleDevice(deviceId);
    const bindings = upsertBleDeviceBinding(useSessionStore.getState().bleBindings, {
      id: deviceId,
      name,
    });
    useSessionStore.setState({
      bleBindings: bindings,
      bleFocusedDeviceId: deviceId,
      blePairingActive: false,
      blePairingFoundId: deviceId,
      blePairingMessage: `Found ${name}.`,
      statusMessage: `Added ${name}.`,
    });
    this.persistBlePreferences();
    this.publishBleState(state);
  }

  async connectKnownBluetoothAccessory(deviceId: string): Promise<void> {
    await requestAndroidBlePermissions();
    this.focusBluetoothAccessory(deviceId);
    const state = await connectBleDevice(deviceId);
    this.publishBleState(state);
  }

  async disconnectBluetoothButton(deviceId?: string): Promise<void> {
    if (deviceId) {
      this.forceBleRelease(deviceId);
    } else {
      this.resetBleAccessorySession();
    }
    const state = await disconnectBle(deviceId);
    this.publishBleState(state);
    await this.syncForegroundService();
  }

  removeBluetoothAccessory(deviceId: string): void {
    this.forceBleRelease(deviceId);
    void disconnectBle(deviceId).then((state) => this.publishBleState(state));
    const state = useSessionStore.getState();
    const bindings = removeBleDeviceBinding(state.bleBindings, deviceId);
    this.blePolicies.delete(deviceId);
    this.bleWatchdogs.get(deviceId)?.clear();
    this.bleWatchdogs.delete(deviceId);
    useSessionStore.setState({
      bleBindings: bindings,
      bleFocusedDeviceId: state.bleFocusedDeviceId === deviceId ? (bindings[0]?.id ?? '') : state.bleFocusedDeviceId,
      statusMessage: `Removed ${this.accessoryLabel(deviceId)}.`,
    });
    this.persistBlePreferences();
  }

  resetBleAccessorySession(): void {
    for (const watchdog of this.bleWatchdogs.values()) {
      watchdog.clear();
    }
    this.bleWatchdogs.clear();
    this.blePolicies.clear();
  }

  async openBatteryEducation(): Promise<void> {
    const opened = await openBatterySettings();
    useSessionStore.setState({
      statusMessage: opened
        ? 'Opened battery settings. Set TalkToMe to Unrestricted if the OEM offers it.'
        : 'Could not open battery settings from this build.',
    });
  }

  bindHardware(): void {
    if (this.hardwareBound) {
      return;
    }
    this.hardwareBound = true;
    subscribeForegroundService({
      onStopRequested: () => {
        void this.c.disconnect();
      },
      onTalkRequested: () => {
        void this.c.talk.toggleCurrentTalk();
      },
      onStarted: () => {
        useSessionStore.setState({
          fgsRunning: true,
          fgsAvailable: true,
          capabilityReason: this.capabilityReason({ fgsRunning: true }),
        });
      },
      onStopped: () => {
        useSessionStore.setState({
          fgsRunning: false,
          capabilityReason: this.capabilityReason({ fgsRunning: false }),
        });
      },
    });
    subscribeTalkShortcut(() => {
      void this.c.talk.toggleCurrentTalk();
    });
    subscribeDisconnectShortcut(() => {
      void this.c.disconnect();
    });
    subscribeAppTerminating(() => {
      if (useSessionStore.getState().operatorReady) {
        void this.c.disconnect();
      }
    });
    subscribeBleNative({
      onState: (state) => {
        this.publishBleState(state);
        void this.syncForegroundService();
      },
      onNotify: (event) => {
        this.handleBleNotify(event.deviceId, event.data);
      },
      onButton: (event) => {
        const deviceId = event.deviceId || useSessionStore.getState().bleFocusedDeviceId;
        if (!event.pressed) {
          this.forceBleRelease(deviceId);
          return;
        }
        if (!deviceId) {
          return;
        }
        this.watchdogFor(deviceId).notePressed();
        void this.handleBleButton(deviceId, true);
      },
      onDiagnostic: (message) => {
        const state = useSessionStore.getState();
        if (state.bleScanning || anyBleDeviceActive(state.bleDevices, state.bleScanning)) {
          useSessionStore.setState({ bleMessage: message });
        }
      },
    });
    this.c.mediaCoordinator.publishAudioDevices();
    subscribeAudioRoutes((snapshot) => {
      this.c.mediaCoordinator.publishAudioDevices(snapshot);
    });
    subscribeWatchRemote({
      onTalkStart: (command) => {
        void this.handleWatchTalk(command, true);
      },
      onTalkStop: (command) => {
        void this.handleWatchTalk(command, false);
      },
    });
    this.appStateSubscription?.remove();
    this.appStateSubscription = AppState.addEventListener('change', (next) => {
      if (shouldDisconnectForAppStateChange(next)) {
        void this.c.disconnect();
      }
      void this.syncAudioSession(next);
      if (shouldRetryForegroundService(Platform.OS, useSessionStore.getState().operatorReady, next)) {
        void this.syncForegroundService();
      }
    });
    subscribePttNative({
      onDiagnostic: (message) => {
        useSessionStore.setState({ statusMessage: message, pttDiagnostic: message });
      },
      onPushToken: (event) => {
        void this.registerPttToken(event.token, event.channelUUID);
      },
      onBeginTransmitting: () => {
        if (useSessionStore.getState().talkSelectMode) {
          void this.c.talk.pressSelectedTalk();
          return;
        }
        void this.c.talk.pressReply();
      },
      onEndTransmitting: () => {
        void this.c.talk.releaseTalk();
      },
      onAudioActivated: () => {
        void this.handlePttAudioActivated();
      },
      onServiceUpdate: () => {
        void this.c.mediaCoordinator.refreshProducersFromPtt();
      },
      onJoined: () => {
        this.c.pttJoin.settle();
        useSessionStore.setState({
          pttJoined: true,
          capabilityReason: this.capabilityReason({ pttJoined: true }),
        });
        void this.syncAudioSession();
      },
      onLeft: () => {
        this.c.pttJoin.settle();
        useSessionStore.setState({
          pttJoined: false,
          capabilityReason: this.capabilityReason({ pttJoined: false }),
        });
        void this.syncAudioSession();
      },
      onJoinFailed: (message) => {
        this.c.pttJoin.settle();
        if (message.trim()) {
          useSessionStore.setState({
            pttDiagnostic: message,
            statusMessage: message,
          });
        }
      },
      onIncomingPush: () => {
        useSessionStore.setState({
          pttVerified: true,
          capabilityReason: this.capabilityReason({ pttVerified: true }),
        });
      },
    });
    useSessionStore.setState({
      fgsAvailable: foregroundServiceAvailable(),
      audioSessionAvailable: audioSessionAvailable(),
      pttAvailable: pttNativeAvailable(),
    });
  }

  publishBleState(state: BleConnectionState): void {
    const previous = useSessionStore.getState();
    const devices = this.normalizeDevices(state);
    const scanning = Boolean(state.scanning) || state.kind === 'scanning';
    const kind = scanning ? 'scanning' : aggregateBleKind(devices, false);
    const keepDiagnostic =
      !state.message &&
      (scanning ||
        previous.blePairingActive ||
        devices.some((device) => device.kind === 'connected' || device.kind === 'connecting'));
    const defaultTarget = bleSelectionFromState(previous);
    const bindings = mergeLiveBleDevices(previous.bleBindings, devices, defaultTarget);
    const focused =
      (previous.bleFocusedDeviceId && bindings.some((item) => item.id === previous.bleFocusedDeviceId)
        ? previous.bleFocusedDeviceId
        : bindings[0]?.id) ?? '';
    const focusedTarget = bindingTarget(bindings, focused, defaultTarget);
    this.releaseDroppedDevices(previous.bleDevices, devices);
    const pairingReported = typeof state.pairing === 'boolean' ? state.pairing : undefined;
    let pairingActive = previous.blePairingActive;
    if (pairingReported === false) {
      pairingActive = false;
    } else if (
      previous.blePairingActive &&
      pairingReported == null &&
      (state.kind === 'failed' || state.kind === 'unavailable') &&
      !scanning
    ) {
      pairingActive = false;
    }
    let pairingMessage = previous.blePairingMessage;
    const pairingFoundId = previous.blePairingFoundId;
    if (previous.blePairingActive && !pairingActive && !pairingFoundId) {
      pairingMessage =
        state.message || pairingMessage || 'No PTT button was heard. Hold the button and try again.';
    }

    useSessionStore.setState({
      bleKind: kind,
      bleName: connectedBleDeviceNames(devices) || state.name || '',
      bleMessage: keepDiagnostic ? previous.bleMessage : (state.message ?? ''),
      bleScanning: scanning,
      blePairingActive: pairingActive,
      blePairingMessage: pairingMessage,
      bleDevices: devices,
      bleBindings: bindings,
      bleFocusedDeviceId: focused,
      ...bleFieldsFromSelection(focusedTarget, previous.bleShortPressLocks),
    });
    if (bindings !== previous.bleBindings && JSON.stringify(bindings) !== JSON.stringify(previous.bleBindings)) {
      this.persistBlePreferences();
    }
  }

  private normalizeDevices(state: BleConnectionState): BleDeviceState[] {
    if (Array.isArray(state.devices) && state.devices.length > 0) {
      return state.devices;
    }
    if (state.kind === 'idle' || state.kind === 'unavailable') {
      return [];
    }
    if (!state.name && (state.kind === 'failed' || state.kind === 'scanning')) {
      return [];
    }
    return [];
  }

  private releaseDroppedDevices(previous: BleDeviceState[], next: BleDeviceState[]): void {
    for (const device of previous) {
      if (device.kind !== 'connected' && device.kind !== 'connecting') {
        continue;
      }
      const current = next.find((item) => item.id === device.id);
      if (!current || (current.kind !== 'connected' && current.kind !== 'connecting')) {
        this.forceBleRelease(device.id);
      }
    }
  }

  private handleBleNotify(deviceId: string | undefined, data: unknown): void {
    const state = useSessionStore.getState();
    const id = deviceId || state.bleFocusedDeviceId || state.bleDevices[0]?.id;
    if (!id) {
      return;
    }
    const live = state.bleDevices.find((device) => device.id === id);
    const bytes = coerceNotifyBytes(data);
    const profile =
      matchAccessoryProfile({ profileId: live?.profileId, name: live?.name }) ?? FALLBACK_ACCESSORY_PROFILE;
    const pressed = decodeAccessoryNotify(bytes, profile);
    const bound = state.bleBindings.some((item) => item.id === id);
    if (state.blePairingActive && !bound && looksLikePttCommand(bytes, profile)) {
      const startTalk = pressed === true;
      void this.completeButtonPairing(id).then(() => {
        if (startTalk) {
          void this.handleBleButton(id, true);
        }
      });
      return;
    }
    if (!bound || pressed == null) {
      return;
    }
    if (pressed) {
      this.watchdogFor(id).notePressed();
    } else {
      this.watchdogFor(id).noteReleased();
    }
    void this.handleBleButton(id, pressed);
  }

  private forceBleRelease(deviceId?: string): void {
    if (!deviceId) {
      for (const id of this.blePolicies.keys()) {
        this.forceBleRelease(id);
      }
      return;
    }
    this.bleWatchdogs.get(deviceId)?.clear();
    if (!this.policyFor(deviceId).isHeld()) {
      return;
    }
    void this.handleBleButton(deviceId, false);
  }

  private policyFor(deviceId: string): BleButtonPolicy {
    const existing = this.blePolicies.get(deviceId);
    if (existing) {
      return existing;
    }
    const created = new BleButtonPolicy();
    this.blePolicies.set(deviceId, created);
    return created;
  }

  private watchdogFor(deviceId: string): BleReleaseWatchdog {
    const existing = this.bleWatchdogs.get(deviceId);
    if (existing) {
      existing.timeoutMs = useSessionStore.getState().bleReleaseTimeoutMs;
      return existing;
    }
    const created = new BleReleaseWatchdog(
      () => this.forceBleRelease(deviceId),
      useSessionStore.getState().bleReleaseTimeoutMs,
    );
    this.bleWatchdogs.set(deviceId, created);
    return created;
  }

  private accessoryLabel(deviceId: string): string {
    const state = useSessionStore.getState();
    return (
      state.bleBindings.find((item) => item.id === deviceId)?.name ||
      state.bleDevices.find((item) => item.id === deviceId)?.name ||
      'Bluetooth accessory'
    );
  }

  private async handleBleButton(deviceId: string, pressed: boolean): Promise<void> {
    const state = useSessionStore.getState();
    const selection = bindingTarget(state.bleBindings, deviceId, bleSelectionFromState(state));
    const target = resolveBleTalkTarget({
      selection,
      replyTarget: state.replyTarget,
      targets: state.targets,
    });
    if (!target) {
      useSessionStore.setState({
        error: 'No one to talk to in this production.',
      });
      return;
    }
    const action = this.policyFor(deviceId).handle(pressed, {
      shortPressLocks: state.bleShortPressLocks,
      lockedToTarget: state.talkLocked && state.lockedTargetKeys.includes(talkTargetIdentity(target)),
    });
    if (!action) {
      return;
    }
    if (action === 'startTalk') {
      await this.c.talk.pressTalk(target);
      return;
    }
    if (action === 'lockTalk') {
      await this.c.talk.lockTalk(target);
      return;
    }
    if (action === 'unlockTalk') {
      await this.c.talk.unlockTalk(target);
      return;
    }
    await this.c.talk.releaseTalk(target);
  }

  private async handleWatchTalk(command: WatchRemoteCommand, pressed: boolean): Promise<void> {
    if (!pressed) {
      const target = this.resolveWatchTarget(command);
      if (target) {
        await this.c.talk.releaseTalk(target);
      }
      return;
    }
    const target = this.resolveWatchTarget(command);
    if (!useSessionStore.getState().operatorReady || !target) {
      ackWatchTalk({ key: command.key, talking: false });
      return;
    }
    await this.c.talk.pressTalk(target);
    const talking = this.c.talkingTargets.some(
      (item) => talkTargetIdentity(item) === talkTargetIdentity(target),
    );
    ackWatchTalk({ key: command.key, talking });
  }

  private resolveWatchTarget(command: WatchRemoteCommand): TalkTarget | null {
    const targets = useSessionStore.getState().targets;
    if (command.key) {
      const match = targets.find((target) => talkTargetIdentity(target) === command.key);
      if (match) {
        return match;
      }
    }
    return (
      targets.find(
        (target) => target.type === command.targetType && String(target.id) === String(command.targetId),
      ) ?? null
    );
  }

  private currentPresence() {
    const state = useSessionStore.getState();
    return sessionPresence({
      operatorReady: state.operatorReady,
      talkSelectMode: state.talkSelectMode,
      incoming: state.incoming,
      talking: state.talking,
      talkingLabels: this.c.talkingTargets.map((item) => item.label),
      talkLocked: state.talkLocked,
      replyTarget: state.replyTarget,
      selectedTalkTarget: state.selectedTalkTarget,
      targets: state.targets,
      streamingFeedLabels: state.targets
        .filter((target) => {
          if (target.type !== 'feed') {
            return false;
          }
          const key = talkTargetIdentity(target);
          return state.activeFeedKeys.includes(key) && !state.stoppedFeedKeys.includes(key);
        })
        .map((target) => target.label),
    });
  }

  syncPresence(): void {
    const snapshot = this.currentPresence();
    publishSessionPresence(snapshot);
    publishWatchRemote(this.watchRemoteSnapshot());
    void this.syncForegroundService();
  }

  private watchRemoteSnapshot() {
    const state = useSessionStore.getState();
    return buildWatchRemoteSnapshot({
      operatorReady: state.operatorReady,
      username: state.username,
      productionName: state.productionName,
      targets: state.targets,
      peers: state.peers,
      replyTarget: state.replyTarget,
      talking: state.talking,
      talkingTargets: this.c.talkingTargets,
      incoming: state.incoming,
    });
  }

  async syncForegroundService(): Promise<void> {
    const run = this.c.fgsSync.then(() => this.syncForegroundServiceBody());
    this.c.fgsSync = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async syncForegroundServiceBody(): Promise<void> {
    const state = useSessionStore.getState();
    const nativeRunning = foregroundServiceSnapshot().running;
    const mode = foregroundServiceMode({
      platform: Platform.OS,
      operatorReady: state.operatorReady,
      nativeRunning,
    });
    const notification = presenceNotification(this.currentPresence());
    if (mode === 'idle') {
      if (state.fgsRunning) {
        useSessionStore.setState({
          fgsRunning: false,
          capabilityReason: this.capabilityReason({ fgsRunning: false }),
        });
      }
      return;
    }
    if (mode === 'stop') {
      await stopForegroundService();
      return;
    }
    await requestAndroidSessionPermissions();
    const includeConnectedDevice = anyBleDeviceActive(state.bleDevices, state.bleScanning);
    const talking = this.currentPresence().talking || this.currentPresence().talkLocked;
    if (mode === 'update') {
      await updateForegroundService(includeConnectedDevice, notification.title, notification.text, talking);
      if (!state.fgsRunning) {
        useSessionStore.setState({
          fgsRunning: true,
          fgsAvailable: true,
          capabilityReason: this.capabilityReason({ fgsRunning: true }),
        });
      }
      return;
    }
    const asked = await startForegroundService(
      includeConnectedDevice,
      notification.title,
      notification.text,
      talking,
    );
    const running = foregroundServiceSnapshot().running;
    useSessionStore.setState({
      fgsRunning: running,
      fgsAvailable: asked || running || foregroundServiceAvailable(),
      capabilityReason: this.capabilityReason({ fgsRunning: running }),
    });
  }

  async syncAudioSession(appState: AppStateStatus = AppState.currentState): Promise<void> {
    const state = useSessionStore.getState();
    const pttEnabled = iosPttEnabled();
    const available = audioSessionAvailable();
    const sessionOwnership = {
      platform: Platform.OS,
      pttEnabled,
      pttJoined: state.pttJoined,
      operatorReady: state.operatorReady,
    };
    if (shouldHandOffPlaybackToSystemPtt(sessionOwnership)) {
      await this.adoptSystemManagedPttAudio();
      return;
    }
    if (shouldTeardownAudioWhenNotOwningSession(sessionOwnership)) {
      if (state.audioSessionActive || state.audioKeepalive) {
        await this.teardownAudioSession();
      } else {
        useSessionStore.setState({
          audioSessionAvailable: available,
          capabilityReason: this.capabilityReason({ audioSessionAvailable: available }),
        });
      }
      return;
    }

    if (
      shouldStartBackgroundKeepalive({
        platform: Platform.OS,
        pttEnabled,
        pttJoined: state.pttJoined,
        operatorReady: state.operatorReady,
        appState,
      })
    ) {
      const started = await startBackgroundKeepalive();
      useSessionStore.setState({
        audioSessionAvailable: available,
        audioSessionActive: started || state.audioSessionActive,
        audioKeepalive: started,
        capabilityReason: this.capabilityReason({
          audioSessionAvailable: available,
          audioSessionActive: started || state.audioSessionActive,
          audioKeepalive: started,
        }),
      });
      return;
    }

    if (state.audioKeepalive) {
      await stopBackgroundKeepalive();
    }
    const active = await activateForIntercom();
    if (active) {
      await setWebRTCAudioEnabled(true);
    }
    useSessionStore.setState({
      audioSessionAvailable: available,
      audioSessionActive: active,
      audioKeepalive: false,
      capabilityReason: this.capabilityReason({
        audioSessionAvailable: available,
        audioSessionActive: active,
        audioKeepalive: false,
      }),
    });
  }

  async prepareAudioForTalk(): Promise<void> {
    const state = useSessionStore.getState();
    const ownsSession = shouldOwnAudioSession({
      platform: Platform.OS,
      pttEnabled: iosPttEnabled(),
      pttJoined: state.pttJoined,
      operatorReady: state.operatorReady,
    });
    if (
      !shouldReactivateCaptureForTalk({
        ownsSession,
        keepalive: state.audioKeepalive,
        appState: AppState.currentState,
      })
    ) {
      return;
    }
    const ok = await reactivateForOutgoingTalkCapture();
    if (ok) {
      useSessionStore.setState({
        audioSessionActive: true,
        audioKeepalive: false,
        capabilityReason: this.capabilityReason({ audioSessionActive: true, audioKeepalive: false }),
      });
    }
  }

  async teardownAudioSession(): Promise<void> {
    try {
      await stopBackgroundKeepalive();
    } catch {
      // ignore
    }
    try {
      await deactivateAudioSession();
    } catch {
      // ignore
    }
    useSessionStore.setState({
      audioSessionActive: false,
      audioKeepalive: false,
      capabilityReason: this.capabilityReason({ audioSessionActive: false, audioKeepalive: false }),
    });
  }

  async syncSystemPtt(): Promise<void> {
    const state = useSessionStore.getState();
    if (
      !shouldUseSystemPtt({
        platform: Platform.OS,
        pttEnabled: iosPttEnabled(),
        operatorReady: state.operatorReady,
        identityKind: state.identity?.kind,
      })
    ) {
      await this.leaveSystemPtt();
      return;
    }
    const signaling = this.c.signaling;
    if (!signaling) {
      return;
    }
    try {
      const bootstrap = parseApplePttBootstrap(await signaling.requestApplePttBootstrap());
      if (!bootstrap.enabled) {
        this.c.pttChannelUUID = null;
        await updatePttChannel(null, null);
        useSessionStore.setState({
          pttAvailable: pttNativeAvailable(),
          pttBootstrapEnabled: false,
          pttJoined: false,
          pttChannelName: '',
          capabilityReason: this.capabilityReason({ pttBootstrapEnabled: false, pttJoined: false }),
        });
        await this.syncAudioSession();
        return;
      }
      const previousUUID = this.c.pttChannelUUID;
      this.c.pttChannelUUID = bootstrap.channel.channelUUID;
      if (
        previousUUID &&
        previousUUID !== bootstrap.channel.channelUUID &&
        useSessionStore.getState().pttJoined
      ) {
        try {
          await leavePttChannel();
        } catch {
          // Banner join will request the server channel after this leave.
        }
        useSessionStore.setState({ pttJoined: false });
      }
      useSessionStore.setState({
        pttAvailable: pttNativeAvailable(),
        pttBootstrapEnabled: true,
        pttChannelName: bootstrap.channel.channelName,
        capabilityReason: this.capabilityReason({ pttBootstrapEnabled: true }),
      });
      await this.c.persistCurrentProfile();
      await this.flushPendingPttRegistration();
    } catch (error) {
      useSessionStore.setState({
        pttAvailable: pttNativeAvailable(),
        statusMessage: error instanceof Error ? error.message : String(error),
        capabilityReason: this.capabilityReason(),
      });
    }
  }

  async leaveSystemPtt(): Promise<void> {
    const channelUUID = this.c.pttChannelUUID;
    this.c.pttChannelUUID = null;
    if (channelUUID && this.c.signaling) {
      try {
        await this.c.signaling.unregisterApplePttPushToken(channelUUID);
      } catch {
        // ignore
      }
    }
    try {
      await leavePttChannel();
    } catch {
      // ignore
    }
    useSessionStore.setState({
      pttJoined: false,
      pttBootstrapEnabled: false,
      pttVerified: false,
      pttChannelName: '',
    });
    await this.syncAudioSession();
  }

  private async registerPttToken(token: string, channelUUID: string): Promise<void> {
    if (!isHexPushToken(token)) {
      return;
    }
    this.pendingPttRegistration = { token, channelUUID };
    await this.flushPendingPttRegistration();
  }

  private async flushPendingPttRegistration(): Promise<void> {
    const pending = this.pendingPttRegistration;
    const signaling = this.c.signaling;
    if (!pending || !signaling) {
      return;
    }
    try {
      await signaling.registerApplePttPushToken(pending.channelUUID, pending.token);
      useSessionStore.setState({ statusMessage: 'System PTT push token registered.' });
    } catch (error) {
      useSessionStore.setState({
        statusMessage:
          error instanceof Error ? error.message : 'System PTT push token registration failed.',
      });
    }
  }

  private async adoptSystemManagedPttAudio(): Promise<void> {
    try {
      await stopBackgroundKeepalive();
    } catch {
      // Keep configuring around the system session even if keepalive stop fails.
    }
    await prepareForSystemManagedIntercom();
    await setWebRTCAudioEnabled(true);
    const available = audioSessionAvailable();
    useSessionStore.setState({
      audioSessionAvailable: available,
      audioSessionActive: false,
      audioKeepalive: false,
      capabilityReason: this.capabilityReason({
        audioSessionAvailable: available,
        audioSessionActive: false,
        audioKeepalive: false,
      }),
    });
  }

  private async handlePttAudioActivated(): Promise<void> {
    await this.adoptSystemManagedPttAudio();
    await this.c.mediaCoordinator.refreshProducersFromPtt();
  }

  capabilityReason(
    overrides: {
      fgsRunning?: boolean;
      audioSessionAvailable?: boolean;
      audioSessionActive?: boolean;
      audioKeepalive?: boolean;
      pttAvailable?: boolean;
      pttBootstrapEnabled?: boolean;
      pttJoined?: boolean;
      pttVerified?: boolean;
    } = {},
  ): string {
    const state = useSessionStore.getState();
    return advertisedCapability({
      fgsRunning: overrides.fgsRunning ?? state.fgsRunning,
      audioSessionAvailable: overrides.audioSessionAvailable ?? state.audioSessionAvailable,
      audioSessionActive: overrides.audioSessionActive ?? state.audioSessionActive,
      audioKeepalive: overrides.audioKeepalive ?? state.audioKeepalive,
      pttAvailable: overrides.pttAvailable ?? state.pttAvailable,
      pttBootstrapEnabled: overrides.pttBootstrapEnabled ?? state.pttBootstrapEnabled,
      pttJoined: overrides.pttJoined ?? state.pttJoined,
      pttVerified: overrides.pttVerified ?? state.pttVerified,
    }).reason;
  }

  private persistBlePreferences(): void {
    const state = useSessionStore.getState();
    void saveBlePreferences({
      shortPressLocksTalk: state.bleShortPressLocks,
      releaseTimeoutMs: state.bleReleaseTimeoutMs,
      target: bleSelectionFromState(state),
      devices: state.bleBindings,
    });
  }
}
