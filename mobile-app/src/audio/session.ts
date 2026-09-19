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
  prepareForSystemManagedIntercom?: () => Promise<boolean>;
  deactivate?: () => Promise<boolean>;
  setWebRTCAudioEnabled?: (enabled: boolean) => Promise<boolean>;
  updateNowPlaying?: (title: string, detail: string, active: boolean) => Promise<boolean>;
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

export function audioSessionProfile(): AudioSessionProfile {
  return loadNative()?.profile?.() ?? 'idle';
}

export async function activateForMonitoring(): Promise<boolean> {
  return (await loadNative()?.activateForMonitoring?.()) === true;
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

export async function prepareForSystemManagedIntercom(): Promise<boolean> {
  return (await loadNative()?.prepareForSystemManagedIntercom?.()) === true;
}

export async function deactivateAudioSession(): Promise<boolean> {
  return (await loadNative()?.deactivate?.()) === true;
}

export async function setWebRTCAudioEnabled(enabled: boolean): Promise<boolean> {
  return (await loadNative()?.setWebRTCAudioEnabled?.(enabled)) === true;
}

/** Clears leftover iOS Now Playing. TalkToMe does not register as a media player. */
export async function clearNowPlaying(): Promise<boolean> {
  return (await loadNative()?.updateNowPlaying?.('', '', false)) === true;
}
