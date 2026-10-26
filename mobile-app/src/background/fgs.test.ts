import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  fgsCapabilityReason,
  fgsStatusLabel,
  foregroundServiceMode,
  shouldClaimMicrophoneFgsType,
  shouldRetryForegroundService,
  shouldStartForegroundService,
  shouldStopForegroundServiceWhenTaskRemoved,
} from './fgs';

describe('foreground service policy', () => {
  it('starts only on Android after the operator session is ready', () => {
    expect(shouldStartForegroundService('android', true)).toBe(true);
    expect(shouldStartForegroundService('android', false)).toBe(false);
    expect(shouldStartForegroundService('ios', true)).toBe(false);
  });

  it('retries a failed start when the activity is in the foreground', () => {
    expect(shouldRetryForegroundService('android', true, 'active')).toBe(true);
    expect(shouldRetryForegroundService('android', true, 'background')).toBe(false);
    expect(shouldRetryForegroundService('android', false, 'active')).toBe(false);
  });

  it('starts from native isRunning, not a JS guess', () => {
    expect(foregroundServiceMode({ platform: 'android', operatorReady: true, nativeRunning: false })).toBe(
      'start',
    );
    expect(foregroundServiceMode({ platform: 'android', operatorReady: true, nativeRunning: true })).toBe(
      'update',
    );
    expect(foregroundServiceMode({ platform: 'android', operatorReady: false, nativeRunning: true })).toBe(
      'stop',
    );
    expect(foregroundServiceMode({ platform: 'android', operatorReady: false, nativeRunning: false })).toBe(
      'idle',
    );
    expect(foregroundServiceMode({ platform: 'ios', operatorReady: true, nativeRunning: false })).toBe('idle');
  });

  it('does not claim the microphone FGS type without RECORD_AUDIO', () => {
    expect(shouldClaimMicrophoneFgsType(true)).toBe(true);
    expect(shouldClaimMicrophoneFgsType(false)).toBe(false);
  });

  it('labels missing native code as a rebuild', () => {
    expect(fgsStatusLabel({ available: false, running: false, platform: 'android' })).toBe(
      'Rebuild Dev Client',
    );
    expect(fgsStatusLabel({ available: true, running: true, platform: 'android' })).toBe('Running');
    expect(fgsStatusLabel({ available: true, running: false, platform: 'ios' })).toBe(
      'iOS audio background',
    );
  });

  it('does not promise OEM immunity', () => {
    expect(fgsCapabilityReason(true)).toMatch(/OEM battery savers/);
  });

  it('stops the session FGS when the recents task is removed', () => {
    expect(shouldStopForegroundServiceWhenTaskRemoved()).toBe(true);
  });

  it('keeps the Expo plugin stopWithTask in sync with the native FGS manifest', () => {
    const plugin = readFileSync(resolve(__dirname, '../../plugins/withTalkToMeFgs.js'), 'utf8');
    const manifest = readFileSync(
      resolve(__dirname, '../../modules/foreground-service/android/src/main/AndroidManifest.xml'),
      'utf8',
    );
    const pluginValue = plugin.match(/'android:stopWithTask': '([^']+)'/)?.[1];
    const manifestValue = manifest.match(/android:stopWithTask="([^"]+)"/)?.[1];
    expect(pluginValue).toBe('true');
    expect(manifestValue).toBe('true');
  });
});
