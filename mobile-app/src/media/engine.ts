import { Device } from 'mediasoup-client';
import type { Consumer, Producer, Transport } from 'mediasoup-client/types';
import { mediaDevices, MediaStream } from 'react-native-webrtc';

import type { SignalingClient } from '../signaling/client';
import {
  normalizeAudioPreference,
  playbackGain,
  type TargetAudioPreference,
} from '../protocol/audioPreference';
import type { ActiveProducer, IceServer, TalkTarget } from '../protocol/types';
import {
  applyConsumerBudget,
  MAX_RESUMED_CONSUMERS,
  producerTargetKey,
  type ConsumerPriorityContext,
} from './consumerBudget';
import { STANDARD_OPUS, TALK_GUM_CONSTRAINTS } from './opus';

type RemoteConsumer = {
  producer: ActiveProducer;
  consumer: Consumer;
  stream: MediaStream;
  resumed: boolean;
};

export class MediaEngine {
  private device: Device | null = null;
  private sendTransport: Transport | null = null;
  private recvTransport: Transport | null = null;
  private localStream: MediaStream | null = null;
  private talkProducer: Producer | null = null;
  private remotes = new Map<string, RemoteConsumer>();
  private iceOverride: IceServer[] = [];
  private audioPreferences: Record<string, TargetAudioPreference> = {};
  private stoppedFeedKeys = new Set<string>();
  overBudget = false;

  constructor(private readonly signaling: SignalingClient) {}

  setIceOverride(servers: IceServer[]): void {
    this.iceOverride = servers;
  }

  async start(): Promise<void> {
    await this.stop();

    const rtpCapabilities = await this.signaling.getRouterRtpCapabilities();
    const device = new Device();
    await device.load({ routerRtpCapabilities: rtpCapabilities as never });
    this.device = device;

    const sendOptions = await this.signaling.createSendTransport();
    const recvOptions = await this.signaling.createRecvTransport();

    this.sendTransport = device.createSendTransport({
      id: sendOptions.id,
      iceParameters: sendOptions.iceParameters as never,
      iceCandidates: sendOptions.iceCandidates as never,
      dtlsParameters: sendOptions.dtlsParameters as never,
      iceServers: [...sendOptions.iceServers, ...this.iceOverride],
      iceTransportPolicy: sendOptions.iceTransportPolicy,
    });
    this.recvTransport = device.createRecvTransport({
      id: recvOptions.id,
      iceParameters: recvOptions.iceParameters as never,
      iceCandidates: recvOptions.iceCandidates as never,
      dtlsParameters: recvOptions.dtlsParameters as never,
      iceServers: [...recvOptions.iceServers, ...this.iceOverride],
      iceTransportPolicy: recvOptions.iceTransportPolicy,
    });

    this.sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
      this.signaling.connectSendTransport(dtlsParameters).then(() => callback()).catch(errback);
    });
    this.recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
      this.signaling.connectRecvTransport(dtlsParameters).then(() => callback()).catch(errback);
    });
    this.sendTransport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
      this.signaling
        .produce(kind, rtpParameters, appData)
        .then((id) => callback({ id }))
        .catch(errback);
    });
  }

  async warmTalkProducer(): Promise<void> {
    if (this.talkProducer && !this.talkProducer.closed) {
      return;
    }
    if (!this.sendTransport) {
      throw new Error('Send transport is not ready.');
    }

    const stream = (await mediaDevices.getUserMedia(TALK_GUM_CONSTRAINTS as never)) as MediaStream;
    this.localStream = stream;
    const track = stream.getAudioTracks()[0];
    if (!track) {
      throw new Error('Microphone did not return an audio track.');
    }

    const producer = await this.sendTransport.produce({
      track: track as never,
      ...STANDARD_OPUS,
      appData: { type: 'talk' },
    });
    this.talkProducer = producer;
    producer.pause();
    await this.signaling.pauseProducer(producer.id);
  }

  async startTalking(targets: TalkTarget[], lockActive = false): Promise<void> {
    await this.warmTalkProducer();
    const producer = this.talkProducer;
    if (!producer) {
      throw new Error('Talk producer is not ready.');
    }

    const alreadyLive = !producer.paused;
    if (!alreadyLive) {
      this.signaling.emitTalkTargetsUpdated('talk-targets-starting', targets);
      producer.resume();
      await this.signaling.resumeProducer(producer.id);
      this.signaling.emitTalkTargetsUpdated('talk-targets-started', targets);
    } else {
      this.signaling.emitTalkTargetsUpdated('talk-targets-updated', targets);
    }
    this.signaling.emitPttState({
      talking: true,
      lockActive,
      target: targets[0] ?? null,
      targets,
      reason: alreadyLive ? 'talk-targets-updated' : 'talk-started',
    });
  }

  syncTalkTargets(targets: TalkTarget[], lockActive: boolean): void {
    this.signaling.emitTalkTargetsUpdated('talk-targets-updated', targets);
    this.signaling.emitPttState({
      talking: targets.length > 0,
      lockActive,
      target: targets[0] ?? null,
      targets,
      reason: 'talk-targets-updated',
    });
  }

  async stopTalking(): Promise<void> {
    const producer = this.talkProducer;
    this.signaling.emitTalkTargetsUpdated('talk-targets-cleared', []);
    if (producer && !producer.closed) {
      producer.pause();
      try {
        await this.signaling.pauseProducer(producer.id);
      } catch {
        // Socket may already be gone.
      }
    }
    this.signaling.emitPttState({
      talking: false,
      lockActive: false,
      target: null,
      targets: [],
      reason: 'talk-stopped',
    });
  }

  async consumeProducer(producer: ActiveProducer, ctx: ConsumerPriorityContext = {}): Promise<void> {
    if (!this.device || !this.recvTransport) {
      throw new Error('Receive transport is not ready.');
    }
    if (this.remotes.has(producer.producerId)) {
      return;
    }
    if (producer.peerId === this.signaling.socketId) {
      return;
    }

    const params = await this.signaling.consume(producer.producerId, this.device.rtpCapabilities);
    const consumer = await this.recvTransport.consume({
      id: params.id,
      producerId: params.producerId,
      kind: params.kind as 'audio' | 'video',
      rtpParameters: params.rtpParameters as never,
    });

    const stream = new MediaStream();
    stream.addTrack(consumer.track as never);
    this.remotes.set(producer.producerId, { producer, consumer, stream, resumed: false });
    this.applyTrackGain(producer);
    await this.applyBudget(ctx);
  }

  async dropProducer(producerId: string): Promise<void> {
    const remote = this.remotes.get(producerId);
    if (!remote) {
      return;
    }
    this.remotes.delete(producerId);
    try {
      remote.consumer.close();
    } catch {
      // already closed
    }
    try {
      await this.signaling.closeConsumer(remote.consumer.id);
    } catch {
      // socket may already have closed it
    }
  }

  async syncProducers(producers: ActiveProducer[], ctx: ConsumerPriorityContext = {}): Promise<void> {
    const wanted = new Set(producers.map((item) => item.producerId));
    for (const producerId of [...this.remotes.keys()]) {
      if (!wanted.has(producerId)) {
        await this.dropProducer(producerId);
      }
    }
    for (const producer of producers) {
      await this.consumeProducer(producer, ctx);
    }
    await this.applyBudget(ctx);
  }

  get activeRemoteCount(): number {
    return [...this.remotes.values()].filter((item) => item.resumed).length;
  }

  get speakingTargetKeys(): string[] {
    const keys = new Set<string>();
    for (const remote of this.remotes.values()) {
      if (remote.resumed) {
        keys.add(producerTargetKey(remote.producer));
      }
    }
    return [...keys];
  }

  setAudioPreferences(preferences: Record<string, TargetAudioPreference>): void {
    this.audioPreferences = preferences;
    for (const remote of this.remotes.values()) {
      this.applyTrackGain(remote.producer);
    }
  }

  async setStoppedFeedKeys(keys: string[], ctx: ConsumerPriorityContext = {}): Promise<void> {
    this.stoppedFeedKeys = new Set(keys);
    await this.applyBudget(ctx);
  }

  async stop(): Promise<void> {
    for (const producerId of [...this.remotes.keys()]) {
      await this.dropProducer(producerId);
    }
    if (this.talkProducer) {
      try {
        this.talkProducer.close();
      } catch {
        // ignore
      }
      this.talkProducer = null;
    }
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.localStream = null;
    try {
      this.sendTransport?.close();
    } catch {
      // ignore
    }
    try {
      this.recvTransport?.close();
    } catch {
      // ignore
    }
    this.sendTransport = null;
    this.recvTransport = null;
    this.device = null;
    this.overBudget = false;
  }

  private applyTrackGain(producer: ActiveProducer): void {
    const remote = this.remotes.get(producer.producerId);
    const track = remote?.stream.getAudioTracks()[0] as { _setVolume?: (volume: number) => void } | undefined;
    const preference = normalizeAudioPreference(this.audioPreferences[producerTargetKey(producer)]);
    track?._setVolume?.(playbackGain(preference));
  }

  private async applyBudget(ctx: ConsumerPriorityContext): Promise<void> {
    const decision = applyConsumerBudget(
      [...this.remotes.values()].map((item) => item.producer),
      ctx,
      MAX_RESUMED_CONSUMERS,
    );
    this.overBudget = decision.overBudget;

    const resumeIds = new Set(
      decision.resume
        .filter((item) => !this.stoppedFeedKeys.has(producerTargetKey(item)))
        .map((item) => item.producerId),
    );
    for (const [producerId, remote] of this.remotes) {
      if (resumeIds.has(producerId)) {
        if (!remote.resumed) {
          remote.consumer.resume();
          await this.signaling.resumeConsumer(remote.consumer.id);
          remote.resumed = true;
        }
      } else if (remote.resumed) {
        remote.consumer.pause();
        remote.resumed = false;
      }
    }
  }
}
