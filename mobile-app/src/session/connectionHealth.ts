// Ported from talktome public/client.js renderMediaConnectionStatus by Daniel Jocher.

export type SignalingHealth = 'connected' | 'connecting' | 'failed' | 'disconnected';

export type ConnectionHealthKind = 'idle' | 'connecting' | 'connected' | 'warning' | 'failed';

export type ConnectionHealth = {
  kind: ConnectionHealthKind;
  /** Web-parity sentence for accessibility and the session sheet. */
  label: string;
  /** Compact header chip. "OK" is the healthy confirmation. */
  shortLabel: string;
};

export type MediaConnectionSnapshot = {
  send: string;
  receive: string;
  sendIce: string;
  receiveIce: string;
  iceError: string | null;
  mediaReady: boolean;
};

export const IDLE_MEDIA_CONNECTION: MediaConnectionSnapshot = {
  send: 'idle',
  receive: 'idle',
  sendIce: 'idle',
  receiveIce: 'idle',
  iceError: null,
  mediaReady: false,
};

export function describeIceCandidateError(event: {
  errorCode?: number;
  errorText?: string;
  url?: string;
} | null | undefined): string | null {
  if (!event) {
    return null;
  }
  const parts: string[] = [];
  if (event.errorCode) {
    parts.push(`ICE ${event.errorCode}`);
  }
  if (event.errorText) {
    parts.push(String(event.errorText));
  }
  if (event.url) {
    parts.push(String(event.url));
  }
  return parts.length ? parts.join(' · ') : 'ICE candidate negotiation failed';
}

export function connectionHealth(input: {
  signaling: SignalingHealth;
  send?: string;
  receive?: string;
  sendIce?: string;
  receiveIce?: string;
  iceError?: string | null;
  mediaReady?: boolean;
  heartbeatInterrupted?: boolean;
}): ConnectionHealth {
  const send = input.send ?? 'idle';
  const receive = input.receive ?? 'idle';
  const states = [send, receive];
  const iceStates = [input.sendIce ?? 'idle', input.receiveIce ?? 'idle'];

  if (input.signaling === 'failed') {
    return { kind: 'failed', label: 'Server unavailable', shortLabel: 'Unavailable' };
  }
  if (input.signaling !== 'connected') {
    return { kind: 'connecting', label: 'Server connecting', shortLabel: 'Connecting' };
  }
  if (states.includes('failed')) {
    return { kind: 'failed', label: 'Media failed', shortLabel: 'Failed' };
  }
  if (input.heartbeatInterrupted) {
    return { kind: 'warning', label: 'Server not responding', shortLabel: 'No reply' };
  }
  if (states.includes('disconnected') || states.includes('closed')) {
    return { kind: 'warning', label: 'Media interrupted', shortLabel: 'Interrupted' };
  }
  if (states.includes('connecting')) {
    return { kind: 'connecting', label: 'Media connecting', shortLabel: 'Connecting' };
  }
  if (iceStates.includes('gathering')) {
    return { kind: 'connecting', label: 'ICE gathering', shortLabel: 'Connecting' };
  }
  if (states.includes('connected')) {
    return { kind: 'connected', label: 'Media connected', shortLabel: 'OK' };
  }
  if (input.iceError) {
    return { kind: 'warning', label: 'ICE warning', shortLabel: 'Warning' };
  }
  if (input.mediaReady) {
    return { kind: 'connected', label: 'Media ready', shortLabel: 'OK' };
  }
  return { kind: 'idle', label: 'Media idle', shortLabel: 'Idle' };
}

export function connectionHealthFromSession(state: {
  signalingStatus: SignalingHealth;
  sendTransportState: string;
  recvTransportState: string;
  sendIceState: string;
  recvIceState: string;
  mediaIceError: string | null;
  mediaReady: boolean;
  serverHeartbeatInterrupted?: boolean;
}): ConnectionHealth {
  return connectionHealth({
    signaling: state.signalingStatus,
    send: state.sendTransportState,
    receive: state.recvTransportState,
    sendIce: state.sendIceState,
    receiveIce: state.recvIceState,
    iceError: state.mediaIceError,
    mediaReady: state.mediaReady,
    heartbeatInterrupted: state.serverHeartbeatInterrupted,
  });
}
