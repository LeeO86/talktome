import { describe, expect, it } from 'vitest';

import {
  fgsCapabilityReason,
  fgsStatusLabel,
  shouldClaimMicrophoneFgsType,
  shouldRetryForegroundService,
  shouldStartForegroundService,
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
});
