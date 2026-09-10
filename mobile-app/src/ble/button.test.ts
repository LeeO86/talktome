import { describe, expect, it } from 'vitest';

import { BleButtonPolicy } from './button';

const shortLock = { shortPressLocks: true };

describe('BleButtonPolicy', () => {
  it('ignores duplicate press events', () => {
    const policy = new BleButtonPolicy();
    expect(policy.handle(true, shortLock, 1000)).toBe('startTalk');
    expect(policy.handle(true, shortLock, 1010)).toBeNull();
  });

  it('locks a short press and releases a long one', () => {
    const shortPress = new BleButtonPolicy();
    expect(shortPress.handle(true, shortLock, 1000)).toBe('startTalk');
    expect(shortPress.handle(false, shortLock, 1200)).toBe('lockTalk');

    const longPress = new BleButtonPolicy();
    expect(longPress.handle(true, shortLock, 1000)).toBe('startTalk');
    expect(longPress.handle(false, shortLock, 1400)).toBe('stopTalk');
  });

  it('unlocks on a second short press instead of locking again', () => {
    const policy = new BleButtonPolicy();
    expect(policy.handle(true, shortLock, 1000)).toBe('startTalk');
    expect(policy.handle(false, shortLock, 1200)).toBe('lockTalk');

    expect(policy.handle(true, { shortPressLocks: true, lockedToTarget: true }, 2000)).toBeNull();
    expect(policy.handle(false, { shortPressLocks: true, lockedToTarget: true }, 2100)).toBe(
      'unlockTalk',
    );

    expect(policy.handle(true, shortLock, 3000)).toBe('startTalk');
    expect(policy.handle(false, shortLock, 3120)).toBe('lockTalk');
  });

  it('unlocks a locked target on long release as well', () => {
    const policy = new BleButtonPolicy();
    expect(policy.handle(true, { shortPressLocks: true, lockedToTarget: true }, 1000)).toBeNull();
    expect(policy.handle(false, { shortPressLocks: true, lockedToTarget: true }, 1400)).toBe(
      'unlockTalk',
    );
  });

  it('ignores a release when the accessory was not held', () => {
    const policy = new BleButtonPolicy();
    expect(policy.isHeld()).toBe(false);
    expect(policy.handle(false, shortLock, 1000)).toBeNull();
    expect(policy.handle(true, shortLock, 1100)).toBe('startTalk');
    expect(policy.isHeld()).toBe(true);
  });
});
