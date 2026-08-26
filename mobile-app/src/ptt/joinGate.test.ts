import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SystemPttJoinGate,
  shouldWaitForPendingSystemPttJoin,
} from './joinGate';

describe('system PTT join gate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits only on iOS while a join is in flight and not yet joined', () => {
    expect(
      shouldWaitForPendingSystemPttJoin({
        platform: 'ios',
        pttEnabled: true,
        joinInFlight: true,
        pttJoined: false,
      }),
    ).toBe(true);
    expect(
      shouldWaitForPendingSystemPttJoin({
        platform: 'ios',
        pttEnabled: true,
        joinInFlight: true,
        pttJoined: true,
      }),
    ).toBe(false);
    expect(
      shouldWaitForPendingSystemPttJoin({
        platform: 'android',
        pttEnabled: true,
        joinInFlight: true,
      }),
    ).toBe(false);
    expect(
      shouldWaitForPendingSystemPttJoin({
        platform: 'ios',
        pttEnabled: false,
        joinInFlight: true,
      }),
    ).toBe(false);
  });

  it('begin stays pending until settle, and idle wait returns immediately', async () => {
    const gate = new SystemPttJoinGate();
    expect(gate.pending).toBe(false);
    await expect(gate.wait(20)).resolves.toBe('idle');
    gate.begin();
    expect(gate.pending).toBe(true);
    const waiting = gate.wait(1_000);
    gate.settle();
    await expect(waiting).resolves.toBe('ready');
    expect(gate.pending).toBe(false);
  });

  it('times out without settling the in-flight join', async () => {
    vi.useFakeTimers();
    const gate = new SystemPttJoinGate();
    gate.begin();
    const waiting = gate.wait(50);
    await vi.advanceTimersByTimeAsync(50);
    await expect(waiting).resolves.toBe('timeout');
    expect(gate.pending).toBe(true);
    gate.settle();
    expect(gate.pending).toBe(false);
  });
});
