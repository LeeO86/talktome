import { describe, expect, it } from 'vitest';

import {
  TIER_B_COPY,
  TIER_B_UNMEASURED,
  audioSessionCapabilityReason,
  audioSessionStatusLabel,
  shouldOwnAudioSession,
  shouldPrepareAudioForMedia,
  shouldReactivateCaptureForTalk,
  shouldStartBackgroundKeepalive,
  shouldTeardownAudioWhenNotOwningSession,
} from './policy';

describe('audio session policy', () => {
  it('owns the session on iOS Tier B after the operator is ready', () => {
    expect(shouldOwnAudioSession({ platform: 'ios', operatorReady: true })).toBe(true);
    expect(shouldOwnAudioSession({ platform: 'ios', operatorReady: false })).toBe(false);
  });

  it('prepares the iOS session before media', () => {
    expect(shouldPrepareAudioForMedia({ platform: 'ios' })).toBe(true);
    expect(shouldPrepareAudioForMedia({ platform: 'android' })).toBe(false);
  });

  it('tears the session down only when the operator is not ready', () => {
    expect(shouldTeardownAudioWhenNotOwningSession({ platform: 'ios', operatorReady: false })).toBe(
      true,
    );
    expect(shouldTeardownAudioWhenNotOwningSession({ platform: 'ios', operatorReady: true })).toBe(
      false,
    );
  });

  it('starts keepalive only on iOS background', () => {
    expect(
      shouldStartBackgroundKeepalive({
        platform: 'ios',
        operatorReady: true,
        appState: 'background',
      }),
    ).toBe(true);
    expect(
      shouldStartBackgroundKeepalive({
        platform: 'ios',
        operatorReady: true,
        appState: 'active',
      }),
    ).toBe(false);
    expect(
      shouldStartBackgroundKeepalive({
        platform: 'android',
        operatorReady: true,
        appState: 'background',
      }),
    ).toBe(false);
  });

  it('reactivates capture when talking from keepalive or a non-active state', () => {
    expect(
      shouldReactivateCaptureForTalk({ ownsSession: true, keepalive: true, appState: 'background' }),
    ).toBe(true);
    expect(
      shouldReactivateCaptureForTalk({ ownsSession: true, keepalive: false, appState: 'active' }),
    ).toBe(false);
    expect(
      shouldReactivateCaptureForTalk({ ownsSession: false, keepalive: true, appState: 'background' }),
    ).toBe(false);
  });

  it('keeps Tier B copy honest and does not invent seconds', () => {
    expect(TIER_B_COPY).toMatch(/will not wake/);
    expect(TIER_B_UNMEASURED).toMatch(/physical iPhone/);
    expect(
      audioSessionCapabilityReason({
        available: true,
        active: true,
        keepalive: false,
      }),
    ).toMatch(/not written yet/);
    expect(
      audioSessionStatusLabel({
        platform: 'ios',
        available: false,
        active: false,
        keepalive: false,
      }),
    ).toBe('Rebuild Dev Client');
  });
});
