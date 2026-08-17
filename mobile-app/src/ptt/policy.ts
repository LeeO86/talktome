// Ported from talktome-apple ApplePushToTalkController + IntercomProtocol @ 004d6e76
// by Daniel Jocher. serviceUpdate must not leave the channel (prototype bug).

export const PTT_PLACEHOLDER_PARTICIPANT = 'TalkToMe';

export type ApplePttChannel = {
  channelUUID: string;
  channelName: string;
};

export type ApplePttPushType = 'active-remote-participant' | 'service-update' | 'leave-channel';

export type ApplePttPushPayload = {
  type: ApplePttPushType;
  participantName?: string;
  reason?: string;
};

export type ApplePttBootstrap =
  | { enabled: false; advisory: true }
  | { enabled: true; advisory: true; channel: ApplePttChannel };

export type IncomingPushResult =
  | { action: 'leaveChannel' }
  | { action: 'activeRemoteParticipant'; name: string };

export function parseApplePttBootstrap(payload: unknown): ApplePttBootstrap {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Apple PTT bootstrap payload is missing.');
  }
  const record = payload as Record<string, unknown>;
  if (record.ok === false) {
    throw new Error(typeof record.error === 'string' ? record.error : 'Apple PTT bootstrap failed.');
  }
  if (record.enabled !== true) {
    return { enabled: false, advisory: true };
  }
  if (typeof record.channelUUID !== 'string' || typeof record.channelName !== 'string') {
    throw new Error('Apple PTT bootstrap is missing a channel.');
  }
  return {
    enabled: true,
    advisory: true,
    channel: { channelUUID: record.channelUUID, channelName: record.channelName },
  };
}

export function parseApplePttPushPayload(pushPayload: unknown): ApplePttPushPayload | null {
  if (!pushPayload || typeof pushPayload !== 'object') {
    return null;
  }
  const root = pushPayload as Record<string, unknown>;
  const ttm = root.ttm && typeof root.ttm === 'object' ? (root.ttm as Record<string, unknown>) : root;
  const type = ttm.type;
  if (
    type !== 'active-remote-participant' &&
    type !== 'service-update' &&
    type !== 'leave-channel'
  ) {
    return null;
  }
  const participant = ttm.participant && typeof ttm.participant === 'object'
    ? (ttm.participant as Record<string, unknown>)
    : undefined;
  const participantName =
    typeof participant?.name === 'string' && participant.name.trim()
      ? participant.name.trim()
      : undefined;
  return {
    type,
    participantName,
    reason: typeof ttm.reason === 'string' ? ttm.reason : undefined,
  };
}

export function incomingPushResultForPayload(
  payload: ApplePttPushPayload | null,
  lastParticipantName?: string,
): IncomingPushResult {
  if (!payload) {
    return { action: 'leaveChannel' };
  }
  if (payload.type === 'leave-channel') {
    return { action: 'leaveChannel' };
  }
  if (payload.type === 'active-remote-participant') {
    return payload.participantName
      ? { action: 'activeRemoteParticipant', name: payload.participantName }
      : { action: 'leaveChannel' };
  }
  // service-update: keep the channel. The prototype returned .leaveChannel here.
  const name = payload.participantName || lastParticipantName || PTT_PLACEHOLDER_PARTICIPANT;
  return { action: 'activeRemoteParticipant', name };
}

export function hexPushToken(bytes: Iterable<number>): string {
  return [...bytes].map((byte) => (byte & 0xff).toString(16).padStart(2, '0')).join('');
}

export function isHexPushToken(value: string): boolean {
  return /^[0-9a-f]+$/i.test(value) && value.length > 0 && value.length % 2 === 0;
}

export function shouldUseSystemPtt(input: {
  platform: string;
  pttEnabled: boolean;
  operatorReady: boolean;
  identityKind?: string | null;
}): boolean {
  return (
    input.platform === 'ios' &&
    input.pttEnabled &&
    input.operatorReady &&
    input.identityKind === 'user'
  );
}

export function pttStatusLabel(input: {
  enabledInBuild: boolean;
  nativeAvailable: boolean;
  bootstrapEnabled: boolean;
  joined: boolean;
  verified: boolean;
}): string {
  if (!input.enabledInBuild) {
    return 'Compiled out';
  }
  if (!input.nativeAvailable) {
    return 'Rebuild Dev Client';
  }
  if (input.verified) {
    return 'Push verified';
  }
  if (input.joined) {
    return 'Joined (unverified)';
  }
  if (input.bootstrapEnabled) {
    return 'Bootstrap advisory';
  }
  return 'Idle';
}

export function pttCapabilityReason(input: {
  enabledInBuild: boolean;
  nativeAvailable: boolean;
  bootstrapEnabled: boolean;
  joined: boolean;
  verified: boolean;
}): string {
  if (!input.enabledInBuild) {
    return 'This OSS build compiles PushToTalk out. Rebuild with EXPO_PUBLIC_ENABLE_IOS_PTT=1 after the App ID has the Push to Talk capability.';
  }
  if (!input.nativeAvailable) {
    return 'This build requested PushToTalk but the native module is missing. Rebuild the Dev Client with EXPO_PUBLIC_ENABLE_IOS_PTT=1.';
  }
  if (input.verified) {
    return 'A PushToTalk push reached this device. Lock-screen wake is no longer only advisory.';
  }
  if (input.joined) {
    return 'Joined the system PTT channel. Server bootstrap { enabled: true } is advisory — APNs is not verified until a real push arrives.';
  }
  if (input.bootstrapEnabled) {
    return 'Server bootstrap claims Apple PTT is configured. That is not a delivered push.';
  }
  return 'PushToTalk is in this build. The server has not advertised an enabled channel yet. Bootstrap is advisory.';
}
