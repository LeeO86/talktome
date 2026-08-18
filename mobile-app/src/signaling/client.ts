// Derived from talktome-apple SocketIOSignalingClient @ 004d6e76 by Daniel Jocher.
// Uses socket.io-client. RN WebSocket extraHeaders are unreliable, so the handshake
// starts on HTTP polling (browser parity) with an explicit Cookie header.

import { io, type Socket } from 'socket.io-client';

import { cookieHeader, type CookieMap } from '../auth/cookieJar';
import { parseIncomingTalkState } from '../protocol/incomingTalk';
import { SocketEvent } from '../protocol/events';
import { parseActiveProducer, parseActiveProducers } from '../protocol/producers';
import { normalizeTalkTargets } from '../protocol/talkTargets';
import type {
  ActiveProducer,
  IncomingTalkState,
  IceServer,
  IceTransportPolicy,
  OperatorIdentity,
  PeerSession,
  RegisterUserConflict,
  RegisterUserResponse,
  SessionKickInfo,
  SignalingTalkTarget,
  TalkTarget,
  WebRTCTransportOptions,
} from '../protocol/types';

export type SignalingHandlers = {
  onStateChange?: (state: SignalingConnectionState) => void;
  onReconnect?: (socketId?: string) => void;
  onUserList?: (peers: PeerSession[]) => void;
  onSessionKicked?: (info: SessionKickInfo) => void;
  onTargetsUpdated?: () => void;
  onConferenceMembersUpdated?: (conferenceId?: number | null) => void;
  onIncomingTalkState?: (state: IncomingTalkState) => void;
  onProducerStarted?: (producer: ActiveProducer) => void;
  onProducerClosed?: (producer: ActiveProducer) => void;
};

export type SignalingConnectionState =
  | { status: 'disconnected' }
  | { status: 'connecting' }
  | { status: 'connected'; socketId?: string }
  | { status: 'failed'; message: string };

const ACK_TIMEOUT_MS = 8000;

export function cookieExtraHeaders(cookies: CookieMap): Record<string, string> {
  const cookie = cookieHeader(cookies);
  return cookie ? { Cookie: cookie } : {};
}

export function signalingSocketOptions(cookies: CookieMap) {
  const extraHeaders = cookieExtraHeaders(cookies);
  return {
    path: '/socket.io/',
    // Polling-only: RN WebSocket extraHeaders are unreliable, and SameSite=Lax
    // cookies are not auto-attached from a native app. Cookie goes on HTTP polling.
    transports: ['polling'] as ['polling'],
    upgrade: false,
    withCredentials: false,
    autoConnect: false,
    forceNew: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
    extraHeaders,
    transportOptions: {
      polling: { extraHeaders },
    },
    auth: undefined as undefined,
  };
}

export function registerUserPayload(identity: OperatorIdentity, force = false) {
  return {
    id: String(identity.kind === 'guest' ? (identity.guestId ?? identity.id) : identity.id),
    name: identity.name,
    kind: identity.kind,
    guestProfileUserId: identity.guestProfileUserId ?? null,
    force,
  };
}

export class SignalingClient {
  private socket: Socket | null = null;
  private hasEverConnected = false;
  private awaitingInitialConnect = false;
  handlers: SignalingHandlers = {};

  constructor(
    private readonly baseUrl: string,
    private readonly getCookies: () => CookieMap,
  ) {}

  get socketId(): string | undefined {
    return this.socket?.id;
  }

  async connect(): Promise<string> {
    this.disconnect();
    this.awaitingInitialConnect = true;
    this.handlers.onStateChange?.({ status: 'connecting' });

    const socket = io(this.baseUrl, signalingSocketOptions(this.getCookies()));
    this.socket = socket;
    this.bindPersistentHandlers(socket);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        this.awaitingInitialConnect = false;
        this.handlers.onStateChange?.({ status: 'failed', message: 'timeout' });
        reject(new Error('The Socket.IO connection timed out.'));
      }, 10_000);

      const onConnect = () => {
        cleanup();
        this.awaitingInitialConnect = false;
        this.hasEverConnected = true;
        this.handlers.onStateChange?.({ status: 'connected', socketId: socket.id });
        resolve(socket.id ?? '');
      };

      const onError = (error: Error) => {
        cleanup();
        this.awaitingInitialConnect = false;
        this.handlers.onStateChange?.({ status: 'failed', message: error.message });
        reject(new Error(`Socket.IO connection failed: ${error.message}`));
      };

      const cleanup = () => {
        clearTimeout(timeout);
        socket.off('connect', onConnect);
        socket.off('connect_error', onError);
      };

      socket.on('connect', onConnect);
      socket.on('connect_error', onError);
      socket.connect();
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.awaitingInitialConnect = false;
    this.handlers.onStateChange?.({ status: 'disconnected' });
  }

  async register(identity: OperatorIdentity, force = false): Promise<RegisterUserResponse> {
    return this.emitAck<RegisterUserResponse>(
      SocketEvent.registerUser,
      registerUserPayload(identity, force),
    );
  }

  async requestApplePttBootstrap(): Promise<unknown> {
    return this.emitAck(SocketEvent.requestApplePttBootstrap);
  }

  async registerApplePttPushToken(channelUUID: string, pushToken: string): Promise<void> {
    await this.emitAck(SocketEvent.registerApplePttPushToken, { channelUUID, pushToken });
  }

  async unregisterApplePttPushToken(channelUUID: string): Promise<void> {
    await this.emitAck(SocketEvent.unregisterApplePttPushToken, { channelUUID });
  }

  async requestActiveProducers(): Promise<ActiveProducer[]> {
    const payload = await this.emitAck<unknown>(SocketEvent.requestActiveProducers);
    return parseActiveProducers(payload);
  }

  async getRouterRtpCapabilities(): Promise<unknown> {
    return this.emitAck(SocketEvent.getRouterRtpCapabilities);
  }

  async createSendTransport(): Promise<WebRTCTransportOptions> {
    return parseTransportOptions(await this.emitAck<Record<string, unknown>>(SocketEvent.createSendTransport, null));
  }

  async createRecvTransport(): Promise<WebRTCTransportOptions> {
    return parseTransportOptions(await this.emitAck<Record<string, unknown>>(SocketEvent.createRecvTransport, null));
  }

  async connectSendTransport(dtlsParameters: unknown): Promise<void> {
    await this.emitAck(SocketEvent.connectSendTransport, { dtlsParameters });
  }

  async connectRecvTransport(dtlsParameters: unknown): Promise<void> {
    await this.emitAck(SocketEvent.connectRecvTransport, { dtlsParameters });
  }

  async produce(kind: string, rtpParameters: unknown, appData: unknown): Promise<string> {
    const response = await this.emitAck<{ id?: string; error?: string }>(SocketEvent.produce, {
      kind,
      rtpParameters,
      appData,
    });
    if (!response?.id) {
      throw new Error(response?.error || 'produce failed');
    }
    return response.id;
  }

  async pauseProducer(producerId: string): Promise<void> {
    await this.emitAck(SocketEvent.pauseProducer, { producerId });
  }

  async resumeProducer(producerId: string): Promise<void> {
    await this.emitAck(SocketEvent.resumeProducer, { producerId });
  }

  async closeProducer(producerId: string): Promise<void> {
    await this.emitAck(SocketEvent.producerClose, { producerId });
  }

  async consume(producerId: string, rtpCapabilities: unknown): Promise<{
    id: string;
    producerId: string;
    kind: string;
    rtpParameters: unknown;
  }> {
    const response = await this.emitAck<{
      id?: string;
      producerId?: string;
      kind?: string;
      rtpParameters?: unknown;
      error?: string;
    }>(SocketEvent.consume, { producerId, rtpCapabilities });
    if (!response?.id || !response.producerId || !response.kind || !response.rtpParameters) {
      throw new Error(response?.error || 'consume failed');
    }
    return {
      id: response.id,
      producerId: response.producerId,
      kind: response.kind,
      rtpParameters: response.rtpParameters,
    };
  }

  async resumeConsumer(consumerId: string): Promise<void> {
    await this.emitAck(SocketEvent.resumeConsumer, { consumerId });
  }

  async closeConsumer(consumerId: string): Promise<void> {
    await this.emitAck(SocketEvent.closeConsumer, { consumerId });
  }

  emitTalkTargetsUpdated(reason: string, targets: TalkTarget[]): void {
    const normalized = normalizeTalkTargets(targets);
    this.socket?.emit(SocketEvent.talkTargetsUpdated, { reason, targets: normalized });
  }

  emitPttState(input: {
    talking: boolean;
    lockActive: boolean;
    target: TalkTarget | null;
    targets: TalkTarget[];
    reason?: string;
  }): void {
    const targets = normalizeTalkTargets(input.targets);
    const target: SignalingTalkTarget | undefined = input.target
      ? normalizeTalkTargets([input.target])[0]
      : targets[0];
    this.socket?.emit(SocketEvent.pttState, {
      talking: input.talking,
      lockActive: input.lockActive,
      target: target ?? null,
      targets,
      reason: input.reason,
    });
  }

  async logout(): Promise<void> {
    try {
      await this.emitAck(SocketEvent.userLogout);
    } catch {
      // Server may already have dropped the socket.
    }
  }

  private bindPersistentHandlers(socket: Socket): void {
    socket.on('connect', () => {
      const shouldReconnect = this.hasEverConnected && !this.awaitingInitialConnect;
      this.handlers.onStateChange?.({ status: 'connected', socketId: socket.id });
      if (shouldReconnect) {
        this.handlers.onReconnect?.(socket.id);
      }
    });

    socket.on('disconnect', (reason) => {
      this.handlers.onStateChange?.({ status: 'disconnected' });
      if (reason && reason !== 'io client disconnect') {
        this.handlers.onStateChange?.({ status: 'failed', message: String(reason) });
      }
    });

    socket.on(SocketEvent.userList, (payload) => {
      this.handlers.onUserList?.(parsePeerSessions(payload));
    });
    socket.on(SocketEvent.userTargetsUpdated, () => {
      this.handlers.onTargetsUpdated?.();
    });
    socket.on(SocketEvent.conferenceMembersUpdated, (payload) => {
      const record = payload && typeof payload === 'object' ? (payload as { conferenceId?: unknown }) : {};
      const conferenceId = Number(record.conferenceId);
      this.handlers.onConferenceMembersUpdated?.(Number.isFinite(conferenceId) ? conferenceId : null);
    });
    socket.on(SocketEvent.incomingTalkState, (payload) => {
      const state = parseIncomingTalkState(payload);
      if (state) {
        this.handlers.onIncomingTalkState?.(state);
      }
    });
    socket.on(SocketEvent.newProducer, (payload) => {
      const producer = parseActiveProducer(payload);
      if (producer) {
        this.handlers.onProducerStarted?.(producer);
      }
    });
    socket.on(SocketEvent.producerClosed, (payload) => {
      const producer = parseActiveProducer(payload);
      if (producer) {
        this.handlers.onProducerClosed?.(producer);
      }
    });
    socket.on(SocketEvent.sessionKicked, (payload) => {
      const record = payload && typeof payload === 'object' ? (payload as SessionKickInfo) : {};
      this.handlers.onSessionKicked?.(record);
    });
  }

  private emitAck<T>(event: string, payload?: unknown): Promise<T> {
    const socket = this.socket;
    if (!socket?.connected) {
      return Promise.reject(new Error('Socket.IO is not connected yet.'));
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${event} timed out.`));
      }, ACK_TIMEOUT_MS);

      const ack = (response: T) => {
        clearTimeout(timer);
        if (response && typeof response === 'object' && 'error' in response && (response as { error?: string }).error) {
          reject(new Error(String((response as { error?: string }).error)));
          return;
        }
        resolve(response);
      };

      if (payload === undefined) {
        socket.emit(event, ack);
      } else {
        socket.emit(event, payload, ack);
      }
    });
  }
}

export function parseTransportOptions(payload: Record<string, unknown> | null | undefined): WebRTCTransportOptions {
  if (!payload || typeof payload.id !== 'string') {
    throw new Error('Transport response is missing an id.');
  }

  const iceServers = Array.isArray(payload.iceServers) ? (payload.iceServers as IceServer[]) : [];
  const policy = payload.iceTransportPolicy;
  const iceTransportPolicy: IceTransportPolicy | undefined =
    policy === 'relay' || policy === 'all' ? policy : undefined;

  return {
    id: payload.id,
    iceParameters: payload.iceParameters,
    iceCandidates: Array.isArray(payload.iceCandidates) ? payload.iceCandidates : [],
    dtlsParameters: payload.dtlsParameters,
    iceServers,
    iceTransportPolicy,
  };
}

function parsePeerSessions(payload: unknown): PeerSession[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }
    const row = item as Record<string, unknown>;
    if (typeof row.socketId !== 'string') {
      return [];
    }
    const kind = row.kind === 'user' || row.kind === 'feed' || row.kind === 'guest' ? row.kind : 'guest';
    return [
      {
        socketId: row.socketId,
        userId: typeof row.userId === 'number' ? row.userId : undefined,
        feedId: typeof row.feedId === 'number' ? row.feedId : undefined,
        kind,
        name: typeof row.name === 'string' ? row.name : undefined,
      },
    ];
  });
}

export function isRegisterConflict(response: RegisterUserResponse): response is {
  conflict: true;
  existing?: RegisterUserConflict;
} {
  return 'conflict' in response && response.conflict === true;
}

export function isRegisterOk(response: RegisterUserResponse): response is { ok: true } {
  return 'ok' in response && response.ok === true;
}
