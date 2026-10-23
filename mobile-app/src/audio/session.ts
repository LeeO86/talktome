import { requireNativeModule } from 'expo-modules-core';

export type AudioSessionProfile = 'idle' | 'monitoring' | 'intercom' | 'keepalive';

type NativeAudioSession = {
  isAvailable?: () => boolean;
  profile?: () => AudioSessionProfile;
  activateForMonitoring?: () => Promise<boolean>;
  activateForIntercom?: () => Promise<boolean>;
  reactivateForOutgoingTalkCapture?: () => Promise<boolean>;
  startBackgroundKeepalive?: () => Promise<boolean>;
  stopBackgroundKeepalive?: () => Promise<boolean>;
  deactivate?: () => Promise<boolean>;
  setWebRTCAudioEnabled?: (enabled: boolean) => Promise<boolean>;
  updateNowPlaying?: (title: string, detail: string, active: boolean) => Promise<boolean>;
  playConnectionCue?: (name: string) => Promise<boolean>;
};

let cached: NativeAudioSession | null | undefined;

function loadNative(): NativeAudioSession | null {
  if (cached !== undefined) {
    return cached;
  }
  try {
    const native = requireNativeModule('TalkToMeAudioSession') as NativeAudioSession;
    cached = native?.isAvailable?.() === false ? null : native;
  } catch {
    cached = null;
  }
  return cached;
}

export function audioSessionAvailable(): boolean {
  return loadNative() != null;
}

export async function activateForIntercom(): Promise<boolean> {
  return (await loadNative()?.activateForIntercom?.()) === true;
}

export async function reactivateForOutgoingTalkCapture(): Promise<boolean> {
  return (await loadNative()?.reactivateForOutgoingTalkCapture?.()) === true;
}

export async function startBackgroundKeepalive(): Promise<boolean> {
  return (await loadNative()?.startBackgroundKeepalive?.()) === true;
}

export async function stopBackgroundKeepalive(): Promise<boolean> {
  return (await loadNative()?.stopBackgroundKeepalive?.()) === true;
}

export async function deactivateAudioSession(): Promise<boolean> {
  return (await loadNative()?.deactivate?.()) === true;
}

export async function setWebRTCAudioEnabled(enabled: boolean): Promise<boolean> {
  return (await loadNative()?.setWebRTCAudioEnabled?.(enabled)) === true;
}

/** TalkToMe 1.5.6 disconnect / reconnect tones. No-ops when the intercom session is idle. */
export async function playConnectionCue(name: 'disconnected' | 'reconnected'): Promise<boolean> {
  try {
    return (await loadNative()?.playConnectionCue?.(name)) === true;
  } catch {
    return false;
  }
}

/** Clears leftover iOS Now Playing. TalkToMe does not register as a media player. */
export async function clearNowPlaying(): Promise<boolean> {
  return (await loadNative()?.updateNowPlaying?.('', '', false)) === true;
}
