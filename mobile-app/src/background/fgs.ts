export function shouldStartForegroundService(platform: string, operatorReady: boolean): boolean {
  return platform === 'android' && operatorReady;
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
    : 'Android starts a microphone/media foreground service after you join a production. Rebuild the Dev Client if the notification never appears. OEM battery savers can still kill it.';
}
