import { AppState, Platform, type AppStateStatus } from 'react-native';

import {
  activateForIntercom,
  playWatchReadyCue,
  audioSessionAvailable,
  deactivateAudioSession,
  reactivateForOutgoingTalkCapture,
  setWebRTCAudioEnabled,
  startBackgroundKeepalive,
  stopBackgroundKeepalive,
} from '../audio/session';
import {
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
  bindingControlTarget,
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
import { AccessoryNotifySession, decodeUsbBytes, SppTokenParser } from '../hardware/codecs';
import { PttEventDeduper } from '../hardware/dedup';
import {
  ONBOARD_DEVICE_ID,
  describePttButton,
  hardwareDeviceId,
    isTalkButton,
    type PttButton,
  type PttDeviceKind,
  type PttEvent,
  type PttTransport,
} from '../hardware/events';
import {
  acceptHardwareDevice,
  cancelHardwarePairing,
  connectHardwareDevice,
  disconnectHardwareDevice,
  listBondedSerialDevices,
  startHardwarePairing,
  startPttHardware,
  subscribePttHardware,
  type HardwareBytesEvent,
  type HardwareNativeEvent,
  type HardwareNativeState,
} from '../hardware/native';
import { nextTalkableTarget, selectionFromTalkTarget, talkableAtKnob } from '../hardware/rotary';
import { talkTargetIdentity, type TalkTarget } from '../protocol';
import { sessionPresence, presenceNotification } from './presence';
import { publishSessionPresence, subscribeAppTerminating, subscribeDisconnectShortcut, subscribeTalkShortcut } from './presenceNative';
import { shouldDisconnectForAppStateChange } from './presenceShutdown';
import { mainButtonStorageKey } from './mainButton';
import { buildWatchRemoteSnapshot } from '../watch/snapshot';
import { WatchTalkControl } from '../watch/talkControl';
import { publishWatchRemote, subscribeWatchRemote, ackWatchTalk, type WatchRemoteCommand } from '../watch/native';
import { bleFieldsFromSelection, bleSelectionFromState, useSessionStore } from './state';
import type { SessionController } from './sessionController';

/** Background surfaces: FGS, audio-session ownership, BLE button, Watch, and presence. */
export class BackgroundCoordinator {
  private hardwareBound = false;
  private appStateSubscription: { remove: () => void } | null = null;
  private readonly blePolicies = new Map<string, BleButtonPolicy>();
  private readonly bleWatchdogs = new Map<string, BleReleaseWatchdog>();
  private readonly notifySessions = new Map<string, AccessoryNotifySession>();
  private readonly sppParsers = new Map<string, SppTokenParser>();
  private readonly eventDeduper = new PttEventDeduper();
  private hardwareLiveDevices: BleDeviceState[] = [];
  private unsubscribeHardware: (() => void) | null = null;
  private pairingTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly watchTalk = new WatchTalkControl({
    resolve: command => this.resolveWatchTarget(command),
    allowed: target => useSessionStore.getState().operatorReady && this.watchRemoteSnapshot().targets.some(
      row => row.key === talkTargetIdentity(target) && row.canTalk),
    press: (input, target) => this.c.talk.pressRemote(input, target),
    release: input => this.c.talk.releaseRemote(input),
    lock: target => this.c.talk.lockRemote(target),
    unlock: target => this.c.talk.unlockRemote(target),
    talking: target => this.c.talkingTargets.some(item => talkTargetIdentity(item) === talkTargetIdentity(target)),
    locked: target => this.c.lockedTargets.some(item => talkTargetIdentity(item) === talkTargetIdentity(target)),
    readyCue: playWatchReadyCue,
    ack: ackWatchTalk,
  });

  constructor(private readonly c: SessionController) {}

  bluetoothButtonCandidates(): TalkTarget[] {
    return bleTalkCandidates(useSessionStore.getState().targets);
  }

  bluetoothButtonSelection(deviceId?: string, button: PttButton = 'ptt'): BleTargetSelection {
    const state = useSessionStore.getState();
    const id = deviceId || state.bleFocusedDeviceId;
    return bindingTarget(state.bleBindings, id, bleSelectionFromState(state), button);
  }

  setBluetoothButtonTarget(selection: BleTargetSelection, deviceId?: string, button: PttButton = 'ptt'): void {
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
    const bindings = upsertBleDeviceBinding(state.bleBindings, { id, target: selection, button });
    useSessionStore.setState({
      bleBindings: bindings,
      bleFocusedDeviceId: id,
      ...(button === 'ptt' ? bleFieldsFromSelection(selection, state.bleShortPressLocks) : {}),
      statusMessage: `${this.accessoryLabel(id)} ${describePttButton(button)} set to ${describeBleTarget(selection)}.`,
    });
    this.persistBlePreferences();
  }

  setRotaryRetargetsPtt1(deviceId: string, enabled: boolean): void {
    const bindings = upsertBleDeviceBinding(useSessionStore.getState().bleBindings, {
      id: deviceId,
      rotaryRetargetsPtt1: enabled,
    });
    useSessionStore.setState({
      bleBindings: bindings,
      statusMessage: enabled
        ? 'Channel knob / up-down can change the PTT 1 target.'
        : 'Channel knob / up-down leave the PTT 1 target unchanged.',
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
    await this.startPttHardwareTransports();
    const boundIds = useSessionStore.getState().bleBindings.map((item) => item.id);
    useSessionStore.setState({
      blePairingActive: true,
      blePairingFoundId: null,
      blePairingMessage: 'Hold a PTT button, SOS, or turn the channel knob.',
      bleScanning: true,
      bondedSerialDevices: listBondedSerialDevices(),
      statusMessage: 'Listening for a PTT button…',
    });
    void startHardwarePairing({ timeoutMs: BLE_BUTTON_PAIRING_MS, boundIds });
    this.armPairingTimer();
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
        blePairingMessage:
          state.message ||
          'Bluetooth LE scan failed. Phone keys and serial buttons are still listening.',
      });
    }
  }

  async cancelButtonPairing(): Promise<void> {
    this.clearPairingTimer();
    if (!useSessionStore.getState().blePairingActive) {
      return;
    }
    const state = await cancelButtonPairingBle();
    await cancelHardwarePairing();
    useSessionStore.setState({
      blePairingActive: false,
      blePairingFoundId: null,
      blePairingMessage: '',
    });
    this.publishBleState(state);
  }

  async completeButtonPairing(
    deviceId: string,
    input: { name?: string; kind?: PttDeviceKind } = {},
  ): Promise<void> {
    const live = useSessionStore.getState().bleDevices.find((device) => device.id === deviceId);
    const kind = input.kind ?? this.kindForId(deviceId);
    const name =
      input.name?.trim() ||
      live?.name?.trim() ||
      (kind === 'onboard' ? 'This phone' : 'PTT accessory');
    if (kind === 'ble') {
      const state = await acceptPairedBleDevice(deviceId);
      this.publishBleState(state);
    } else {
      await acceptHardwareDevice(deviceId);
    }
    this.clearPairingTimer();
    const bindings = upsertBleDeviceBinding(useSessionStore.getState().bleBindings, {
      id: deviceId,
      name,
      kind,
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
  }

  async connectKnownBluetoothAccessory(deviceId: string): Promise<void> {
    await requestAndroidBlePermissions();
    this.focusBluetoothAccessory(deviceId);
    const kind = this.kindForId(deviceId);
    if (kind === 'onboard') {
      return;
    }
    if (kind === 'ble') {
      const state = await connectBleDevice(deviceId);
      this.publishBleState(state);
      return;
    }
    await connectHardwareDevice(deviceId);
  }

  async disconnectBluetoothButton(deviceId?: string): Promise<void> {
    if (deviceId) {
      this.forceBleRelease(deviceId);
    } else {
      this.resetBleAccessorySession();
    }
    const kind = deviceId ? this.kindForId(deviceId) : 'ble';
    if (!deviceId || kind === 'ble') {
      const state = await disconnectBle(deviceId);
      this.publishBleState(state);
    }
    if (!deviceId || kind === 'spp' || kind === 'usb') {
      await disconnectHardwareDevice(deviceId);
    }
    await this.syncForegroundService();
  }

  async probeSerialAccessory(deviceId: string): Promise<void> {
    await requestAndroidBlePermissions();
    await this.startPttHardwareTransports();
    useSessionStore.setState({
      blePairingActive: true,
      blePairingFoundId: null,
      blePairingMessage: 'Hold the button on that serial accessory.',
    });
    await connectHardwareDevice(deviceId);
  }

  removeBluetoothAccessory(deviceId: string): void {
    this.forceBleRelease(deviceId);
    const kind = this.kindForId(deviceId);
    if (kind === 'ble') {
      void disconnectBle(deviceId).then((state) => this.publishBleState(state));
    } else if (kind === 'spp' || kind === 'usb') {
      void disconnectHardwareDevice(deviceId);
    }
    const state = useSessionStore.getState();
    const bindings = removeBleDeviceBinding(state.bleBindings, deviceId);
    this.clearDeviceMaps(deviceId);
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
    this.notifySessions.clear();
    this.sppParsers.clear();
    this.eventDeduper.reset();
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
          const extras = this.notifySessionFor(deviceId).reset({
            source: 'ble',
            deviceId,
            timestamp: Date.now(),
            raw: 'disconnect',
          });
          for (const item of extras) {
            this.dispatchPttEvent(item);
          }
          this.forceBleRelease(deviceId);
        }
      },
      onDiagnostic: (message) => {
        this.noteHardwareLog(message);
      },
    });
    this.unsubscribeHardware?.();
    this.unsubscribeHardware = subscribePttHardware({
      onEvent: (event) => this.handleNativeHardwareEvent(event),
      onBytes: (event) => this.handleHardwareBytes(event),
      onState: (state) => this.publishHardwareState(state),
      onDiagnostic: (message) => this.noteHardwareLog(message),
    });
    this.c.mediaCoordinator.publishAudioDevices();
    subscribeAudioRoutes((snapshot) => {
      this.c.mediaCoordinator.publishAudioDevices(snapshot);
    });
    subscribeWatchRemote({
      onTalkStart: (command) => {
        void this.watchTalk.handle(command, 'start');
      },
      onTalkLock: command => { void this.watchTalk.handle(command, 'lock'); },
      onTalkStop: (command) => {
        void this.watchTalk.handle(command, 'stop');
      },
    });
    this.appStateSubscription?.remove();
    this.c.noteConnectionCueBackground(AppState.currentState !== 'active');
    this.appStateSubscription = AppState.addEventListener('change', (next) => {
      this.c.noteConnectionCueBackground(next !== 'active');
      // shouldDisconnectForAppStateChange is false for background and inactive.
      // Lock screen and Home must keep the session. The call stays so a future
      // change to that policy is the only way disconnect runs from AppState.
      if (shouldDisconnectForAppStateChange(next)) {
        void this.c.disconnect();
      }
      void this.syncAudioSession(next);
      if (shouldRetryForegroundService(Platform.OS, useSessionStore.getState().operatorReady, next)) {
        void this.syncForegroundService();
      }
    });
    useSessionStore.setState({
      fgsAvailable: foregroundServiceAvailable(),
      audioSessionAvailable: audioSessionAvailable(),
    });
  }

  publishBleState(state: BleConnectionState): void {
    const previous = useSessionStore.getState();
    const bleDevices = this.normalizeDevices(state);
    const devices = this.mergeLiveDevices(bleDevices);
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

    useSessionStore.setState({
      bleKind: kind,
      bleName: connectedBleDeviceNames(devices) || state.name || '',
      bleMessage: keepDiagnostic ? previous.bleMessage : (state.message ?? ''),
      bleScanning: scanning,
      bleDevices: devices,
      bleBindings: bindings,
      bleFocusedDeviceId: focused,
      ...bleFieldsFromSelection(focusedTarget, previous.bleShortPressLocks),
    });
    if (bindings !== previous.bleBindings && JSON.stringify(bindings) !== JSON.stringify(previous.bleBindings)) {
      this.persistBlePreferences();
    }
  }

  private mergeLiveDevices(bleDevices: BleDeviceState[]): BleDeviceState[] {
    const merged = new Map<string, BleDeviceState>();
    for (const device of bleDevices) {
      merged.set(device.id, device);
    }
    for (const device of this.hardwareLiveDevices) {
      merged.set(device.id, device);
    }
    for (const binding of useSessionStore.getState().bleBindings) {
      if (binding.kind === 'onboard' && !merged.has(binding.id)) {
        merged.set(binding.id, {
          id: binding.id,
          kind: 'connected',
          name: binding.name,
          profileId: 'onboard',
        });
      }
    }
    return [...merged.values()];
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
    if (bytes.length === 0) {
      return;
    }
    const events = this.notifySessionFor(id).apply(bytes, profile, {
      source: 'ble',
      deviceId: id,
      deviceName: live?.name,
      timestamp: Date.now(),
      raw: bytes.map((value) => value.toString(16).padStart(2, '0')).join(' '),
    });
    if (events.length === 0 && looksLikePttCommand(bytes, profile) && state.blePairingActive) {
      void this.completeButtonPairing(id, { kind: 'ble', name: live?.name });
      return;
    }
    for (const event of events) {
      this.dispatchPttEvent(event);
    }
  }

  private handleNativeHardwareEvent(event: HardwareNativeEvent): void {
    const button = event.button;
    if (!button) {
      return;
    }
    this.dispatchPttEvent({
      button,
      pressed: event.pressed,
      channel: event.channel,
      source: event.source,
      deviceId: hardwareDeviceId(event.source, event.deviceId),
      deviceName: event.deviceName,
      timestamp: Date.now(),
      raw: event.raw,
    });
  }

  private handleHardwareBytes(event: HardwareBytesEvent): void {
    const deviceId = hardwareDeviceId(event.source, event.deviceId);
    const timestamp = Date.now();
    if (event.source === 'spp') {
      const parser = this.sppParserFor(deviceId);
      const events = parser.push(event.text ?? '', {
        source: 'spp',
        deviceId,
        deviceName: event.deviceName,
        timestamp,
        raw: event.text,
      });
      for (const item of events) {
        this.dispatchPttEvent(item);
      }
      return;
    }
    if (event.source === 'usb') {
      const events = decodeUsbBytes(coerceNotifyBytes(event.data), {
        source: 'usb',
        deviceId,
        deviceName: event.deviceName,
        timestamp,
      });
      for (const item of events) {
        this.dispatchPttEvent(item);
      }
    }
  }

  private publishHardwareState(state: HardwareNativeState): void {
    this.hardwareLiveDevices = (state.devices ?? []).map((device) => ({
      id: device.id,
      kind:
        device.status === 'connected'
          ? 'connected'
          : device.status === 'connecting'
            ? 'connecting'
            : device.status === 'failed'
              ? 'failed'
              : device.status === 'disconnected'
                ? 'disconnected'
                : 'idle',
      name: device.name,
      message: device.message,
      profileId: device.kind,
    }));
    this.publishBleState({
      kind: useSessionStore.getState().bleKind,
      devices: useSessionStore.getState().bleDevices.filter((device) => !device.id.startsWith('spp:') && !device.id.startsWith('usb:')),
      scanning: useSessionStore.getState().bleScanning,
    });
  }

  async startPttHardwareTransports(): Promise<void> {
    if (Platform.OS !== 'android') {
      return;
    }
    await startPttHardware();
    const saved = useSessionStore.getState().bleBindings.filter((item) => item.kind === 'spp' || item.kind === 'usb');
    for (const binding of saved) {
      void connectHardwareDevice(binding.id);
    }
  }

  private dispatchPttEvent(event: PttEvent): void {
    if (this.eventDeduper.shouldDrop(event)) {
      return;
    }
    const deviceId = event.deviceId || hardwareDeviceId(event.source, event.deviceId);
    const kind = this.kindForSource(event.source, deviceId);
    this.noteHardwareLog(
      `${event.source} ${event.deviceName || deviceId} ${describePttButton(event.button)} ${event.pressed ? 'down' : 'up'}${
        event.channel != null ? ` #${event.channel}` : ''
      }`,
    );
    const state = useSessionStore.getState();
    const bound = state.bleBindings.some((item) => item.id === deviceId);
    if (state.blePairingActive && !bound) {
      void this.completeButtonPairing(deviceId, {
        kind,
        name: event.deviceName,
      }).then(() => {
        this.applyBoundEvent({ ...event, deviceId }, kind);
      });
      return;
    }
    if (!bound) {
      return;
    }
    this.applyBoundEvent({ ...event, deviceId }, kind);
  }

  private applyBoundEvent(event: PttEvent, _kind: PttDeviceKind): void {
    const deviceId = event.deviceId;
    if (!deviceId) {
      return;
    }
    const bindings = upsertBleDeviceBinding(useSessionStore.getState().bleBindings, {
      id: deviceId,
      seenButton: event.button,
    });
    if (JSON.stringify(bindings) !== JSON.stringify(useSessionStore.getState().bleBindings)) {
      useSessionStore.setState({ bleBindings: bindings });
      this.persistBlePreferences();
    }
    if (isTalkButton(event.button)) {
      if (event.pressed) {
        this.watchdogFor(deviceId, event.button).notePressed();
      } else {
        this.watchdogFor(deviceId, event.button).noteReleased();
      }
      void this.handleTalkControl(deviceId, event.button, event.pressed);
      return;
    }
    if (event.button === 'channelUp' || event.button === 'channelDown') {
      if (event.pressed === false) {
        return;
      }
      this.handleChannelStep(deviceId, event.button === 'channelUp' ? 1 : -1);
      return;
    }
    if (event.button === 'setChannel') {
      this.handleChannelSet(deviceId, event.channel ?? 0);
    }
  }

  private handleChannelStep(deviceId: string, delta: number): void {
    const state = useSessionStore.getState();
    const binding = state.bleBindings.find((item) => item.id === deviceId);
    if (!binding?.rotaryRetargetsPtt1) {
      this.noteHardwareLog('Channel step ignored (enable “Change PTT 1 target”).');
      return;
    }
    const candidates = bleTalkCandidates(state.targets);
    const current = resolveBleTalkTarget({
      selection: bindingControlTarget(binding, 'ptt'),
      replyTarget: state.replyTarget,
      targets: state.targets,
    });
    const next = nextTalkableTarget(candidates, current, delta);
    if (!next) {
      return;
    }
    this.setBluetoothButtonTarget(selectionFromTalkTarget(next), deviceId, 'ptt');
  }

  private handleChannelSet(deviceId: string, position: number): void {
    const state = useSessionStore.getState();
    const candidates = bleTalkCandidates(state.targets);
    const next = talkableAtKnob(candidates, position);
    if (!next) {
      return;
    }
    const binding = state.bleBindings.find((item) => item.id === deviceId);
    if (!binding?.rotaryRetargetsPtt1) {
      this.noteHardwareLog('Channel knob ignored (enable “Change PTT 1 target”).');
      return;
    }
    this.setBluetoothButtonTarget(selectionFromTalkTarget(next), deviceId, 'ptt');
  }

  private forceBleRelease(deviceId?: string): void {
    if (!deviceId) {
      const ids = new Set<string>();
      for (const key of this.blePolicies.keys()) {
        ids.add(key.split(':', 1)[0] ?? key);
      }
      for (const id of ids) {
        this.forceBleRelease(id);
      }
      return;
    }
    for (const [key, policy] of this.blePolicies.entries()) {
      if (key !== deviceId && !key.startsWith(`${deviceId}:`)) {
        continue;
      }
      this.bleWatchdogs.get(key)?.clear();
      if (!policy.isHeld()) {
        continue;
      }
      const button = (key.includes(':') ? key.slice(key.indexOf(':') + 1) : 'ptt') as PttButton;
      void this.handleTalkControl(deviceId, button, false);
    }
  }

  private policyKey(deviceId: string, button: PttButton = 'ptt'): string {
    return `${deviceId}:${button}`;
  }

  private policyFor(deviceId: string, button: PttButton = 'ptt'): BleButtonPolicy {
    const key = this.policyKey(deviceId, button);
    const existing = this.blePolicies.get(key);
    if (existing) {
      return existing;
    }
    const created = new BleButtonPolicy();
    this.blePolicies.set(key, created);
    return created;
  }

  private watchdogFor(deviceId: string, button: PttButton = 'ptt'): BleReleaseWatchdog {
    const key = this.policyKey(deviceId, button);
    const existing = this.bleWatchdogs.get(key);
    if (existing) {
      existing.timeoutMs = useSessionStore.getState().bleReleaseTimeoutMs;
      return existing;
    }
    const created = new BleReleaseWatchdog(
      () => {
        this.bleWatchdogs.get(key)?.clear();
        void this.handleTalkControl(deviceId, button, false);
      },
      useSessionStore.getState().bleReleaseTimeoutMs,
    );
    this.bleWatchdogs.set(key, created);
    return created;
  }

  private notifySessionFor(deviceId: string): AccessoryNotifySession {
    const existing = this.notifySessions.get(deviceId);
    if (existing) {
      return existing;
    }
    const created = new AccessoryNotifySession();
    this.notifySessions.set(deviceId, created);
    return created;
  }

  private sppParserFor(deviceId: string): SppTokenParser {
    const existing = this.sppParsers.get(deviceId);
    if (existing) {
      return existing;
    }
    const created = new SppTokenParser();
    this.sppParsers.set(deviceId, created);
    return created;
  }

  private clearDeviceMaps(deviceId: string): void {
    for (const key of [...this.blePolicies.keys()]) {
      if (key === deviceId || key.startsWith(`${deviceId}:`)) {
        this.blePolicies.delete(key);
      }
    }
    for (const key of [...this.bleWatchdogs.keys()]) {
      if (key === deviceId || key.startsWith(`${deviceId}:`)) {
        this.bleWatchdogs.get(key)?.clear();
        this.bleWatchdogs.delete(key);
      }
    }
    this.notifySessions.delete(deviceId);
    this.sppParsers.delete(deviceId);
  }

  private kindForId(deviceId: string): PttDeviceKind {
    const binding = useSessionStore.getState().bleBindings.find((item) => item.id === deviceId);
    if (binding?.kind) {
      return binding.kind;
    }
    if (deviceId === ONBOARD_DEVICE_ID) {
      return 'onboard';
    }
    if (deviceId.startsWith('spp:')) {
      return 'spp';
    }
    if (deviceId.startsWith('usb:')) {
      return 'usb';
    }
    return 'ble';
  }

  private kindForSource(source: PttTransport, deviceId: string): PttDeviceKind {
    if (source === 'intent') {
      return 'onboard';
    }
    if (source === 'spp') {
      return 'spp';
    }
    if (source === 'usb') {
      return 'usb';
    }
    return this.kindForId(deviceId);
  }

  private accessoryLabel(deviceId: string): string {
    const state = useSessionStore.getState();
    return (
      state.bleBindings.find((item) => item.id === deviceId)?.name ||
      state.bleDevices.find((device) => device.id === deviceId)?.name ||
      (deviceId === ONBOARD_DEVICE_ID ? 'This phone' : 'PTT accessory')
    );
  }

  private noteHardwareLog(message: string): void {
    if (!message.trim()) {
      return;
    }
    const previous = useSessionStore.getState().pttHardwareLog;
    useSessionStore.setState({
      pttHardwareLog: [...previous, message].slice(-30),
      bleMessage: message,
    });
  }

  private async handleTalkControl(deviceId: string, button: PttButton, pressed: boolean): Promise<void> {
    const state = useSessionStore.getState();
    const selection =
      button === 'sos'
        ? { kind: 'reply' as const }
        : bindingTarget(state.bleBindings, deviceId, bleSelectionFromState(state), button);
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
    const action = this.policyFor(deviceId, button).handle(pressed, {
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

  private async handleBleButton(deviceId: string, pressed: boolean): Promise<void> {
    await this.handleTalkControl(deviceId, 'ptt', pressed);
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

  private armPairingTimer(): void {
    this.clearPairingTimer();
    this.pairingTimer = setTimeout(() => {
      this.pairingTimer = null;
      if (!useSessionStore.getState().blePairingActive || useSessionStore.getState().blePairingFoundId) {
        return;
      }
      useSessionStore.setState({
        blePairingActive: false,
        blePairingMessage: 'No PTT button was heard. Hold the button and try again.',
        bleScanning: false,
      });
      void cancelButtonPairingBle().then((state) => this.publishBleState(state));
      void cancelHardwarePairing();
    }, BLE_BUTTON_PAIRING_MS);
  }

  private clearPairingTimer(): void {
    if (this.pairingTimer) {
      clearTimeout(this.pairingTimer);
      this.pairingTimer = null;
    }
  }

  private currentPresence() {
    const state = useSessionStore.getState();
    const main = this.c.talk.resolvedMainButton();
    return sessionPresence({
      operatorReady: state.operatorReady,
      incoming: state.incoming,
      talking: state.talking,
      talkingLabels: this.c.talkingTargets.map((item) => item.label),
      talkLocked: state.talkLocked,
      replyTarget: state.replyTarget,
      mainButtonLabel: main.mode === 'target' ? main.label : null,
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
      selectedTargetKeys: state.watchTargetSelections[mainButtonStorageKey(state.activeProfileId, state.productionId)],
      operatorReady: state.operatorReady,
      username: state.username,
      productionName: state.productionName,
      targets: state.targets,
      peers: state.peers,
      replyTarget: state.replyTarget,
      talking: state.talking,
      talkingTargets: this.c.talkingTargets,
      lockedTargetKeys: state.lockedTargetKeys,
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
    const includeConnectedDevice = anyBleDeviceActive(
      state.bleDevices.filter((device) => device.id !== ONBOARD_DEVICE_ID),
      state.bleScanning,
    );
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
    const available = audioSessionAvailable();
    if (
      shouldTeardownAudioWhenNotOwningSession({
        platform: Platform.OS,
        operatorReady: state.operatorReady,
      })
    ) {
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

  capabilityReason(
    overrides: {
      fgsRunning?: boolean;
      audioSessionAvailable?: boolean;
      audioSessionActive?: boolean;
      audioKeepalive?: boolean;
    } = {},
  ): string {
    const state = useSessionStore.getState();
    return advertisedCapability({
      fgsRunning: overrides.fgsRunning ?? state.fgsRunning,
      audioSessionAvailable: overrides.audioSessionAvailable ?? state.audioSessionAvailable,
      audioSessionActive: overrides.audioSessionActive ?? state.audioSessionActive,
      audioKeepalive: overrides.audioKeepalive ?? state.audioKeepalive,
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
