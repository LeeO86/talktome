// Tier B: the app owns AVAudioSession for the whole session.

export const TIER_B_COPY =
  'Keeps working if you background the app during an active session. Locking the screen or sitting idle will usually suspend it. We will not wake for a new caller.';

export const TIER_B_UNMEASURED =
  'Survival seconds are not written yet — that needs a stopwatch on a physical iPhone (Q3).';

export function shouldOwnAudioSession(input: { platform: string; operatorReady: boolean }): boolean {
  if (!input.operatorReady) {
    return false;
  }
  return input.platform === 'ios' || input.platform === 'android';
}

/** Activate AVAudioSession before getUserMedia / produce, or the iOS Simulator abort()s in VoiceProcessingIO. */
export function shouldPrepareAudioForMedia(input: { platform: string }): boolean {
  return input.platform === 'ios';
}

export function shouldTeardownAudioWhenNotOwningSession(input: {
  platform: string;
  operatorReady: boolean;
}): boolean {
  return !shouldOwnAudioSession(input);
}

export function shouldStartBackgroundKeepalive(input: {
  platform: string;
  operatorReady: boolean;
  appState: string;
}): boolean {
  return input.platform === 'ios' && input.operatorReady && input.appState === 'background';
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
}): string {
  if (input.platform !== 'ios') {
    return 'Android FGS';
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
}): string {
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
