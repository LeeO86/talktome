export function shouldStartForegroundService(platform: string, operatorReady: boolean): boolean {
  return platform === 'android' && operatorReady;
}

export function shouldRetryForegroundService(
  platform: string,
  operatorReady: boolean,
  appState: string,
): boolean {
  return shouldStartForegroundService(platform, operatorReady) && appState === 'active';
}

export function shouldClaimMicrophoneFgsType(recordAudioGranted: boolean): boolean {
  return recordAudioGranted;
}

export type ForegroundServiceMode = 'idle' | 'start' | 'update' | 'stop';

export function foregroundServiceMode(input: {
  platform: string;
  operatorReady: boolean;
  nativeRunning: boolean;
}): ForegroundServiceMode {
  if (!shouldStartForegroundService(input.platform, input.operatorReady)) {
    return input.nativeRunning ? 'stop' : 'idle';
  }
  return input.nativeRunning ? 'update' : 'start';
}

export function fgsStatusLabel(input: { available: boolean; running: boolean; platform: string }): string {
  if (input.platform !== 'android') {
    return 'iOS audio background';
  }
  if (!input.available) {
    return 'Rebuild Dev Client';
  }
  return input.running ? 'Running' : 'Idle';
}

export function fgsCapabilityReason(running: boolean): string {
  return running
    ? 'Session is in a microphone/media foreground service. OEM battery savers can still kill it.'
    : 'Android starts a microphone/media foreground service after you join a production. OEM battery savers can still kill it.';
}

/** Recents swipe should end the session. Home / app-switch (task still there) must keep FGS. */
export function shouldStopForegroundServiceWhenTaskRemoved(): boolean {
  return true;
}
