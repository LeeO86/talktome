import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  aggregateBleKind,
  bindingControlTarget,
  bindingTarget,
  describeBindingTargets,
  describeBleReleaseTimeout,
  describePttDevicesSummary,
  mergeLiveBleDevices,
  missingAccessoryNotice,
  nextBleReleaseTimeoutMs,
  parseBleDeviceBindings,
  parseBleReleaseTimeoutMs,
  removeBleDeviceBinding,
  upsertBleDeviceBinding,
} from './bindings';
import { BleReleaseWatchdog } from './watchdog';

describe('BLE device bindings', () => {
  it('parses stored accessories and ignores duplicates', () => {
    const parsed = parseBleDeviceBindings([
      { id: 'aa', name: 'HB9800D', target: { kind: 'reply' } },
      { id: 'aa', name: 'dup' },
      { id: '', name: 'bad' },
      { id: 'bb', name: 'PTT-Z01', target: { kind: 'target', type: 'user', id: 9, label: 'beni' } },
    ]);
    expect(parsed.map((item) => item.id)).toEqual(['aa', 'bb']);
    expect(parsed[0]).toMatchObject({
      id: 'aa',
      name: 'HB9800D',
      kind: 'ble',
      target: { kind: 'reply' },
    });
    expect(parsed[1]?.target).toEqual({ kind: 'target', type: 'user', id: 9, label: 'beni' });
    expect(parsed[1]?.controls.ptt?.target).toEqual({
      kind: 'target',
      type: 'user',
      id: 9,
      label: 'beni',
    });
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

  it('stores independent targets per PTT button and locks SOS to Reply', () => {
    let bindings = upsertBleDeviceBinding([], { id: 'onboard', name: 'This phone', kind: 'onboard' });
    bindings = upsertBleDeviceBinding(bindings, {
      id: 'onboard',
      button: 'ptt',
      target: { kind: 'target', type: 'conference', id: 4, label: 'All' },
    });
    bindings = upsertBleDeviceBinding(bindings, {
      id: 'onboard',
      button: 'ptt2',
      target: { kind: 'target', type: 'user', id: 9, label: 'beni' },
    });
    bindings = upsertBleDeviceBinding(bindings, {
      id: 'onboard',
      button: 'sos',
      target: { kind: 'target', type: 'conference', id: 4, label: 'All' },
    });
    const phone = bindings[0];
    expect(bindingControlTarget(phone, 'ptt')).toEqual({
      kind: 'target',
      type: 'conference',
      id: 4,
      label: 'All',
    });
    expect(bindingControlTarget(phone, 'ptt2')).toEqual({
      kind: 'target',
      type: 'user',
      id: 9,
      label: 'beni',
    });
    expect(bindingControlTarget(phone, 'sos')).toEqual({ kind: 'reply' });
    expect(describeBindingTargets(phone!)).toContain('PTT 1 → All');
    expect(describeBindingTargets(phone!)).toContain('SOS → Reply');
  });

  it('refreshes saved accessory names without adding unpaired scan results', () => {
    const saved = parseBleDeviceBindings([{ id: 'aa', name: 'Old', target: { kind: 'reply' } }]);
    expect(
      mergeLiveBleDevices(saved, [
        { id: 'aa', name: 'HB9800D', kind: 'connected' },
        { id: 'bb', name: 'PTT-Z01', kind: 'connecting' },
      ]).map((item) => ({ id: item.id, name: item.name })),
    ).toEqual([{ id: 'aa', name: 'HB9800D' }]);
  });

  it('warns about saved accessories that are not connected, in plain words', () => {
    const two = parseBleDeviceBindings([
      { id: 'aa', name: 'Herda', target: { kind: 'reply' } },
      { id: 'bb', name: 'PTT-Z', target: { kind: 'reply' } },
    ]);
    const herdaUp = { id: 'aa', name: 'Herda', kind: 'connected' } as const;
    expect(missingAccessoryNotice([], [])).toBeNull();
    expect(missingAccessoryNotice(two, [herdaUp, { id: 'bb', kind: 'connected' }])).toBeNull();
    expect(missingAccessoryNotice(two, [herdaUp])).toBe('PTT-Z not connected');
    expect(missingAccessoryNotice(two, [herdaUp, { id: 'bb', kind: 'connecting' }])).toBe(
      'PTT-Z not connected · Reconnecting…',
    );
    expect(missingAccessoryNotice(two, [])).toBe('2 accessories not connected');
    expect(missingAccessoryNotice(two, [herdaUp], 'unavailable')).toBe(
      'Bluetooth unavailable · PTT-Z not connected',
    );
  });

  it('summarizes saved PTT accessories for the Settings row', () => {
    expect(describePttDevicesSummary([], [])).toBe('None');
    const herda = parseBleDeviceBindings([{ id: 'aa', name: 'Herda', target: { kind: 'reply' } }]);
    expect(describePttDevicesSummary(herda, [{ id: 'aa', name: 'Herda', kind: 'connected' }])).toBe(
      '1 connected',
    );
    const two = parseBleDeviceBindings([
      { id: 'aa', name: 'Herda', target: { kind: 'reply' } },
      { id: 'bb', name: 'PTT-Z01', target: { kind: 'reply' } },
    ]);
    expect(describePttDevicesSummary(two, [{ id: 'aa', name: 'Herda', kind: 'connected' }])).toBe(
      '1 of 2 connected',
    );
    const phone = parseBleDeviceBindings([{ id: 'onboard', name: 'This phone' }]);
    expect(describePttDevicesSummary(phone, [])).toBe('1 connected');
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
