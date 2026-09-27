import { describe, expect, it } from 'vitest';

import { createServerHeartbeat, type HeartbeatSocket } from './serverHeartbeat';

function setup(options: { paused?: () => boolean } = {}) {
  let time = 0;
  let tick: (() => void) | null = null;
  const replies: Array<(error: unknown, reply: unknown) => void> = [];
  const changes: boolean[] = [];
  const socket: HeartbeatSocket = {
    connected: true,
    emitHealth(_timeoutMs, onReply) {
      replies.push(onReply);
    },
  };
  const health = createServerHeartbeat(socket, (value) => changes.push(value), {
    now: () => time,
    schedule(callback) {
      tick = callback;
      return 1;
    },
    cancel() {
      tick = null;
    },
    isPaused: options.paused,
  });
  return {
    health,
    socket,
    replies,
    changes,
    advance(ms: number) {
      time += ms;
      tick?.();
    },
  };
}

describe('server heartbeat', () => {
  it('warns after two seconds, once, and a fresh reply clears it', () => {
    const fixture = setup();
    fixture.health.start();
    fixture.replies[0]?.(null, true);
    for (let i = 0; i < 3; i += 1) {
      fixture.advance(500);
    }
    expect(fixture.changes).toEqual([]);
    fixture.advance(500);
    expect(fixture.changes).toEqual([true]);
    fixture.advance(500);
    expect(fixture.changes).toEqual([true]);
    fixture.replies.at(-1)?.(null, true);
    expect(fixture.changes).toEqual([true, false]);
    for (let i = 0; i < 4; i += 1) {
      fixture.advance(500);
    }
    expect(fixture.changes).toEqual([true, false, true]);
  });

  it('stays quiet while replies keep arriving', () => {
    const fixture = setup();
    fixture.health.start();
    for (let i = 0; i < 100; i += 1) {
      fixture.replies.at(-1)?.(null, true);
      fixture.advance(500);
    }
    expect(fixture.changes).toEqual([]);
  });

  it('ignores expired, failed, and invalid replies', () => {
    const fixture = setup();
    fixture.health.start();
    for (let i = 0; i < 4; i += 1) {
      fixture.advance(500);
    }
    fixture.replies[0]?.(null, true);
    fixture.replies.at(-1)?.(new Error('timeout'), null);
    fixture.replies.at(-1)?.(null, false);
    expect(fixture.changes).toEqual([true]);
  });

  it('ignores a reply from the connection that was stopped', () => {
    const fixture = setup();
    fixture.health.start();
    const previousReply = fixture.replies[0];
    fixture.socket.connected = false;
    fixture.health.stop();
    fixture.advance(500);
    expect(fixture.replies).toHaveLength(1);
    fixture.socket.connected = true;
    fixture.health.start();
    fixture.advance(1500);
    previousReply?.(null, true);
    fixture.advance(500);
    expect(fixture.changes).toEqual([true]);
    fixture.replies.at(-1)?.(null, true);
    expect(fixture.changes).toEqual([true, false]);
  });

  it('treats a stalled timer as a resume, not a server outage', () => {
    const fixture = setup();
    fixture.health.start();
    fixture.replies[0]?.(null, true);
    fixture.advance(5000);
    expect(fixture.changes).toEqual([]);
    for (let i = 0; i < 3; i += 1) {
      fixture.advance(500);
    }
    expect(fixture.changes).toEqual([]);
    fixture.advance(500);
    expect(fixture.changes).toEqual([true]);
  });

  it('does not warn while the app is in the background', () => {
    let paused = true;
    const fixture = setup({ paused: () => paused });
    fixture.health.start();
    fixture.advance(5000);
    expect(fixture.changes).toEqual([]);
    expect(fixture.replies).toHaveLength(0);
    paused = false;
    for (let i = 0; i < 3; i += 1) {
      fixture.advance(500);
    }
    expect(fixture.changes).toEqual([]);
    fixture.advance(500);
    expect(fixture.changes).toEqual([true]);
  });
});
