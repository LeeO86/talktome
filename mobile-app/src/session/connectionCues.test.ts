import { describe, expect, it } from 'vitest';

import {
  canAnnounceConnectionRecovery,
  createConnectionCues,
  transportReportsLoss,
  transportsAllowRecovery,
} from './connectionCues';

describe('connection cues', () => {
  it('plays each edge once until the session is reset', () => {
    const played: string[] = [];
    const cues = createConnectionCues((cue) => played.push(cue));
    cues.noteDisconnected();
    cues.noteDisconnected();
    cues.noteReconnected();
    cues.noteReconnected();
    expect(played).toEqual(['disconnected', 'reconnected']);
    cues.reset();
    cues.noteReconnected();
    expect(played).toEqual(['disconnected', 'reconnected']);
  });

  it('plays one cycle in the background, then stays quiet until the foreground', () => {
    const played: string[] = [];
    const cues = createConnectionCues((cue) => played.push(cue));
    cues.setBackground(true);
    cues.noteDisconnected();
    cues.noteReconnected();
    cues.noteDisconnected();
    cues.noteReconnected();
    expect(played).toEqual(['disconnected', 'reconnected']);
    cues.setBackground(false);
    cues.noteDisconnected();
    cues.noteReconnected();
    expect(played).toEqual(['disconnected', 'reconnected', 'disconnected', 'reconnected']);
  });

  it('treats an unused transport as ready and a connecting one as not', () => {
    expect(transportsAllowRecovery('connected', 'new')).toBe(true);
    expect(transportsAllowRecovery('idle', 'idle')).toBe(true);
    expect(transportsAllowRecovery('connected', 'connecting')).toBe(false);
    expect(transportsAllowRecovery('disconnected', 'connected')).toBe(false);
    expect(transportReportsLoss('connected', 'failed')).toBe(true);
    expect(transportReportsLoss('connected', 'closed')).toBe(false);
  });

  it('announces recovery only when the socket, heartbeat, and transports are healthy', () => {
    const healthy = {
      ending: false,
      signedIn: true,
      socketConnected: true,
      heartbeatInterrupted: false,
      send: 'connected',
      receive: 'new',
    };
    expect(canAnnounceConnectionRecovery(healthy)).toBe(true);
    expect(canAnnounceConnectionRecovery({ ...healthy, ending: true })).toBe(false);
    expect(canAnnounceConnectionRecovery({ ...healthy, signedIn: false })).toBe(false);
    expect(canAnnounceConnectionRecovery({ ...healthy, socketConnected: false })).toBe(false);
    expect(canAnnounceConnectionRecovery({ ...healthy, heartbeatInterrupted: true })).toBe(false);
    expect(canAnnounceConnectionRecovery({ ...healthy, receive: 'failed' })).toBe(false);
  });
});
