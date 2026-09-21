import { describe, expect, it } from 'vitest';

import {
  operatorPttNotice,
  hexPushToken,
  incomingPushResultForPayload,
  parseApplePttBootstrap,
  parseApplePttPushPayload,
  pttCapabilityReason,
  pttStatusLabel,
  shouldShowPttJoinBanner,
  shouldUseSystemPtt,
} from './policy';

describe('Apple PTT policy', () => {
  it('treats bootstrap enabled:false as advisory, not a failure', () => {
    expect(parseApplePttBootstrap({ ok: true, enabled: false })).toEqual({
      enabled: false,
      advisory: true,
    });
  });

  it('reads a channel only when the server claims enabled', () => {
    expect(
      parseApplePttBootstrap({
        ok: true,
        enabled: true,
        channelUUID: '11111111-1111-1111-1111-111111111111',
        channelName: 'Talktome',
      }),
    ).toEqual({
      enabled: true,
      advisory: true,
      channel: {
        channelUUID: '11111111-1111-1111-1111-111111111111',
        channelName: 'Talktome',
      },
    });
  });

  it('parses the ttm push envelope', () => {
    expect(
      parseApplePttPushPayload({
        ttm: {
          type: 'active-remote-participant',
          participant: { name: 'beni' },
          reason: 'talk',
        },
      }),
    ).toEqual({
      type: 'active-remote-participant',
      participantName: 'beni',
      reason: 'talk',
    });
  });

  it('does not leave the channel on a service-update push', () => {
    expect(
      incomingPushResultForPayload({ type: 'service-update', reason: 'refresh' }, 'beni'),
    ).toEqual({ action: 'activeRemoteParticipant', name: 'beni' });
    expect(incomingPushResultForPayload({ type: 'leave-channel' })).toEqual({
      action: 'leaveChannel',
    });
  });

  it('hex-encodes the ephemeral token the way the server validates it', () => {
    expect(hexPushToken([0xde, 0xad, 0xbe, 0xef])).toBe('deadbeef');
  });

  it('joins only for signed-in users on an entitlement build', () => {
    expect(
      shouldUseSystemPtt({
        platform: 'ios',
        pttEnabled: true,
        operatorReady: true,
        identityKind: 'user',
      }),
    ).toBe(true);
    expect(
      shouldUseSystemPtt({
        platform: 'ios',
        pttEnabled: true,
        operatorReady: true,
        identityKind: 'guest',
      }),
    ).toBe(false);
  });

  it('warns on the operator screen when a join has not been verified by a push', () => {
    expect(
      operatorPttNotice({
        platform: 'ios',
        pttEnabled: true,
        bootstrapEnabled: true,
        joined: true,
        verified: false,
        diagnostic: '',
      }),
    ).toMatch(/no Apple push/);
    expect(
      operatorPttNotice({
        platform: 'ios',
        pttEnabled: true,
        bootstrapEnabled: false,
        joined: false,
        verified: false,
        diagnostic: 'ignored',
      }),
    ).toBeNull();
    expect(
      operatorPttNotice({
        platform: 'android',
        pttEnabled: true,
        bootstrapEnabled: true,
        joined: true,
        verified: false,
        diagnostic: '',
      }),
    ).toBeNull();
  });

  it('shows a session Join banner until the system channel is joined', () => {
    expect(
      shouldShowPttJoinBanner({
        platform: 'ios',
        pttEnabled: true,
        bootstrapEnabled: true,
        joined: false,
      }),
    ).toBe(true);
    expect(
      shouldShowPttJoinBanner({
        platform: 'ios',
        pttEnabled: true,
        bootstrapEnabled: true,
        joined: true,
      }),
    ).toBe(false);
  });

  it('does not claim APNs works from bootstrap alone', () => {
    expect(
      pttCapabilityReason({
        enabledInBuild: true,
        nativeAvailable: true,
        bootstrapEnabled: true,
        joined: true,
        verified: false,
      }),
    ).toMatch(/advisory/);
    expect(
      pttStatusLabel({
        enabledInBuild: true,
        nativeAvailable: true,
        bootstrapEnabled: true,
        joined: true,
        verified: false,
      }),
    ).toBe('Joined (unverified)');
  });
});
