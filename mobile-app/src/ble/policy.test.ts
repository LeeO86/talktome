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

  it('accepts the documented button name', () => {
    expect(matchesExpectedBleName('PTT-Z01')).toBe(true);
    expect(matchesExpectedBleName('ptt-z01')).toBe(true);
    expect(matchesExpectedBleName('Other')).toBe(false);
  });
});
