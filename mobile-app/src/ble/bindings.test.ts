import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  aggregateBleKind,
  bindingTarget,
  describeBleReleaseTimeout,
  mergeLiveBleDevices,
  nextBleReleaseTimeoutMs,
  parseBleDeviceBindings,
  parseBleReleaseTimeoutMs,
  removeBleDeviceBinding,
  upsertBleDeviceBinding,
} from './bindings';
import { BleReleaseWatchdog } from './watchdog';

describe('BLE device bindings', () => {
  it('parses stored accessories and ignores duplicates', () => {
    expect(
      parseBleDeviceBindings([
        { id: 'aa', name: 'HB9800D', target: { kind: 'reply' } },
        { id: 'aa', name: 'dup' },
        { id: '', name: 'bad' },
        { id: 'bb', name: 'PTT-Z01', target: { kind: 'target', type: 'user', id: 9, label: 'beni' } },
      ]),
    ).toEqual([
      { id: 'aa', name: 'HB9800D', target: { kind: 'reply' } },
      {
        id: 'bb',
        name: 'PTT-Z01',
        target: { kind: 'target', type: 'user', id: 9, label: 'beni' },
      },
    ]);
  });

  it('upserts a new accessory with Reply and keeps a per-device target', () => {
    const first = upsertBleDeviceBinding([], { id: 'aa', name: 'Herda' });
    expect(first[0]?.target).toEqual({ kind: 'reply' });
    const next = upsertBleDeviceBinding(first, {
      id: 'aa',
      target: { kind: 'target', type: 'conference', id: 4, label: 'All' },
    });
    expect(bindingTarget(next, 'aa')).toEqual({ kind: 'target', type: 'conference', id: 4, label: 'All' });
    expect(removeBleDeviceBinding(next, 'aa')).toEqual([]);
  });

  it('merges live native devices into the My accessories list', () => {
    expect(
      mergeLiveBleDevices(
        [{ id: 'aa', name: 'Old', target: { kind: 'reply' } }],
        [
          { id: 'aa', name: 'HB9800D', kind: 'connected' },
          { id: 'bb', name: 'PTT-Z01', kind: 'connecting' },
        ],
      ),
    ).toEqual([
      { id: 'aa', name: 'HB9800D', target: { kind: 'reply' } },
      { id: 'bb', name: 'PTT-Z01', target: { kind: 'reply' } },
    ]);
  });

  it('aggregates several links into one Settings status', () => {
    expect(aggregateBleKind([{ id: 'a', kind: 'connected' }], false)).toBe('connected');
    expect(
      aggregateBleKind(
        [
          { id: 'a', kind: 'connected' },
          { id: 'b', kind: 'connecting' },
        ],
        true,
      ),
    ).toBe('scanning');
    expect(aggregateBleKind([], false)).toBe('idle');
  });
});

describe('BLE release timeout', () => {
  it('cycles through the Settings options including Off', () => {
    expect(describeBleReleaseTimeout(30_000)).toBe('30 s');
    expect(describeBleReleaseTimeout(60_000)).toBe('1 min');
    expect(describeBleReleaseTimeout(0)).toBe('Off');
    expect(nextBleReleaseTimeoutMs(30_000)).toBe(60_000);
    expect(nextBleReleaseTimeoutMs(0)).toBe(10_000);
    expect(parseBleReleaseTimeoutMs(0)).toBe(0);
    expect(parseBleReleaseTimeoutMs(-1)).toBe(30_000);
  });
});

describe('BLE release watchdog', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not force a release when the timeout is off', () => {
    vi.useFakeTimers();
    const forced: boolean[] = [];
    const watchdog = new BleReleaseWatchdog(() => forced.push(true), 0);
    watchdog.notePressed();
    vi.advanceTimersByTime(60_000);
    expect(forced).toEqual([]);
  });

  it('uses the configured timeout', () => {
    vi.useFakeTimers();
    const forced: boolean[] = [];
    const watchdog = new BleReleaseWatchdog(() => forced.push(true), 10_000);
    watchdog.notePressed();
    vi.advanceTimersByTime(9_999);
    expect(forced).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(forced).toEqual([true]);
  });
});
