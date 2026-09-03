import { describe, expect, it } from 'vitest';

import {
  TIER_B_COPY,
  TIER_B_UNMEASURED,
  audioSessionCapabilityReason,
  audioSessionStatusLabel,
  iosPttEnabled,
  shouldHandOffPlaybackToSystemPtt,
  shouldOwnAudioSession,
  shouldPrepareAudioForMedia,
  shouldPrepareSystemManagedAudioForMedia,
  shouldReactivateCaptureForTalk,
  shouldStartBackgroundKeepalive,
  shouldTeardownAudioWhenNotOwningSession,
} from './policy';

describe('audio session policy', () => {
  it('owns the session on iOS Tier B after the operator is ready', () => {
    expect(
      shouldOwnAudioSession({ platform: 'ios', pttEnabled: false, operatorReady: true }),
    ).toBe(true);
    expect(
      shouldOwnAudioSession({ platform: 'ios', pttEnabled: false, operatorReady: false }),
    ).toBe(false);
  });

  it('prepares the iOS session before media, unless PushToTalk has joined', () => {
    expect(shouldPrepareAudioForMedia({ platform: 'ios', pttEnabled: false })).toBe(true);
    expect(shouldPrepareAudioForMedia({ platform: 'ios', pttEnabled: true, pttJoined: false })).toBe(
      true,
    );
    expect(shouldPrepareAudioForMedia({ platform: 'ios', pttEnabled: true, pttJoined: true })).toBe(
      false,
    );
    expect(shouldPrepareAudioForMedia({ platform: 'android', pttEnabled: false })).toBe(false);
    expect(
      shouldPrepareSystemManagedAudioForMedia({
        platform: 'ios',
        pttEnabled: true,
        pttJoined: true,
      }),
    ).toBe(true);
    expect(
      shouldPrepareSystemManagedAudioForMedia({
        platform: 'ios',
        pttEnabled: true,
        pttJoined: false,
      }),
    ).toBe(false);
  });

  it('keeps the session until the system PTT channel has actually joined', () => {
    expect(iosPttEnabled('1')).toBe(true);
    expect(
      shouldOwnAudioSession({
        platform: 'ios',
        pttEnabled: true,
        pttJoined: false,
        operatorReady: true,
      }),
    ).toBe(true);
    expect(
      shouldOwnAudioSession({
        platform: 'ios',
        pttEnabled: true,
        pttJoined: true,
        operatorReady: true,
      }),
    ).toBe(false);
  });

  it('hands feed playback to system PTT instead of tearing the session down', () => {
    const joinedReady = {
      platform: 'ios' as const,
      pttEnabled: true,
      pttJoined: true,
      operatorReady: true,
    };
    expect(shouldHandOffPlaybackToSystemPtt(joinedReady)).toBe(true);
    expect(shouldTeardownAudioWhenNotOwningSession(joinedReady)).toBe(false);
    expect(
      shouldHandOffPlaybackToSystemPtt({
        platform: 'ios',
        pttEnabled: true,
        pttJoined: false,
        operatorReady: true,
      }),
    ).toBe(false);
    expect(
      shouldHandOffPlaybackToSystemPtt({
        platform: 'ios',
        pttEnabled: true,
        pttJoined: true,
        operatorReady: false,
      }),
    ).toBe(false);
    expect(
      shouldTeardownAudioWhenNotOwningSession({
        platform: 'ios',
        pttEnabled: true,
        pttJoined: true,
        operatorReady: false,
      }),
    ).toBe(true);
    expect(
      shouldTeardownAudioWhenNotOwningSession({
        platform: 'ios',
        pttEnabled: false,
        operatorReady: true,
      }),
    ).toBe(false);
    expect(
      shouldHandOffPlaybackToSystemPtt({
        platform: 'android',
        pttEnabled: true,
        pttJoined: true,
        operatorReady: true,
      }),
    ).toBe(false);
  });

  it('starts keepalive only on iOS background without PTT', () => {
    expect(
      shouldStartBackgroundKeepalive({
        platform: 'ios',
        pttEnabled: false,
        operatorReady: true,
        appState: 'background',
      }),
    ).toBe(true);
    expect(
      shouldStartBackgroundKeepalive({
        platform: 'ios',
        pttEnabled: false,
        operatorReady: true,
        appState: 'active',
      }),
    ).toBe(false);
    expect(
      shouldStartBackgroundKeepalive({
        platform: 'android',
        pttEnabled: false,
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
        pttEnabled: false,
      }),
    ).toMatch(/not written yet/);
    expect(
      audioSessionStatusLabel({
        platform: 'ios',
        available: false,
        active: false,
        keepalive: false,
        pttEnabled: false,
      }),
    ).toBe('Rebuild Dev Client');
  });
});
