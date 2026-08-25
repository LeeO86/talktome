import { create } from 'zustand';

import { ApiClient } from '../auth/apiClient';
import type { CookieMap } from '../auth/cookieJar';
import { SessionConflictError, SessionCookieUnavailableError, TlsUntrustedError } from '../auth/errors';
import { TalkToMeHttp } from '../auth/http';
import { hasSessionCookie, readNativeCookies } from '../auth/nativeCookies';
import { requiresBrowserSessionCookie } from '../auth/serverCapabilities';
import { MediaEngine } from '../media/engine';
import {
  activeFeedKeysFromProducers,
  canTalkToTarget,
  defaultAudioPreference,
  normalizeAudioPreference,
  talkTargetIdentity,
  type ActiveProducer,
  type IncomingTalkState,
  type LoginOptions,
  type OperatorIdentity,
  type PeerSession,
  type Production,
  type TargetAudioPreference,
  type TalkTarget,
} from '../protocol';
import {
  EMPTY_CONFERENCE_LISTEN,
  loadConferenceListen,
  saveConferenceListen,
  setConferenceMemberLevel as nextConferenceMemberLevel,
  setConferenceMemberListening as nextConferenceMemberListening,
  type ConferenceListenState,
} from './conferenceListen';
import { isLikelyLocalHost, parseServerAddress } from '../servers/parseServerAddress';
import {
  hydrateTlsPins,
  probeServerCertificate,
  rememberTlsPin,
  storedPinForHost,
  type CertificateProbe,
} from '../servers/tlsTrust';
import { isRegisterConflict, isRegisterOk, SignalingClient } from '../signaling/client';
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
  shouldOwnAudioSession,
  shouldPrepareAudioForMedia,
  shouldReactivateCaptureForTalk,
  shouldStartBackgroundKeepalive,
} from '../audio/policy';
import { advertisedCapability } from '../background/capability';
import {
  foregroundServiceAvailable,
  openBatterySettings,
  startForegroundService,
  stopForegroundService,
  subscribeForegroundService,
  updateForegroundService,
} from '../background/foregroundService';
import { requestAndroidBlePermissions, requestAndroidSessionPermissions } from '../background/permissions';
import { shouldStartForegroundService } from '../background/fgs';
import { BleButtonPolicy } from '../ble/button';
import {
  disconnectBle,
  scanAndConnectBle,
  startBleNative,
  subscribeBleNative,
  type BleConnectionKind,
  type BleConnectionState,
} from '../ble/native';
import { loadBlePreferences, saveBlePreferences } from '../ble/preferences';
import {
  DEFAULT_BLE_TARGET,
  bleTalkCandidates,
  describeBleTarget,
  resolveBleTalkTarget,
  type BleTargetSelection,
} from '../ble/target';
import { resolveReplyTalkTarget } from '../talk/replyTarget';
import { slideToLockHint } from '../talk/slideToLock';
import { addTalkTarget, removeTalkTarget, talkTargetKeys } from '../talk/talkSet';
import { loadAudioPreferences, saveAudioPreferences } from './audioPrefs';
import {
  canJoinCachedSystemPtt,
  isHexPushToken,
  parseApplePttBootstrap,
  shouldUseSystemPtt,
} from '../ptt/policy';
import {
  beginPttJoin,
  lastPttDiagnostic,
  leavePttChannel,
  pttNativeAvailable,
  subscribePttNative,
  updatePttChannel,
  updatePttRemoteParticipant,
} from '../ptt/native';
import {
  cachedPttChannel,
  loadProfileBundle,
  passwordForProfile,
  profileCanAutoConnect,
  profileIdentity,
  removeProfile,
  savePasswordForProfile,
  saveProfileBundle,
  upsertProfile,
  type SavedProfile,
} from './remembered';
import { buildWatchRemoteSnapshot } from '../watch/snapshot';
import { publishWatchRemote, subscribeWatchRemote, ackWatchTalk, type WatchRemoteCommand } from '../watch/native';
import { sessionPresence, presenceNotification } from './presence';
import { publishSessionPresence, subscribeDisconnectShortcut, subscribeTalkShortcut } from './presenceNative';
import { AppState, Platform, type AppStateStatus } from 'react-native';

export type SessionUiState = {
  hydrated: boolean;
  status: 'idle' | 'connecting' | 'choose-production' | 'ready' | 'paused' | 'error';
  statusMessage: string;
  serverAddress: string;
  username: string;
  rememberPassword: boolean;
  allowInsecureLocalTLS: boolean;
  leftHanded: boolean;
  talkSelectMode: boolean;
  selectedTalkTarget: TalkTarget | null;
  replyTarget: TalkTarget | null;
  loginOptions: LoginOptions | null;
  pendingCertificate: CertificateProbe | null;
  identity: OperatorIdentity | null;
  productions: Production[];
  productionId: number | null;
  productionName: string | null;
  profiles: SavedProfile[];
  activeProfileId: string | null;
  paused: boolean;
  addingProfile: boolean;
  openLoginScanner: boolean;
  operatorReady: boolean;
  targets: TalkTarget[];
  talkingTargetKey: string | null;
  talkingTargetKeys: string[];
  lockedTargetKeys: string[];
  talking: boolean;
  talkLocked: boolean;
  incoming: IncomingTalkState;
  peers: PeerSession[];
  audioPreferences: Record<string, TargetAudioPreference>;
  speakingTargetKeys: string[];
  activeFeedKeys: string[];
  stoppedFeedKeys: string[];
  conferenceListen: ConferenceListenState;
  conflictName?: string;
  error: string | null;
  capabilityReason: string;
  overBudget: boolean;
  activeRemoteCount: number;
  signalingLabel: string;
  fgsRunning: boolean;
  fgsAvailable: boolean;
  audioSessionAvailable: boolean;
  audioSessionActive: boolean;
  audioKeepalive: boolean;
  pttAvailable: boolean;
  pttBootstrapEnabled: boolean;
  pttJoined: boolean;
  pttVerified: boolean;
  pttChannelName: string;
  pttDiagnostic: string;
  bleKind: BleConnectionKind;
  bleName: string;
  bleMessage: string;
  bleShortPressLocks: boolean;
  bleTargetKind: 'reply' | 'target';
  bleTargetType: string;
  bleTargetId: string;
  bleTargetLabel: string;
};

const FOREGROUND_REASON =
  'Foreground only on this build. iOS audio background mode is declared; lock-screen idle is still expected to die until Tier A.';
const HOLD_HINT = 'Hold to talk. Slide to lock.';

const initialState: SessionUiState = {
  hydrated: false,
  status: 'idle',
  statusMessage: '',
  serverAddress: '',
  username: '',
  rememberPassword: true,
  allowInsecureLocalTLS: false,
  leftHanded: false,
  talkSelectMode: false,
  selectedTalkTarget: null,
  replyTarget: null,
  loginOptions: null,
  pendingCertificate: null,
  identity: null,
  productions: [],
  productionId: null,
  productionName: null,
  profiles: [],
  activeProfileId: null,
  paused: false,
  addingProfile: false,
  openLoginScanner: false,
  operatorReady: false,
  targets: [],
  talkingTargetKey: null,
  talkingTargetKeys: [],
  lockedTargetKeys: [],
  talking: false,
  talkLocked: false,
  incoming: { addressedNow: [] },
  peers: [],
  audioPreferences: {},
  speakingTargetKeys: [],
  activeFeedKeys: [],
  stoppedFeedKeys: [],
  conferenceListen: EMPTY_CONFERENCE_LISTEN,
  error: null,
  capabilityReason: FOREGROUND_REASON,
  overBudget: false,
  activeRemoteCount: 0,
  signalingLabel: 'disconnected',
  fgsRunning: false,
  fgsAvailable: false,
  audioSessionAvailable: false,
  audioSessionActive: false,
  audioKeepalive: false,
  pttAvailable: false,
  pttBootstrapEnabled: false,
  pttJoined: false,
  pttVerified: false,
  pttChannelName: '',
  pttDiagnostic: '',
  bleKind: 'idle',
  bleName: '',
  bleMessage: '',
  bleShortPressLocks: true,
  bleTargetKind: 'reply',
  bleTargetType: '',
  bleTargetId: '',
  bleTargetLabel: '',
};

type SessionStore = SessionUiState & {
  setField: <K extends keyof SessionUiState>(key: K, value: SessionUiState[K]) => void;
};

export const useSessionStore = create<SessionStore>((set) => ({
  ...initialState,
  setField: (key, value) => set({ [key]: value } as Pick<SessionStore, typeof key>),
}));

class SessionController {
  private cookies: CookieMap = {};
  private serverAppVersion: string | undefined;
  private http: TalkToMeHttp | null = null;
  private api: ApiClient | null = null;
  private signaling: SignalingClient | null = null;
  private media: MediaEngine | null = null;
  private lastSocketId?: string;
  private pendingPassword?: string;
  private pendingLoginToken = false;
  private talkingTargets: TalkTarget[] = [];
  private lockedTargets: TalkTarget[] = [];
  private overrideFrom: TalkTarget[] | null = null;
  private reconnecting = false;
  private hardwareBound = false;
  private liveProducers = new Map<string, ActiveProducer>();
  private appStateSubscription: { remove: () => void } | null = null;
  private pttChannelUUID: string | null = null;
  private pendingPttRegistration: { token: string; channelUUID: string } | null = null;
  private readonly blePolicy = new BleButtonPolicy();

  async hydrate(): Promise<void> {
    const [bundle, audioPreferences, blePreferences, conferenceListen] = await Promise.all([
      loadProfileBundle(),
      loadAudioPreferences(),
      loadBlePreferences(),
      loadConferenceListen(),
      hydrateTlsPins(),
    ]);
    const last = bundle.profiles.find((item) => item.id === bundle.lastProfileId) ?? bundle.profiles[0] ?? null;
    useSessionStore.setState({
      hydrated: true,
      profiles: bundle.profiles,
      activeProfileId: last?.id ?? null,
      serverAddress: last?.serverAddress ?? '',
      username: last?.username ?? '',
      rememberPassword: last?.rememberPassword ?? true,
      allowInsecureLocalTLS: last?.allowInsecureLocalTLS ?? false,
      productionId: last?.productionId ?? null,
      productionName: last?.productionName ?? null,
      leftHanded: bundle.leftHanded,
      talkSelectMode: bundle.talkSelectMode,
      audioSessionAvailable: audioSessionAvailable(),
      pttAvailable: pttNativeAvailable(),
      capabilityReason: this.capabilityReason({
        audioSessionAvailable: audioSessionAvailable(),
        pttAvailable: pttNativeAvailable(),
      }),
      audioPreferences,
      conferenceListen,
      ...bleFieldsFromSelection(blePreferences.target, blePreferences.shortPressLocksTalk),
    });
    this.pendingPassword = last ? await passwordForProfile(last.id) : undefined;
    this.pendingLoginToken = Boolean(last?.loginToken);
    this.bindHardware();
    void startBleNative().then((state) => this.publishBleState(state));
    if (last?.serverAddress) {
      void this.refreshLoginOptions(last.serverAddress);
    }
    if (bundle.profiles.length === 1 && last && profileCanAutoConnect(last, this.pendingPassword)) {
      try {
        await this.connectProfile(last.id);
      } catch {
        useSessionStore.setState({ paused: false, addingProfile: false, status: 'idle' });
      }
    }
  }

  rememberedPassword(): string {
    if (this.pendingLoginToken) {
      return '';
    }
    return this.pendingPassword ?? '';
  }

  async refreshLoginOptions(serverAddress = useSessionStore.getState().serverAddress): Promise<void> {
    if (!serverAddress.trim()) {
      useSessionStore.setState({ loginOptions: null });
      return;
    }
    try {
      this.prepareHttp(serverAddress);
      const loginOptions = await this.api?.loginOptions();
      useSessionStore.setState({
        loginOptions: loginOptions ?? { guestLogin: { enabled: false, label: 'Guest' }, sso: { enabled: false } },
      });
    } catch {
      useSessionStore.setState({
        loginOptions: { guestLogin: { enabled: false, label: 'Guest' }, sso: { enabled: false } },
      });
    }
  }

  async login(input: {
    serverAddress: string;
    username: string;
    password: string;
    rememberPassword: boolean;
    force?: boolean;
  }): Promise<void> {
    this.pendingPassword = input.password;
    this.pendingLoginToken = false;
    this.beginConnect(input.serverAddress, input.username, input.rememberPassword);
    await this.probeAndHealth();
    useSessionStore.setState({ statusMessage: 'Signing in…' });
    const identity = await this.requireApi().login(input.username, input.password);
    await this.attachSessionCookie(input.serverAddress);
    await this.finishIdentity(identity, input.force === true);
    await this.persistCurrentProfile(input.password);
  }

  async loginWithToken(input: {
    serverAddress: string;
    token: string;
    rememberPassword?: boolean;
    force?: boolean;
  }): Promise<void> {
    this.pendingPassword = input.token;
    this.pendingLoginToken = true;
    this.beginConnect(input.serverAddress, useSessionStore.getState().username, input.rememberPassword ?? true);
    await this.probeAndHealth();
    useSessionStore.setState({ statusMessage: 'Signing in with login link…' });
    const identity = await this.requireApi().loginToken(input.token);
    useSessionStore.setState({ username: identity.name });
    await this.attachSessionCookie(input.serverAddress);
    await this.finishIdentity(identity, input.force === true);
    await this.persistCurrentProfile(input.token);
  }

  async loginGuest(input: { serverAddress: string; displayName?: string; force?: boolean }): Promise<void> {
    this.pendingLoginToken = false;
    this.beginConnect(input.serverAddress, input.displayName ?? useSessionStore.getState().username, false);
    await this.probeAndHealth();
    useSessionStore.setState({ statusMessage: 'Signing in as guest…' });
    const identity = await this.requireApi().loginGuest(input.displayName);
    await this.finishIdentity(identity, input.force === true);
    await this.persistCurrentProfile();
  }

  async acceptCertificateAndRetry(kind: 'user' | 'guest' = 'user'): Promise<void> {
    const pending = useSessionStore.getState().pendingCertificate;
    if (!pending) {
      return;
    }
    await rememberTlsPin({ hostname: pending.hostname, sha256: pending.sha256 });
    useSessionStore.setState({ pendingCertificate: null, error: null });
    const state = useSessionStore.getState();
    if (kind === 'guest') {
      await this.loginGuest({ serverAddress: state.serverAddress, displayName: state.username });
      return;
    }
    if (this.pendingLoginToken) {
      await this.loginWithToken({
        serverAddress: state.serverAddress,
        token: this.pendingPassword ?? '',
        rememberPassword: state.rememberPassword,
      });
      return;
    }
    await this.login({
      serverAddress: state.serverAddress,
      username: state.username,
      password: this.pendingPassword ?? '',
      rememberPassword: state.rememberPassword,
    });
  }

  async selectProduction(production: Production | null): Promise<void> {
    try {
      await this.enterOperator(production);
    } catch (error) {
      useSessionStore.setState({
        status: 'choose-production',
        operatorReady: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  reopenProductionPicker(): void {
    if ((useSessionStore.getState().productions ?? []).length === 0) {
      return;
    }
    useSessionStore.setState({
      operatorReady: false,
      status: 'choose-production',
      statusMessage: 'Choose a production',
    });
  }

  async takeOver(): Promise<void> {
    const state = useSessionStore.getState();
    if (state.identity?.kind === 'guest') {
      await this.loginGuest({
        serverAddress: state.serverAddress,
        displayName: state.identity.name,
        force: true,
      });
      return;
    }
    if (this.pendingLoginToken) {
      await this.loginWithToken({
        serverAddress: state.serverAddress,
        token: this.pendingPassword ?? '',
        rememberPassword: state.rememberPassword,
        force: true,
      });
      return;
    }
    await this.login({
      serverAddress: state.serverAddress,
      username: state.username,
      password: this.pendingPassword ?? '',
      rememberPassword: state.rememberPassword,
      force: true,
    });
  }

  async logout(statusMessage = 'Signed out.'): Promise<void> {
    await this.persistCurrentProfile();
    await this.teardownSession();
    this.applyDisconnectedState({ paused: false, addingProfile: false, statusMessage });
  }

  async disconnect(): Promise<void> {
    await this.persistCurrentProfile();
    await this.teardownSession();
    this.applyDisconnectedState({
      paused: true,
      addingProfile: false,
      status: 'paused',
      statusMessage: 'Disconnected.',
    });
  }

  async leaveToProfiles(): Promise<void> {
    await this.persistCurrentProfile();
    await this.teardownSession();
    this.applyDisconnectedState({ paused: false, addingProfile: false, statusMessage: '' });
  }

  openProfilePicker(): void {
    useSessionStore.setState({ paused: false, addingProfile: false, status: 'idle', error: null });
  }

  startAddProfile(options?: { openScanner?: boolean }): void {
    useSessionStore.setState({
      paused: false,
      addingProfile: true,
      openLoginScanner: Boolean(options?.openScanner),
      serverAddress: '',
      username: '',
      rememberPassword: true,
      productionId: null,
      productionName: null,
      error: null,
      conflictName: undefined,
      status: 'idle',
      statusMessage: '',
    });
    this.pendingPassword = undefined;
    this.pendingLoginToken = false;
  }

  cancelAddProfile(): void {
    const last = useSessionStore.getState().profiles.find((item) => item.id === useSessionStore.getState().activeProfileId);
    useSessionStore.setState({
      addingProfile: false,
      serverAddress: last?.serverAddress ?? useSessionStore.getState().profiles[0]?.serverAddress ?? '',
      username: last?.username ?? useSessionStore.getState().profiles[0]?.username ?? '',
    });
  }

  async connectProfile(profileId: string, options?: { userGesture?: boolean }): Promise<void> {
    const profile = useSessionStore.getState().profiles.find((item) => item.id === profileId);
    if (!profile) {
      throw new Error('Profile not found.');
    }
    if (options?.userGesture) {
      this.joinCachedSystemPttFromUserGesture(profile);
    }
    const password = await passwordForProfile(profile.id);
    this.pendingPassword = password;
    this.pendingLoginToken = Boolean(profile.loginToken);
    useSessionStore.setState({
      activeProfileId: profile.id,
      paused: false,
      addingProfile: false,
      serverAddress: profile.serverAddress,
      username: profile.username,
      rememberPassword: profile.rememberPassword,
      allowInsecureLocalTLS: Boolean(profile.allowInsecureLocalTLS),
      productionId: profile.productionId ?? null,
      productionName: profile.productionName ?? null,
      error: null,
    });
    try {
      if (profile.guest) {
        await this.loginGuest({
          serverAddress: profile.serverAddress,
          displayName: profile.guest.name,
        });
        return;
      }
      if (!password) {
        useSessionStore.setState({ addingProfile: true, status: 'idle' });
        return;
      }
      if (profile.loginToken) {
        await this.loginWithToken({
          serverAddress: profile.serverAddress,
          token: password,
          rememberPassword: profile.rememberPassword,
        });
        return;
      }
      await this.login({
        serverAddress: profile.serverAddress,
        username: profile.username,
        password,
        rememberPassword: profile.rememberPassword,
      });
    } catch (error) {
      if (error instanceof SessionConflictError) {
        useSessionStore.setState({
          addingProfile: true,
          status: 'idle',
          conflictName: error.existing?.name,
          error: null,
        });
        return;
      }
      if (error instanceof TlsUntrustedError) {
        useSessionStore.setState({ addingProfile: true, status: 'idle' });
        return;
      }
      useSessionStore.setState({
        status: 'idle',
        paused: false,
        addingProfile: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async reconnectLastProfile(): Promise<void> {
    const id = useSessionStore.getState().activeProfileId ?? useSessionStore.getState().profiles[0]?.id;
    if (!id) {
      this.startAddProfile();
      return;
    }
    await this.connectProfile(id, { userGesture: true });
  }

  async removeSavedProfile(profileId: string): Promise<void> {
    const state = useSessionStore.getState();
    const next = await removeProfile(profileId, {
      profiles: state.profiles,
      lastProfileId: state.activeProfileId,
      leftHanded: state.leftHanded,
      talkSelectMode: state.talkSelectMode,
    });
    const fallback = next.profiles.find((item) => item.id === next.lastProfileId) ?? next.profiles[0];
    useSessionStore.setState({
      profiles: next.profiles,
      activeProfileId: next.lastProfileId,
      ...(state.activeProfileId === profileId
        ? {
            serverAddress: fallback?.serverAddress ?? '',
            username: fallback?.username ?? '',
          }
        : {}),
    });
  }

  private async teardownSession(): Promise<void> {
    const identity = useSessionStore.getState().identity;
    try {
      await this.media?.stopTalking();
    } catch {
      // ignore
    }
    try {
      await this.media?.stop();
    } catch {
      // ignore
    }
    try {
      await this.signaling?.logout();
    } catch {
      // ignore
    }
    try {
      await this.api?.logout(identity?.id, this.signaling?.socketId);
    } catch {
      // ignore
    }
    this.signaling?.disconnect();
    this.media = null;
    this.signaling = null;
    this.api = null;
    this.http = null;
    this.cookies = {};
    this.talkingTargets = [];
    this.lockedTargets = [];
    this.overrideFrom = null;
    this.liveProducers = new Map();
    this.blePolicy.reset();
    await this.leaveSystemPtt();
    await this.teardownAudioSession();
    await stopForegroundService();
  }

  private applyDisconnectedState(input: {
    paused: boolean;
    addingProfile: boolean;
    status?: SessionUiState['status'];
    statusMessage: string;
  }): void {
    const next = useSessionStore.getState();
    useSessionStore.setState({
      ...initialState,
      hydrated: true,
      serverAddress: next.serverAddress,
      username: next.username,
      rememberPassword: next.rememberPassword,
      allowInsecureLocalTLS: next.allowInsecureLocalTLS,
      leftHanded: next.leftHanded,
      talkSelectMode: next.talkSelectMode,
      productionId: next.productionId,
      productionName: next.productionName,
      profiles: next.profiles,
      activeProfileId: next.activeProfileId,
      paused: input.paused,
      addingProfile: input.addingProfile,
      conferenceListen: next.conferenceListen,
      loginOptions: next.loginOptions,
      audioPreferences: next.audioPreferences,
      bleKind: next.bleKind,
      bleName: next.bleName,
      bleMessage: next.bleMessage,
      bleShortPressLocks: next.bleShortPressLocks,
      bleTargetKind: next.bleTargetKind,
      bleTargetType: next.bleTargetType,
      bleTargetId: next.bleTargetId,
      bleTargetLabel: next.bleTargetLabel,
      fgsAvailable: next.fgsAvailable,
      audioSessionAvailable: next.audioSessionAvailable,
      pttAvailable: next.pttAvailable,
      status: input.status ?? 'idle',
      statusMessage: input.statusMessage,
    });
    this.syncPresence();
  }

  private async persistCurrentProfile(password = this.pendingPassword): Promise<void> {
    const state = useSessionStore.getState();
    if (!state.serverAddress.trim() || !state.username.trim()) {
      await saveProfileBundle({
        profiles: state.profiles,
        lastProfileId: state.activeProfileId,
        leftHanded: state.leftHanded,
        talkSelectMode: state.talkSelectMode,
      });
      return;
    }
    const id = profileIdentity(state.serverAddress, state.username);
    const existing = state.profiles.find((item) => item.id === id);
    const guest =
      state.identity?.kind === 'guest'
        ? {
            guestId: String(state.identity.guestId ?? state.identity.id),
            guestProfileUserId: state.identity.guestProfileUserId ?? 0,
            name: state.identity.name,
          }
        : existing?.guest;
    const saved: SavedProfile = {
      id,
      serverAddress: state.serverAddress,
      username: state.username,
      rememberPassword: state.rememberPassword,
      allowInsecureLocalTLS: state.allowInsecureLocalTLS,
      productionId: state.operatorReady ? state.productionId : (existing?.productionId ?? state.productionId),
      productionName: state.operatorReady ? state.productionName : (existing?.productionName ?? state.productionName),
      pttChannelUUID: guest ? undefined : (this.pttChannelUUID ?? existing?.pttChannelUUID),
      pttChannelName: guest
        ? undefined
        : (state.pttChannelName.trim() || existing?.pttChannelName),
      guest,
      loginToken: guest ? undefined : this.pendingLoginToken || undefined,
    };
    const profiles = upsertProfile(state.profiles, saved);
    useSessionStore.setState({ profiles, activeProfileId: id, addingProfile: false });
    await saveProfileBundle({
      profiles,
      lastProfileId: id,
      leftHanded: state.leftHanded,
      talkSelectMode: state.talkSelectMode,
    });
    if (state.rememberPassword && password) {
      await savePasswordForProfile(id, password);
    } else if (!state.rememberPassword) {
      await savePasswordForProfile(id, undefined);
    }
  }

  canTalkTo(target: TalkTarget): boolean {
    return canTalkToTarget(target, useSessionStore.getState().peers);
  }

  audioPreference(target: TalkTarget): TargetAudioPreference {
    return (
      useSessionStore.getState().audioPreferences[talkTargetIdentity(target)] ?? defaultAudioPreference()
    );
  }

  setTargetVolume(target: TalkTarget, volume: number): void {
    this.updateAudioPreference(target, { volume });
  }

  toggleTargetMuted(target: TalkTarget): void {
    const current = this.audioPreference(target);
    this.updateAudioPreference(target, { muted: !current.muted });
  }

  toggleFeedReception(target: TalkTarget): void {
    if (target.type !== 'feed') {
      return;
    }
    const key = talkTargetIdentity(target);
    const current = new Set(useSessionStore.getState().stoppedFeedKeys);
    if (current.has(key)) {
      current.delete(key);
    } else {
      current.add(key);
    }
    const stoppedFeedKeys = [...current];
    useSessionStore.setState({ stoppedFeedKeys });
    this.syncPresence();
    void this.media?.setStoppedFeedKeys(stoppedFeedKeys, this.consumerContext()).then(() => {
      this.publishMediaSnapshot();
    });
  }

  async pressTalk(target: TalkTarget): Promise<void> {
    if (!this.canTalkTo(target)) {
      useSessionStore.setState({
        error: target.type === 'user' ? 'This target is currently offline.' : 'This target is listen-only.',
      });
      return;
    }
    if (!this.media) {
      useSessionStore.setState({ error: 'Media is not ready.' });
      return;
    }

    await this.prepareAudioForTalk();

    const key = talkTargetIdentity(target);
    const state = useSessionStore.getState();
    if (state.talkLocked && state.lockedTargetKeys.includes(key) && this.overrideFrom === null) {
      await this.unlockTalk();
      return;
    }

    if (state.talkLocked && !state.talkingTargetKeys.includes(key)) {
      this.overrideFrom = this.lockedTargets.length > 0 ? this.lockedTargets : this.talkingTargets;
      this.talkingTargets = [target];
      this.publishTalkState(true);
      try {
        await this.media.startTalking(this.talkingTargets, false);
      } catch (error) {
        this.failTalk(error);
      }
      return;
    }

    this.talkingTargets = addTalkTarget(this.talkingTargets, target);
    this.publishTalkState(state.talkLocked);
    try {
      await this.media.startTalking(this.talkingTargets, state.talkLocked);
    } catch (error) {
      this.failTalk(error);
    }
  }

  async lockTalk(target: TalkTarget): Promise<void> {
    if (!this.canTalkTo(target) || !this.media) {
      return;
    }
    await this.prepareAudioForTalk();
    this.talkingTargets = addTalkTarget(this.talkingTargets, target);
    this.lockedTargets = this.talkingTargets;
    this.overrideFrom = null;
    this.publishTalkState(true);
    try {
      await this.media.startTalking(this.talkingTargets, true);
      useSessionStore.setState({ statusMessage: `Locked to ${this.talkingTargets.map((item) => item.label).join(', ')}.` });
    } catch (error) {
      this.failTalk(error);
    }
  }

  async releaseTalk(target?: TalkTarget): Promise<void> {
    if (this.overrideFrom) {
      this.talkingTargets = this.overrideFrom;
      this.lockedTargets = this.overrideFrom;
      this.overrideFrom = null;
      this.publishTalkState(true);
      this.media?.syncTalkTargets(this.talkingTargets, true);
      useSessionStore.setState({
        statusMessage: `Locked to ${this.talkingTargets.map((item) => item.label).join(', ')}.`,
      });
      return;
    }

    if (useSessionStore.getState().talkLocked) {
      return;
    }

    if (target) {
      this.talkingTargets = removeTalkTarget(this.talkingTargets, target);
      if (this.talkingTargets.length > 0) {
        this.publishTalkState(false);
        this.media?.syncTalkTargets(this.talkingTargets, false);
        return;
      }
    }

    try {
      await this.media?.stopTalking();
    } finally {
      this.talkingTargets = [];
      this.lockedTargets = [];
      this.publishTalkState(false);
      useSessionStore.setState({ statusMessage: HOLD_HINT });
    }
  }

  async pressReply(): Promise<void> {
    const reply = this.replyTalkTarget();
    if (!reply) {
      useSessionStore.setState({ error: 'No one to reply to.' });
      return;
    }
    await this.pressTalk(reply);
  }

  async lockReply(): Promise<void> {
    const reply = this.replyTalkTarget();
    if (!reply) {
      return;
    }
    await this.lockTalk(reply);
  }

  replyTalkTarget(): TalkTarget | null {
    return useSessionStore.getState().replyTarget;
  }

  setLeftHanded(leftHanded: boolean): void {
    useSessionStore.setState({ leftHanded, statusMessage: slideToLockHint(leftHanded) });
    this.persistLayout();
  }

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
    const channelUUID = this.pttChannelUUID;
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

  private joinCachedSystemPttFromUserGesture(profile: SavedProfile): void {
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
    this.pttChannelUUID = cached.channelUUID;
    useSessionStore.setState({
      pttChannelName: cached.channelName,
      pttDiagnostic: 'Joining system PTT channel…',
      statusMessage: 'Joining system PTT channel…',
    });
    void this.finishSystemPttJoin(beginPttJoin(cached.channelUUID, cached.channelName));
  }

  private async beginSystemPttJoin(channelUUID: string, channelName: string): Promise<void> {
    this.pttChannelUUID = channelUUID;
    useSessionStore.setState({
      pttChannelName: channelName,
      pttDiagnostic: 'Joining system PTT channel…',
      statusMessage: 'Joining system PTT channel…',
    });
    await this.finishSystemPttJoin(beginPttJoin(channelUUID, channelName));
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

  setTalkSelectMode(talkSelectMode: boolean): void {
    const state = useSessionStore.getState();
    const selectedTalkTarget = talkSelectMode
      ? state.selectedTalkTarget ?? state.replyTarget ?? this.firstTalkableTarget()
      : state.selectedTalkTarget;
    useSessionStore.setState({
      talkSelectMode,
      selectedTalkTarget,
      statusMessage: talkSelectMode
        ? selectedTalkTarget
          ? `Talk & select: ${selectedTalkTarget.label}`
          : 'Talk & select: tap a card, then hold Talk.'
        : HOLD_HINT,
    });
    this.persistLayout();
    this.syncPresence();
  }

  selectTalkTarget(target: TalkTarget): void {
    if (!this.canTalkTo(target)) {
      return;
    }
    useSessionStore.setState({ selectedTalkTarget: target });
    const state = useSessionStore.getState();
    if (state.talkSelectMode && state.talking) {
      void this.retargetTalk(target);
    }
    this.syncPresence();
  }

  private firstTalkableTarget(): TalkTarget | null {
    return useSessionStore.getState().targets.find((target) => this.canTalkTo(target)) ?? null;
  }

  private async retargetTalk(target: TalkTarget): Promise<void> {
    if (!this.media || !this.canTalkTo(target)) {
      return;
    }
    this.talkingTargets = [target];
    if (useSessionStore.getState().talkLocked) {
      this.lockedTargets = [target];
    }
    this.publishTalkState(useSessionStore.getState().talkLocked);
    try {
      await this.media.startTalking(this.talkingTargets, useSessionStore.getState().talkLocked);
    } catch (error) {
      this.failTalk(error);
    }
  }

  async pressSelectedTalk(): Promise<void> {
    const target = useSessionStore.getState().selectedTalkTarget;
    if (!target) {
      useSessionStore.setState({ error: 'Select a destination on a card first.' });
      return;
    }
    await this.pressTalk(target);
  }

  async lockSelectedTalk(): Promise<void> {
    const target = useSessionStore.getState().selectedTalkTarget;
    if (!target) {
      return;
    }
    await this.lockTalk(target);
  }

  async toggleCurrentTalk(): Promise<void> {
    const state = useSessionStore.getState();
    if (!state.operatorReady) {
      return;
    }
    if (state.talking || state.talkLocked) {
      await this.unlockTalk();
      return;
    }
    if (state.talkSelectMode) {
      await this.lockSelectedTalk();
      return;
    }
    await this.lockReply();
  }

  handleTalkUrl(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }
    if (parsed.protocol !== 'talktome:') {
      return;
    }
    const path = `${parsed.host}${parsed.pathname}`.replace(/\/+$/, '').replace(/^\/+/, '');
    if (path !== 'talk') {
      return;
    }
    void this.toggleCurrentTalk();
  }

  setConferenceMemberListening(conferenceId: number | string, userId: number, listening: boolean): void {
    const next = nextConferenceMemberListening(
      useSessionStore.getState().conferenceListen,
      conferenceId,
      userId,
      listening,
    );
    this.applyConferenceListen(next);
  }

  setConferenceMemberLevel(conferenceId: number | string, userId: number, level: number): void {
    const next = nextConferenceMemberLevel(
      useSessionStore.getState().conferenceListen,
      conferenceId,
      userId,
      level,
    );
    this.applyConferenceListen(next);
  }

  private applyConferenceListen(next: ConferenceListenState): void {
    useSessionStore.setState({ conferenceListen: next });
    this.media?.setConferenceListen(next);
    void saveConferenceListen(next);
  }

  private persistLayout(): void {
    void this.persistCurrentProfile();
  }

  bluetoothButtonCandidates(): TalkTarget[] {
    return bleTalkCandidates(useSessionStore.getState().targets);
  }

  bluetoothButtonSelection(): BleTargetSelection {
    return bleSelectionFromState(useSessionStore.getState());
  }

  setBluetoothButtonTarget(selection: BleTargetSelection): void {
    useSessionStore.setState({
      ...bleFieldsFromSelection(selection, useSessionStore.getState().bleShortPressLocks),
      statusMessage: `Bluetooth Button target set to ${describeBleTarget(selection)}.`,
    });
    this.persistBlePreferences();
  }

  setBluetoothButtonShortPressLocks(enabled: boolean): void {
    useSessionStore.setState({
      bleShortPressLocks: enabled,
      statusMessage: enabled
        ? 'Bluetooth Button short press now locks talk.'
        : 'Bluetooth Button short press lock disabled.',
    });
    this.persistBlePreferences();
  }

  async connectBluetoothButton(): Promise<void> {
    await requestAndroidBlePermissions();
    const state = await scanAndConnectBle();
    this.publishBleState(state);
  }

  async disconnectBluetoothButton(): Promise<void> {
    const state = await disconnectBle();
    this.publishBleState(state);
    await this.syncForegroundService();
  }

  async openBatteryEducation(): Promise<void> {
    const opened = await openBatterySettings();
    useSessionStore.setState({
      statusMessage: opened
        ? 'Opened battery settings. Set TalkToMe to Unrestricted if the OEM offers it.'
        : 'Could not open battery settings from this build.',
    });
  }

  private refreshReplyTarget(): void {
    const state = useSessionStore.getState();
    const replyTarget = resolveReplyTalkTarget({
      incoming: state.incoming,
      targets: state.targets,
      peers: state.peers,
      lastReply: state.replyTarget,
      fallback: this.firstTalkableTarget(),
    });
    useSessionStore.setState({ replyTarget });
    const incomingName = latestIncomingName(state.incoming);
    void updatePttRemoteParticipant(incomingName ?? replyTarget?.label ?? null);
    this.syncPresence();
  }

  private async unlockTalk(): Promise<void> {
    try {
      await this.media?.stopTalking();
    } finally {
      this.talkingTargets = [];
      this.lockedTargets = [];
      this.overrideFrom = null;
      this.publishTalkState(false);
      useSessionStore.setState({ statusMessage: HOLD_HINT });
    }
  }

  private failTalk(error: unknown): void {
    this.talkingTargets = [];
    this.lockedTargets = [];
    this.overrideFrom = null;
    this.publishTalkState(false);
    useSessionStore.setState({
      error: error instanceof Error ? error.message : String(error),
      statusMessage: 'PTT could not start.',
    });
  }

  private publishTalkState(locked: boolean): void {
    const keys = talkTargetKeys(this.talkingTargets);
    const lockedKeys = talkTargetKeys(this.lockedTargets);
    const overriding = this.overrideFrom !== null;
    useSessionStore.setState({
      talking: this.talkingTargets.length > 0,
      talkLocked: locked && this.lockedTargets.length > 0,
      talkingTargetKey: keys[0] ?? null,
      talkingTargetKeys: keys,
      lockedTargetKeys: locked ? lockedKeys : [],
      error: null,
      statusMessage:
        this.talkingTargets.length > 0
          ? locked && !overriding
            ? `Locked to ${this.talkingTargets.map((item) => item.label).join(', ')}.`
            : `Talking to ${this.talkingTargets.map((item) => item.label).join(', ')}…`
          : HOLD_HINT,
    });
    this.syncPresence();
  }

  private async enterOperator(production: Production | null): Promise<void> {
    const identity = useSessionStore.getState().identity;
    if (!identity || !this.api || !this.signaling) {
      throw new Error('Not signed in.');
    }

    useSessionStore.setState({
      status: 'connecting',
      statusMessage: 'Loading targets…',
      productionId: production?.id ?? null,
      productionName: production?.name ?? (useSessionStore.getState().productions.length > 0 ? 'Default' : null),
      error: null,
    });

    const targets = await this.loadTargets(identity, production?.id ?? null);

    if (!this.media) {
      this.media = new MediaEngine(this.signaling);
      this.media.setAudioPreferences(useSessionStore.getState().audioPreferences);
      this.media.setConferenceListen(useSessionStore.getState().conferenceListen);
      useSessionStore.setState({ statusMessage: 'Starting media…' });
      await this.prepareAudioForMedia();
      await this.media.start();
      try {
        await this.media.warmTalkProducer();
      } catch (error) {
        useSessionStore.setState({
          statusMessage: `Microphone not ready: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    } else {
      this.media.setAudioPreferences(useSessionStore.getState().audioPreferences);
      this.media.setConferenceListen(useSessionStore.getState().conferenceListen);
    }

    const producers = await this.signaling.requestActiveProducers();
    this.replaceLiveProducers(producers);
    await this.media.syncProducers(producers, this.consumerContext());
    this.publishMediaSnapshot();

    useSessionStore.setState({
      status: 'ready',
      operatorReady: true,
      targets,
      talking: false,
      talkLocked: false,
      talkingTargetKey: null,
      talkingTargetKeys: [],
      lockedTargetKeys: [],
      statusMessage: useSessionStore.getState().talkSelectMode ? 'Talk & select: tap a card, then hold Talk.' : HOLD_HINT,
    });
    this.refreshReplyTarget();
    this.refreshSelectedTalkTarget(targets);
    await this.syncAudioSession(AppState.currentState);
    await this.syncForegroundService();
    await this.syncSystemPtt();
    await this.persistCurrentProfile();
    this.syncPresence();
  }

  private async loadTargets(identity: OperatorIdentity, productionId: number | null): Promise<TalkTarget[]> {
    if (identity.kind === 'guest') {
      return this.requireApi().fetchGuestTargets(productionId);
    }
    return this.requireApi().fetchTargets(Number(identity.id), productionId);
  }

  private updateAudioPreference(target: TalkTarget, patch: Partial<TargetAudioPreference>): void {
    const key = talkTargetIdentity(target);
    const next = {
      ...useSessionStore.getState().audioPreferences,
      [key]: normalizeAudioPreference({
        ...this.audioPreference(target),
        ...patch,
      }),
    };
    useSessionStore.setState({ audioPreferences: next });
    this.media?.setAudioPreferences(next);
    void saveAudioPreferences(next);
  }

  private publishMediaSnapshot(): void {
    useSessionStore.setState({
      overBudget: this.media?.overBudget ?? false,
      activeRemoteCount: this.media?.activeRemoteCount ?? 0,
      speakingTargetKeys: this.media?.speakingTargetKeys ?? [],
    });
  }

  private bindSignaling(signaling: SignalingClient): void {
    signaling.handlers = {
      onStateChange: (state) => {
        if (state.status === 'connected') {
          useSessionStore.setState({ signalingLabel: `connected ${state.socketId ?? ''}`.trim() });
        } else if (state.status === 'connecting') {
          useSessionStore.setState({ signalingLabel: 'reconnecting' });
        } else if (state.status === 'failed') {
          useSessionStore.setState({ signalingLabel: `failed: ${state.message}` });
        } else {
          useSessionStore.setState({ signalingLabel: 'disconnected' });
        }
      },
      onReconnect: () => {
        void this.handleReconnect();
      },
      onUserList: (peers) => {
        useSessionStore.setState({ peers });
        this.syncPresence();
      },
      onSessionKicked: (info) => {
        const message =
          info.reason === 'duplicate-login'
            ? 'This session was disconnected because another login took over.'
            : 'The session was disconnected by the server.';
        void this.logout(message);
      },
      onTargetsUpdated: () => {
        void this.refreshTargets();
      },
      onConferenceMembersUpdated: () => {
        void this.refreshTargets();
      },
      onIncomingTalkState: (incoming) => {
        useSessionStore.setState({ incoming });
        this.refreshReplyTarget();
        this.syncPresence();
      },
      onProducerStarted: (producer) => {
        this.rememberLiveProducer(producer);
        void this.media?.consumeProducer(producer, this.consumerContext()).then(() => {
          this.publishMediaSnapshot();
        });
      },
      onProducerClosed: (producer) => {
        this.forgetLiveProducer(producer.producerId);
        void this.media?.dropProducer(producer.producerId).then(() => {
          this.publishMediaSnapshot();
        });
      },
    };
  }

  private async handleReconnect(): Promise<void> {
    if (this.reconnecting) {
      return;
    }
    this.reconnecting = true;
    useSessionStore.setState({ statusMessage: 'Reconnecting…' });
    try {
      const identity = useSessionStore.getState().identity;
      if (!identity || !this.signaling) {
        return;
      }
      let register = await this.signaling.register(identity, false);
      if (isRegisterConflict(register)) {
        const sameStaleSocket =
          Boolean(this.lastSocketId) && register.existing?.socketId === this.lastSocketId;
        if (!sameStaleSocket) {
          await this.logout('Could not re-register after reconnect.');
          return;
        }
        register = await this.signaling.register(identity, true);
      }
      if (!isRegisterOk(register) && identity.kind === 'user' && this.pendingPassword) {
        await this.reauthenticateUser();
        return;
      }
      if (!isRegisterOk(register)) {
        await this.logout('Could not re-register after reconnect.');
        return;
      }
      await this.rebuildMediaAfterReconnect();
    } catch (error) {
      if (useSessionStore.getState().identity?.kind === 'user' && this.pendingPassword) {
        try {
          await this.reauthenticateUser();
          return;
        } catch {
          // fall through
        }
      }
      useSessionStore.setState({
        error: error instanceof Error ? error.message : String(error),
        statusMessage: 'Reconnect failed. Retrying…',
      });
    } finally {
      this.reconnecting = false;
    }
  }

  private async reauthenticateUser(): Promise<void> {
    const state = useSessionStore.getState();
    if (this.pendingLoginToken) {
      await this.loginWithToken({
        serverAddress: state.serverAddress,
        token: this.pendingPassword ?? '',
        rememberPassword: state.rememberPassword,
        force: true,
      });
      return;
    }
    await this.login({
      serverAddress: state.serverAddress,
      username: state.username,
      password: this.pendingPassword ?? '',
      rememberPassword: state.rememberPassword,
      force: true,
    });
  }

  private async rebuildMediaAfterReconnect(): Promise<void> {
    if (!this.signaling) {
      return;
    }
    this.lastSocketId = this.signaling.socketId;
    const locked = useSessionStore.getState().talkLocked;
    const resumeTargets = locked ? this.lockedTargets : [];
    try {
      await this.media?.stop();
    } catch {
      // ignore
    }
    this.media = new MediaEngine(this.signaling);
    this.media.setAudioPreferences(useSessionStore.getState().audioPreferences);
    this.media.setConferenceListen(useSessionStore.getState().conferenceListen);
    await this.prepareAudioForMedia();
    await this.media.start();
    await this.media.warmTalkProducer();
    const producers = await this.signaling.requestActiveProducers();
    this.replaceLiveProducers(producers);
    await this.media.syncProducers(producers, this.consumerContext());
    this.publishMediaSnapshot();
    await this.syncAudioSession(AppState.currentState);
    await this.syncSystemPtt();
    if (resumeTargets.length > 0) {
      await this.prepareAudioForTalk();
      this.talkingTargets = resumeTargets;
      await this.media.startTalking(resumeTargets, true);
      this.publishTalkState(true);
    }
    useSessionStore.setState({
      status: useSessionStore.getState().operatorReady ? 'ready' : useSessionStore.getState().status,
      statusMessage: resumeTargets.length > 0 ? useSessionStore.getState().statusMessage : 'Reconnected.',
    });
  }

  private async refreshTargets(): Promise<void> {
    const identity = useSessionStore.getState().identity;
    if (!identity || !this.api) {
      return;
    }
    const targets = await this.loadTargets(identity, useSessionStore.getState().productionId);
    useSessionStore.setState({ targets });
    this.refreshReplyTarget();
    this.refreshSelectedTalkTarget(targets);
  }

  private refreshSelectedTalkTarget(targets: TalkTarget[]): void {
    const selected = useSessionStore.getState().selectedTalkTarget;
    if (!selected) {
      if (useSessionStore.getState().talkSelectMode) {
        useSessionStore.setState({
          selectedTalkTarget: useSessionStore.getState().replyTarget ?? this.firstTalkableTarget(),
        });
      }
      return;
    }
    const next = targets.find((target) => talkTargetIdentity(target) === talkTargetIdentity(selected)) ?? null;
    useSessionStore.setState({ selectedTalkTarget: next });
  }

  private rememberLiveProducer(producer: ActiveProducer): void {
    this.liveProducers.set(producer.producerId, producer);
    this.publishActiveFeeds();
  }

  private forgetLiveProducer(producerId: string): void {
    this.liveProducers.delete(producerId);
    this.publishActiveFeeds();
  }

  private replaceLiveProducers(producers: ActiveProducer[]): void {
    this.liveProducers = new Map(producers.map((producer) => [producer.producerId, producer]));
    this.publishActiveFeeds();
  }

  private publishActiveFeeds(): void {
    useSessionStore.setState({
      activeFeedKeys: activeFeedKeysFromProducers([...this.liveProducers.values()]),
    });
    this.syncPresence();
  }

  private consumerContext() {
    const state = useSessionStore.getState();
    return { talkTargetKey: state.talkingTargetKey };
  }

  private beginConnect(serverAddress: string, username: string, rememberPassword: boolean): void {
    useSessionStore.setState({
      status: 'connecting',
      error: null,
      conflictName: undefined,
      pendingCertificate: null,
      statusMessage: 'Contacting server…',
      serverAddress,
      username,
      rememberPassword,
    });
    this.prepareHttp(serverAddress);
  }

  private async attachSessionCookie(serverAddress: string): Promise<void> {
    const parsed = parseServerAddress(serverAddress);
    const nativeCookies = await readNativeCookies(parsed.baseUrl);
    this.cookies = { ...this.cookies, ...nativeCookies };
    if (requiresBrowserSessionCookie(this.serverAppVersion) && !hasSessionCookie(this.cookies)) {
      throw new SessionCookieUnavailableError();
    }
  }

  private prepareHttp(serverAddress: string): void {
    const parsed = parseServerAddress(serverAddress);
    this.cookies = {};
    this.serverAppVersion = undefined;
    this.http = new TalkToMeHttp({
      baseUrl: parsed.baseUrl,
      getCookies: () => this.cookies,
      setCookies: (next) => {
        this.cookies = next;
      },
    });
    this.api = new ApiClient(this.http);
  }

  private async probeAndHealth(): Promise<void> {
    const state = useSessionStore.getState();
    const parsed = parseServerAddress(state.serverAddress);
    const hostname = new URL(parsed.baseUrl).hostname;
    try {
      const health = await this.requireApi().health();
      this.serverAppVersion = health.appVersion;
    } catch (error) {
      if (looksLikeTlsFailure(error)) {
        if (state.allowInsecureLocalTLS) {
          const probe = await probeServerCertificate(parsed.baseUrl);
          if (probe) {
            const known = storedPinForHost(probe.hostname);
            if (known && known.sha256 === probe.sha256.replace(/[^0-9a-fA-F]/g, '').toLowerCase()) {
              useSessionStore.setState({
                statusMessage: 'Health check failed; pinned certificate is already trusted. Trying login.',
              });
              return;
            }
            useSessionStore.setState({
              status: 'idle',
              pendingCertificate: probe,
              error: null,
              statusMessage: 'This certificate is not in the system trust store.',
            });
            throw new TlsUntrustedError(hostname, isLikelyLocalHost(hostname));
          }
        }
        throw new TlsUntrustedError(hostname, isLikelyLocalHost(hostname));
      }
      useSessionStore.setState({
        statusMessage: 'Health check failed; trying login anyway.',
      });
    }
  }

  private async finishIdentity(identity: OperatorIdentity, force: boolean): Promise<void> {
    const parsed = parseServerAddress(useSessionStore.getState().serverAddress);
    this.signaling?.disconnect();
    this.signaling = new SignalingClient(parsed.baseUrl, () => this.cookies);
    this.bindSignaling(this.signaling);

    useSessionStore.setState({ statusMessage: 'Connecting signaling…' });
    await this.signaling.connect();
    const register = await this.signaling.register(identity, force);

    if (isRegisterConflict(register)) {
      this.signaling.disconnect();
      this.signaling = null;
      useSessionStore.setState({
        status: 'idle',
        conflictName: register.existing?.name,
        statusMessage: '',
      });
      throw new SessionConflictError(register.existing);
    }
    if (!isRegisterOk(register)) {
      const message = 'error' in register ? register.error : 'register-user failed';
      if (typeof message === 'string' && /authenticated identity does not match/i.test(message)) {
        throw new SessionCookieUnavailableError();
      }
      throw new Error(message);
    }

    this.lastSocketId = this.signaling.socketId;
    const productions = Array.isArray(identity.productions) ? identity.productions : [];
    const rememberedProductionId = useSessionStore.getState().productionId;
    const rememberedProductionName = useSessionStore.getState().productionName;
    useSessionStore.setState({
      identity,
      productions,
      productionId: null,
      productionName: null,
      operatorReady: false,
      signalingLabel: 'connected',
    });

    if (productions.length > 0) {
      const remembered = productions.find((item) => item.id === rememberedProductionId);
      if (remembered) {
        await this.enterOperator(remembered);
        return;
      }
      if (rememberedProductionId == null && rememberedProductionName?.trim().toLowerCase() === 'default') {
        await this.enterOperator(null);
        return;
      }
      useSessionStore.setState({
        status: 'choose-production',
        statusMessage: 'Choose a production',
      });
      return;
    }

    await this.enterOperator(null);
  }

  private bindHardware(): void {
    if (this.hardwareBound) {
      return;
    }
    this.hardwareBound = true;
    subscribeForegroundService({
      onStopRequested: () => {
        void this.disconnect();
      },
      onTalkRequested: () => {
        void this.toggleCurrentTalk();
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
      void this.toggleCurrentTalk();
    });
    subscribeDisconnectShortcut(() => {
      void this.disconnect();
    });
    subscribeBleNative({
      onState: (state) => {
        this.publishBleState(state);
        void this.syncForegroundService();
      },
      onButton: (pressed) => {
        void this.handleBleButton(pressed);
      },
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
      void this.syncAudioSession(next);
    });
    subscribePttNative({
      onDiagnostic: (message) => {
        useSessionStore.setState({ statusMessage: message, pttDiagnostic: message });
      },
      onPushToken: (event) => {
        void this.registerPttToken(event.token, event.channelUUID);
      },
      onBeginTransmitting: () => {
        void this.pressReply();
      },
      onEndTransmitting: () => {
        void this.releaseTalk();
      },
      onAudioActivated: () => {
        void this.handlePttAudioActivated();
      },
      onServiceUpdate: () => {
        void this.refreshProducersFromPtt();
      },
      onJoined: () => {
        useSessionStore.setState({
          pttJoined: true,
          capabilityReason: this.capabilityReason({ pttJoined: true }),
        });
        void this.syncAudioSession();
      },
      onLeft: () => {
        useSessionStore.setState({
          pttJoined: false,
          capabilityReason: this.capabilityReason({ pttJoined: false }),
        });
        void this.syncAudioSession();
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

  private publishBleState(state: BleConnectionState): void {
    useSessionStore.setState({
      bleKind: state.kind,
      bleName: state.name ?? '',
      bleMessage: state.message ?? '',
    });
  }

  private async handleBleButton(pressed: boolean): Promise<void> {
    const action = this.blePolicy.handle(pressed, useSessionStore.getState().bleShortPressLocks);
    if (!action) {
      return;
    }
    const target = resolveBleTalkTarget({
      selection: bleSelectionFromState(useSessionStore.getState()),
      replyTarget: useSessionStore.getState().replyTarget,
      targets: useSessionStore.getState().targets,
    });
    if (!target) {
      useSessionStore.setState({
        error:
          bleSelectionFromState(useSessionStore.getState()).kind === 'reply'
            ? 'No one to reply to. Pick a Bluetooth Button target in Settings.'
            : 'Choose a Bluetooth Button target in Settings first.',
      });
      return;
    }
    if (action === 'startTalk') {
      await this.pressTalk(target);
      return;
    }
    if (action === 'lockTalk') {
      await this.lockTalk(target);
      return;
    }
    await this.releaseTalk(target);
  }

  private async handleWatchTalk(command: WatchRemoteCommand, pressed: boolean): Promise<void> {
    if (!pressed) {
      const target = this.resolveWatchTarget(command);
      if (target) {
        await this.releaseTalk(target);
      }
      return;
    }
    const target = this.resolveWatchTarget(command);
    if (!useSessionStore.getState().operatorReady || !target) {
      ackWatchTalk({ key: command.key, talking: false });
      return;
    }
    await this.pressTalk(target);
    const talking = this.talkingTargets.some((item) => talkTargetIdentity(item) === talkTargetIdentity(target));
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
      talkingLabels: this.talkingTargets.map((item) => item.label),
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

  private syncPresence(): void {
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
      talkingTargets: this.talkingTargets,
      incoming: state.incoming,
    });
  }

  private async syncForegroundService(): Promise<void> {
    const state = useSessionStore.getState();
    const notification = presenceNotification(this.currentPresence());
    if (!shouldStartForegroundService(Platform.OS, state.operatorReady)) {
      if (state.fgsRunning) {
        await stopForegroundService();
      }
      return;
    }
    await requestAndroidSessionPermissions();
    const includeConnectedDevice = state.bleKind === 'connected' || state.bleKind === 'connecting';
    const talking = this.currentPresence().talking || this.currentPresence().talkLocked;
    if (state.fgsRunning) {
      await updateForegroundService(includeConnectedDevice, notification.title, notification.text, talking);
      return;
    }
    const started = await startForegroundService(
      includeConnectedDevice,
      notification.title,
      notification.text,
      talking,
    );
    useSessionStore.setState({
      fgsRunning: started,
      fgsAvailable: started || foregroundServiceAvailable(),
      capabilityReason: this.capabilityReason({ fgsRunning: started }),
    });
  }

  private async syncAudioSession(appState: AppStateStatus = AppState.currentState): Promise<void> {
    const state = useSessionStore.getState();
    const pttEnabled = iosPttEnabled();
    const available = audioSessionAvailable();
    if (
      !shouldOwnAudioSession({
        platform: Platform.OS,
        pttEnabled,
        pttJoined: state.pttJoined,
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

  private async prepareAudioForMedia(): Promise<void> {
    if (
      !shouldPrepareAudioForMedia({
        platform: Platform.OS,
        pttEnabled: iosPttEnabled(),
        pttJoined: useSessionStore.getState().pttJoined,
      })
    ) {
      return;
    }
    const active = await activateForIntercom();
    if (active) {
      await setWebRTCAudioEnabled(true);
    }
    useSessionStore.setState({
      audioSessionAvailable: audioSessionAvailable(),
      audioSessionActive: active,
      capabilityReason: this.capabilityReason({
        audioSessionAvailable: audioSessionAvailable(),
        audioSessionActive: active,
      }),
    });
  }

  private async prepareAudioForTalk(): Promise<void> {
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

  private async teardownAudioSession(): Promise<void> {
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

  private async syncSystemPtt(): Promise<void> {
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
    if (!this.signaling) {
      return;
    }
    try {
      const bootstrap = parseApplePttBootstrap(await this.signaling.requestApplePttBootstrap());
      if (!bootstrap.enabled) {
        this.pttChannelUUID = null;
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
      const previousUUID = this.pttChannelUUID;
      this.pttChannelUUID = bootstrap.channel.channelUUID;
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
      await this.persistCurrentProfile();
      await this.flushPendingPttRegistration();
    } catch (error) {
      useSessionStore.setState({
        pttAvailable: pttNativeAvailable(),
        statusMessage: error instanceof Error ? error.message : String(error),
        capabilityReason: this.capabilityReason(),
      });
    }
  }

  private async leaveSystemPtt(): Promise<void> {
    const channelUUID = this.pttChannelUUID;
    this.pttChannelUUID = null;
    if (channelUUID && this.signaling) {
      try {
        await this.signaling.unregisterApplePttPushToken(channelUUID);
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
    if (!pending || !this.signaling) {
      return;
    }
    try {
      await this.signaling.registerApplePttPushToken(pending.channelUUID, pending.token);
      useSessionStore.setState({ statusMessage: 'System PTT push token registered.' });
    } catch (error) {
      useSessionStore.setState({
        statusMessage:
          error instanceof Error ? error.message : 'System PTT push token registration failed.',
      });
    }
  }

  private async handlePttAudioActivated(): Promise<void> {
    await prepareForSystemManagedIntercom();
    await setWebRTCAudioEnabled(true);
    await this.refreshProducersFromPtt();
  }

  private async refreshProducersFromPtt(): Promise<void> {
    if (!this.signaling || !this.media) {
      return;
    }
    try {
      const producers = await this.signaling.requestActiveProducers();
      this.replaceLiveProducers(producers);
      await this.media.syncProducers(producers, this.consumerContext());
      this.publishMediaSnapshot();
    } catch {
      // Keep the channel; media will retry on the next event.
    }
  }

  private capabilityReason(
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
      target: bleSelectionFromState(state),
    });
  }

  private requireApi(): ApiClient {
    if (!this.api) {
      throw new Error('Not signed in.');
    }
    return this.api;
  }
}

function bleSelectionFromState(state: SessionUiState): BleTargetSelection {
  if (state.bleTargetKind !== 'target' || !state.bleTargetType || state.bleTargetId === '') {
    return DEFAULT_BLE_TARGET;
  }
  return {
    kind: 'target',
    type: state.bleTargetType as TalkTarget['type'],
    id: state.bleTargetId,
    label: state.bleTargetLabel || state.bleTargetId,
  };
}

function bleFieldsFromSelection(
  selection: BleTargetSelection,
  shortPressLocks: boolean,
): Pick<
  SessionUiState,
  | 'bleShortPressLocks'
  | 'bleTargetKind'
  | 'bleTargetType'
  | 'bleTargetId'
  | 'bleTargetLabel'
> {
  if (selection.kind === 'reply') {
    return {
      bleShortPressLocks: shortPressLocks,
      bleTargetKind: 'reply',
      bleTargetType: '',
      bleTargetId: '',
      bleTargetLabel: '',
    };
  }
  return {
    bleShortPressLocks: shortPressLocks,
    bleTargetKind: 'target',
    bleTargetType: selection.type,
    bleTargetId: String(selection.id),
    bleTargetLabel: selection.label,
  };
}

function latestIncomingName(incoming: IncomingTalkState): string | null {
  const latest = incoming.addressedNow
    .slice()
    .sort((left, right) => (right.at ?? 0) - (left.at ?? 0))[0];
  const name = latest?.fromName?.trim();
  return name ? name : null;
}

function looksLikeTlsFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /ssl|tls|cert|trust|self.signed|handshake/i.test(message);
}

export const session = new SessionController();
