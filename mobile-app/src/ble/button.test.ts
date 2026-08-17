import { describe, expect, it } from 'vitest';

import { BleButtonPolicy } from './button';

describe('BleButtonPolicy', () => {
  it('ignores duplicate press events', () => {
    const policy = new BleButtonPolicy();
    expect(policy.handle(true, true, 1000)).toBe('startTalk');
    expect(policy.handle(true, true, 1010)).toBeNull();
  });

  it('locks a short press and releases a long one', () => {
    const shortPress = new BleButtonPolicy();
    expect(shortPress.handle(true, true, 1000)).toBe('startTalk');
    expect(shortPress.handle(false, true, 1200)).toBe('lockTalk');

    const longPress = new BleButtonPolicy();
    expect(longPress.handle(true, true, 1000)).toBe('startTalk');
    expect(longPress.handle(false, true, 1400)).toBe('stopTalk');
  });
});
