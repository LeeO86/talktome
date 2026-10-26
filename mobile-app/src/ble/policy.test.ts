import { describe, expect, it } from 'vitest';

import {
  decodeButtonByte,
  matchesExpectedBleName,
  talkActionForButtonPress,
  talkActionForButtonRelease,
} from './policy';

describe('BLE button policy', () => {
  it('decodes the PTT-Z01 press and release bytes', () => {
    expect(decodeButtonByte(0x01)).toBe(true);
    expect(decodeButtonByte(0xab)).toBe(true);
    expect(decodeButtonByte(0x00)).toBe(false);
    expect(decodeButtonByte(0xcd)).toBe(false);
    expect(decodeButtonByte(0x02)).toBeNull();
  });

  it('starts talk on press', () => {
    expect(talkActionForButtonPress()).toBe('startTalk');
    expect(talkActionForButtonPress({ lockedToTarget: false })).toBe('startTalk');
  });

  it('does not start talk again while already locked to the BLE target', () => {
    expect(talkActionForButtonPress({ lockedToTarget: true })).toBeNull();
  });

  it('locks on a short press when the setting is on', () => {
    expect(
      talkActionForButtonRelease({
        pressedAtMs: 1000,
        releasedAtMs: 1200,
        shortPressLocks: true,
      }),
    ).toBe('lockTalk');
  });

  it('releases a long press even when short-press lock is on', () => {
    expect(
      talkActionForButtonRelease({
        pressedAtMs: 1000,
        releasedAtMs: 1400,
        shortPressLocks: true,
      }),
    ).toBe('stopTalk');
  });

  it('is momentary when short-press lock is off', () => {
    expect(
      talkActionForButtonRelease({
        pressedAtMs: 1000,
        releasedAtMs: 1100,
        shortPressLocks: false,
      }),
    ).toBe('stopTalk');
  });

  it('unlocks on release when the press was already locked to that target', () => {
    expect(
      talkActionForButtonRelease({
        pressedAtMs: 1000,
        releasedAtMs: 1100,
        shortPressLocks: true,
        unlockOnRelease: true,
      }),
    ).toBe('unlockTalk');
    expect(
      talkActionForButtonRelease({
        pressedAtMs: 1000,
        releasedAtMs: 1400,
        shortPressLocks: true,
        unlockOnRelease: true,
      }),
    ).toBe('unlockTalk');
  });

  it('accepts the documented button name', () => {
    expect(matchesExpectedBleName('PTT-Z01')).toBe(true);
    expect(matchesExpectedBleName('ptt-z01')).toBe(true);
    expect(matchesExpectedBleName('Other')).toBe(false);
  });
});
