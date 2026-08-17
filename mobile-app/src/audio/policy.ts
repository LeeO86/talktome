// Ported from talktome-apple AudioController + AppSession keepalive @ 004d6e76
// by Daniel Jocher. Tier B owns AVAudioSession only when PushToTalk does not.

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
}): boolean {
  if (!input.operatorReady) {
    return false;
  }
  if (input.platform === 'ios' && input.pttEnabled) {
    return false;
  }
  return input.platform === 'ios' || input.platform === 'android';
}

export function shouldStartBackgroundKeepalive(input: {
  platform: string;
  pttEnabled: boolean;
  operatorReady: boolean;
  appState: string;
}): boolean {
  return (
    input.platform === 'ios' &&
    !input.pttEnabled &&
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
}): string {
  if (input.platform !== 'ios') {
    return 'Android FGS';
  }
  if (input.pttEnabled) {
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
    return 'This build includes the PushToTalk module. The app must not activate its own audio session while the system owns the channel. Server bootstrap is advisory — APNs is not verified until a real push arrives.';
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
