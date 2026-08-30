import { AppState, Platform } from 'react-native';

import { MediaEngine } from '../media/engine';
import { talkOpusProfile } from '../media/opus';
import {
  activeFeedKeysFromProducers,
  defaultAudioPreference,
  normalizeAudioPreference,
  talkTargetIdentity,
  type ActiveProducer,
  type OperatorIdentity,
  type Production,
  type TargetAudioPreference,
  type TalkTarget,
} from '../protocol';
import {
  activateForIntercom,
  audioSessionAvailable,
  prepareForSystemManagedIntercom,
  setWebRTCAudioEnabled,
} from '../audio/session';
import {
  iosPttEnabled,
  shouldPrepareAudioForMedia,
  shouldPrepareSystemManagedAudioForMedia,
} from '../audio/policy';
import { readAudioRouteSnapshot, selectAudioRoute, type AudioRouteSnapshot } from '../audio/routes';
import { shouldWaitForPendingSystemPttJoin } from '../ptt/joinGate';
import { saveAudioPreferences } from './audioPrefs';
import {
  resolveOperatorAudio,
  saveOperatorAudioOverrides,
  type OperatorAudioSettings,
} from './operatorAudio';
import { HOLD_HINT, useSessionStore } from './state';
import type { SessionController } from './sessionController';

/** Operator media lifecycle: MediaEngine, consumers, audio prep, devices, and preferences. */
export class MediaCoordinator {
  constructor(private readonly c: SessionController) {}

  async enterOperator(production: Production | null): Promise<void> {
    const identity = useSessionStore.getState().identity;
    const signaling = this.c.signaling;
    if (!identity || !this.c.api || !signaling) {
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

    if (!this.c.media) {
      this.c.media = new MediaEngine(signaling);
      this.c.media.setTalkOpusProfile(talkOpusProfile(this.c.serverClientDefaults.audioProfile));
      this.c.media.setAudioPreferences(useSessionStore.getState().audioPreferences);
      this.c.media.setConferenceListen(useSessionStore.getState().conferenceListen);
      this.c.media.setOperatorAudio(useSessionStore.getState().operatorAudio);
      this.syncFeedDucking();
      useSessionStore.setState({ statusMessage: 'Starting media…' });
      await this.prepareAudioForMedia();
      await this.selectSavedAudioRoute();
      await this.c.media.start();
      try {
        await this.c.media.warmTalkProducer();
      } catch (error) {
        useSessionStore.setState({
          statusMessage: `Microphone not ready: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
      this.publishCaptureDebug();
    } else {
      this.c.media.setAudioPreferences(useSessionStore.getState().audioPreferences);
      this.c.media.setConferenceListen(useSessionStore.getState().conferenceListen);
      this.c.media.setOperatorAudio(useSessionStore.getState().operatorAudio);
      this.syncFeedDucking();
    }

    const producers = await signaling.requestActiveProducers();
    this.replaceLiveProducers(producers);
    await this.c.media.syncProducers(producers, this.consumerContext());
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
    this.c.talk.refreshReplyTarget();
    this.c.talk.refreshSelectedTalkTarget(targets);
    await this.c.background.syncAudioSession(AppState.currentState);
    await this.c.background.syncForegroundService();
    await this.c.background.syncSystemPtt();
    await this.c.persistCurrentProfile();
    this.c.background.syncPresence();
  }

  async rebuildMediaAfterReconnect(): Promise<void> {
    const signaling = this.c.signaling;
    if (!signaling) {
      return;
    }
    this.c.lastSocketId = signaling.socketId;
    const locked = useSessionStore.getState().talkLocked;
    const resumeTargets = locked ? this.c.lockedTargets : [];
    try {
      await this.c.media?.stop();
    } catch {
      // ignore
    }
    this.c.media = new MediaEngine(signaling);
    this.c.media.setTalkOpusProfile(talkOpusProfile(this.c.serverClientDefaults.audioProfile));
    this.c.media.setAudioPreferences(useSessionStore.getState().audioPreferences);
    this.c.media.setConferenceListen(useSessionStore.getState().conferenceListen);
    this.c.media.setOperatorAudio(useSessionStore.getState().operatorAudio);
    await this.prepareAudioForMedia();
    await this.c.media.start();
    await this.c.media.warmTalkProducer();
    const producers = await signaling.requestActiveProducers();
    this.replaceLiveProducers(producers);
    await this.c.media.syncProducers(producers, this.consumerContext());
    this.publishMediaSnapshot();
    await this.c.background.syncAudioSession(AppState.currentState);
    await this.c.background.syncForegroundService();
    await this.c.background.syncSystemPtt();
    if (resumeTargets.length > 0) {
      await this.c.background.prepareAudioForTalk();
      this.c.talkingTargets = resumeTargets;
      await this.c.media.startTalking(resumeTargets, true);
      this.c.talk.publishTalkState(true);
    }
    useSessionStore.setState({
      status: useSessionStore.getState().operatorReady ? 'ready' : useSessionStore.getState().status,
      statusMessage: resumeTargets.length > 0 ? useSessionStore.getState().statusMessage : 'Reconnected.',
    });
  }

  async refreshTargets(): Promise<void> {
    const identity = useSessionStore.getState().identity;
    if (!identity || !this.c.api) {
      return;
    }
    const targets = await this.loadTargets(identity, useSessionStore.getState().productionId);
    useSessionStore.setState({ targets });
    this.c.talk.refreshReplyTarget();
    this.c.talk.refreshSelectedTalkTarget(targets);
  }

  private async loadTargets(identity: OperatorIdentity, productionId: number | null): Promise<TalkTarget[]> {
    if (identity.kind === 'guest') {
      return this.c.requireApi().fetchGuestTargets(productionId);
    }
    return this.c.requireApi().fetchTargets(Number(identity.id), productionId);
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
    this.c.background.syncPresence();
    void this.c.media?.setStoppedFeedKeys(stoppedFeedKeys, this.consumerContext()).then(() => {
      this.publishMediaSnapshot();
    });
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
    this.c.media?.setAudioPreferences(next);
    void saveAudioPreferences(next);
  }

  setOperatorAudio(patch: Partial<OperatorAudioSettings>): void {
    // Every key the user touches becomes an explicit choice that outlives
    // server-configured defaults, matching the web client's precedence.
    this.c.operatorAudioOverrides = { ...this.c.operatorAudioOverrides, ...patch };
    const operatorAudio = resolveOperatorAudio(this.c.operatorAudioOverrides, this.c.serverClientDefaults);
    useSessionStore.setState({ operatorAudio });
    this.c.media?.setOperatorAudio(operatorAudio);
    this.syncFeedDucking();
    void saveOperatorAudioOverrides(this.c.operatorAudioOverrides);
    if (
      patch.echoCancellation != null ||
      patch.noiseSuppression != null ||
      patch.autoGainControl != null
    ) {
      void this.c.media?.applyCaptureSettings(operatorAudio).then(() => this.publishCaptureDebug());
    }
  }

  async selectAudioDevice(id: string): Promise<void> {
    this.setOperatorAudio({ audioRouteId: id });
    this.publishAudioDevices(await selectAudioRoute(id));
  }

  refreshAudioDevices(): void {
    this.publishAudioDevices();
    this.publishCaptureDebug();
  }

  syncFeedDucking(): void {
    const state = useSessionStore.getState();
    this.c.media?.setDuckingActive({
      talking: state.talking,
      incomingAddressed: state.incoming.addressedNow.length > 0,
    });
  }

  audioDeviceFields(snapshot = readAudioRouteSnapshot()) {
    return {
      audioRoutes: snapshot.routes,
      audioInputLabel: snapshot.inputLabel,
      audioOutputLabel: snapshot.outputLabel,
      audioVoiceProcessing: snapshot.voiceProcessing,
    };
  }

  publishAudioDevices(snapshot?: AudioRouteSnapshot): void {
    useSessionStore.setState(this.audioDeviceFields(snapshot));
  }

  private async selectSavedAudioRoute(): Promise<void> {
    const id = useSessionStore.getState().operatorAudio.audioRouteId;
    if (!id) {
      this.publishAudioDevices();
      return;
    }
    this.publishAudioDevices(await selectAudioRoute(id));
  }

  private publishCaptureDebug(): void {
    const capture = this.c.media?.captureDebug();
    useSessionStore.setState({
      captureMicLabel: capture?.label ?? 'Microphone',
      captureEchoCancellation: capture?.echoCancellation ?? null,
      captureNoiseSuppression: capture?.noiseSuppression ?? null,
      captureAutoGainControl: capture?.autoGainControl ?? null,
    });
  }

  publishMediaSnapshot(): void {
    useSessionStore.setState({
      overBudget: this.c.media?.overBudget ?? false,
      activeRemoteCount: this.c.media?.activeRemoteCount ?? 0,
      speakingTargetKeys: this.c.media?.speakingTargetKeys ?? [],
      mediaDebug: this.c.media?.mediaDebugLine() ?? '',
    });
  }

  rememberLiveProducer(producer: ActiveProducer): void {
    this.c.liveProducers.set(producer.producerId, producer);
    this.publishActiveFeeds();
  }

  forgetLiveProducer(producerId: string): void {
    this.c.liveProducers.delete(producerId);
    this.publishActiveFeeds();
  }

  replaceLiveProducers(producers: ActiveProducer[]): void {
    this.c.liveProducers = new Map(producers.map((producer) => [producer.producerId, producer]));
    this.publishActiveFeeds();
  }

  private publishActiveFeeds(): void {
    useSessionStore.setState({
      activeFeedKeys: activeFeedKeysFromProducers([...this.c.liveProducers.values()]),
    });
    this.c.background.syncPresence();
  }

  consumerContext() {
    const state = useSessionStore.getState();
    return {
      talkTargetKey: state.talkingTargetKey,
      lockedTargetKey: state.lockedTargetKeys[0] ?? null,
    };
  }

  async refreshProducersFromPtt(): Promise<void> {
    const signaling = this.c.signaling;
    const media = this.c.media;
    if (!signaling || !media) {
      return;
    }
    try {
      const producers = await signaling.requestActiveProducers();
      this.replaceLiveProducers(producers);
      await media.syncProducers(producers, this.consumerContext());
      this.publishMediaSnapshot();
    } catch {
      // Keep the channel; media will retry on the next event.
    }
  }

  private async prepareAudioForMedia(): Promise<void> {
    await this.waitForPendingSystemPttJoin();
    const pttEnabled = iosPttEnabled();
    const pttJoined = useSessionStore.getState().pttJoined;
    if (
      shouldPrepareSystemManagedAudioForMedia({
        platform: Platform.OS,
        pttEnabled,
        pttJoined,
      })
    ) {
      await prepareForSystemManagedIntercom();
      await setWebRTCAudioEnabled(true);
      useSessionStore.setState({
        audioSessionAvailable: audioSessionAvailable(),
        audioSessionActive: false,
        capabilityReason: this.c.background.capabilityReason({
          audioSessionAvailable: audioSessionAvailable(),
          audioSessionActive: false,
        }),
      });
      return;
    }
    if (
      !shouldPrepareAudioForMedia({
        platform: Platform.OS,
        pttEnabled,
        pttJoined,
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
      capabilityReason: this.c.background.capabilityReason({
        audioSessionAvailable: audioSessionAvailable(),
        audioSessionActive: active,
      }),
    });
  }

  private async waitForPendingSystemPttJoin(): Promise<void> {
    if (
      !shouldWaitForPendingSystemPttJoin({
        platform: Platform.OS,
        pttEnabled: iosPttEnabled(),
        joinInFlight: this.c.pttJoin.pending,
        pttJoined: useSessionStore.getState().pttJoined,
      })
    ) {
      return;
    }
    useSessionStore.setState({ statusMessage: 'Waiting for system PTT join…' });
    await this.c.pttJoin.wait();
  }
}
