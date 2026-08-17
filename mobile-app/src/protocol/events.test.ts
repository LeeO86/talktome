import { describe, expect, it } from 'vitest';

import { SocketEvent } from './events';

describe('SocketEvent', () => {
  it('keeps the Apple/server event names', () => {
    expect(SocketEvent.registerUser).toBe('register-user');
    expect(SocketEvent.incomingTalkState).toBe('incoming-talk-state');
    expect(SocketEvent.talkTargetsUpdated).toBe('talk-targets-updated');
    expect(SocketEvent.getRouterRtpCapabilities).toBe('get-router-rtp-capabilities');
    expect(SocketEvent.sessionKicked).toBe('session-kicked');
    expect(SocketEvent.requestApplePttBootstrap).toBe('request-apple-ptt-bootstrap');
    expect(SocketEvent.registerApplePttPushToken).toBe('register-apple-ptt-push-token');
    expect(SocketEvent.unregisterApplePttPushToken).toBe('unregister-apple-ptt-push-token');
  });
});
