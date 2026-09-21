// Tier B keeps AVAudioSession until a system Push to Talk channel has joined.
// Join hands the session to iOS immediately. A later push verifies APNs; it is
// not what makes the system own the session.

export const TIER_B_COPY =
  'Keeps working if you background the app during an active session. Locking the screen or sitting idle will usually suspend it. We will not wake for a new caller.';

export const TIER_B_UNMEASURED =
  'Survival seconds are not written yet — that needs a stopwatch on a physical iPhone (Q3).';

export function iosPttEnabled(flag = process.env.EXPO_PUBLIC_ENABLE_IOS_PTT): boolean {
  return flag === '1';
}

export function shouldOwnAudioSession(input: {
  platform: string;
  pttEnabled: boolean;
  operatorReady: boolean;
  pttJoined?: boolean;
}): boolean {
  if (!input.operatorReady) {
    return false;
  }
  if (input.platform === 'ios' && input.pttEnabled && input.pttJoined) {
    return false;
  }
  return input.platform === 'ios' || input.platform === 'android';
}

/** Activate AVAudioSession before getUserMedia / produce, or the iOS Simulator abort()s in VoiceProcessingIO. */
export function shouldPrepareAudioForMedia(input: {
  platform: string;
  pttEnabled: boolean;
  pttJoined?: boolean;
}): boolean {
  return input.platform === 'ios' && !(input.pttEnabled && input.pttJoined);
}

/** System PTT owns AVAudioSession; configure WebRTC around it instead of activateForIntercom. */
export function shouldPrepareSystemManagedAudioForMedia(input: {
  platform: string;
  pttEnabled: boolean;
  pttJoined?: boolean;
}): boolean {
  return input.platform === 'ios' && Boolean(input.pttEnabled && input.pttJoined);
}

/** Keep WebRTC playback running around the system session instead of deactivate(). */
export function shouldHandOffPlaybackToSystemPtt(input: {
  platform: string;
  pttEnabled: boolean;
  operatorReady: boolean;
  pttJoined?: boolean;
}): boolean {
  return (
    input.platform === 'ios' &&
    input.pttEnabled &&
    Boolean(input.pttJoined) &&
    input.operatorReady
  );
}

/** Tear down an app-owned session only when nothing else will keep playback alive. */
export function shouldTeardownAudioWhenNotOwningSession(input: {
  platform: string;
  pttEnabled: boolean;
  operatorReady: boolean;
  pttJoined?: boolean;
}): boolean {
  return !shouldOwnAudioSession(input) && !shouldHandOffPlaybackToSystemPtt(input);
}

export function shouldStartBackgroundKeepalive(input: {
  platform: string;
  pttEnabled: boolean;
  operatorReady: boolean;
  appState: string;
  pttJoined?: boolean;
}): boolean {
  return (
    input.platform === 'ios' &&
    !(input.pttEnabled && input.pttJoined) &&
    input.operatorReady &&
    input.appState === 'background'
  );
}

export function shouldReactivateCaptureForTalk(input: {
  ownsSession: boolean;
  keepalive: boolean;
  appState: string;
}): boolean {
  return input.ownsSession && (input.keepalive || input.appState !== 'active');
}

export function audioSessionStatusLabel(input: {
  platform: string;
  available: boolean;
  active: boolean;
  keepalive: boolean;
  pttEnabled: boolean;
  pttJoined?: boolean;
}): string {
  if (input.platform !== 'ios') {
    return 'Android FGS';
  }
  if (input.pttEnabled && input.pttJoined) {
    return 'PTT owns session';
  }
  if (!input.available) {
    return 'Rebuild Dev Client';
  }
  if (input.keepalive) {
    return 'Keepalive';
  }
  if (input.active) {
    return 'Intercom session';
  }
  return 'Idle';
}

export function audioSessionCapabilityReason(input: {
  available: boolean;
  active: boolean;
  keepalive: boolean;
  pttEnabled: boolean;
}): string {
  if (input.pttEnabled) {
    return 'Push to Talk is in this build. The app keeps its own audio session until the operator joins a system channel. After join, iOS owns the session even before a push arrives, so join only when this server has an Apple push key.';
  }
  if (!input.available) {
    return `Rebuild the Dev Client to enable the audio-session module. ${TIER_B_COPY} ${TIER_B_UNMEASURED}`;
  }
  if (input.keepalive) {
    return `Background receive keepalive is running. ${TIER_B_COPY} ${TIER_B_UNMEASURED}`;
  }
  if (input.active) {
    return `Intercom audio session is active. ${TIER_B_COPY} ${TIER_B_UNMEASURED}`;
  }
  return `${TIER_B_COPY} ${TIER_B_UNMEASURED}`;
}
