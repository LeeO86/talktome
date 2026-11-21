import { describe, expect, it } from 'vitest';

import {
  AccessoryNotifySession,
  SppTokenParser,
  decodeIntentAction,
  decodeTwoByteFrames,
  decodeUsbBytes,
  diffBleBitmask,
  looksLikeHardwareCommand,
  peekAccessoryNotify,
} from './codecs';
import { PttEventDeduper } from './dedup';
import { matchPttIntent } from './intents';
import { nextTalkableTarget, talkableAtKnob } from './rotary';

describe('BLE bitmask', () => {
  it('diffs simultaneous presses and releases', () => {
    expect(diffBleBitmask(0, 0x05)).toEqual([
      { button: 'ptt', pressed: true },
      { button: 'ptt2', pressed: true },
    ]);
    expect(diffBleBitmask(0x05, 0x04)).toEqual([{ button: 'ptt', pressed: false }]);
    expect(diffBleBitmask(0x04, 0)).toEqual([{ button: 'ptt2', pressed: false }]);
  });

  it('tracks SOS and channel bits on an accessory notify session', () => {
    const session = new AccessoryNotifySession();
    expect(
      session.apply([0x03], { codec: 'auto' }, { source: 'ble', deviceId: 'aa', timestamp: 1 }).map((item) => ({
        button: item.button,
        pressed: item.pressed,
      })),
    ).toEqual([
      { button: 'ptt', pressed: true },
      { button: 'sos', pressed: true },
    ]);
    expect(
      session
        .apply([0x13], { codec: 'auto' }, { source: 'ble', deviceId: 'aa', timestamp: 2 })
        .map((item) => item.button),
    ).toEqual(['channelUp']);
    expect(
      session.reset({ source: 'ble', deviceId: 'aa', timestamp: 3 }).map((item) => ({
        button: item.button,
        pressed: item.pressed,
      })),
    ).toEqual([
      { button: 'ptt', pressed: false },
      { button: 'sos', pressed: false },
      { button: 'channelUp', pressed: false },
    ]);
  });
});

describe('two-byte USB / BLE frames', () => {
  it('uses parity for press, not 0/1 equality, and ignores volume', () => {
    expect(decodeTwoByteFrames([0x46, 0x03])).toEqual([{ button: 'ptt', pressed: true }]);
    expect(decodeTwoByteFrames([0x46, 0x02])).toEqual([{ button: 'ptt', pressed: false }]);
    expect(decodeTwoByteFrames([0x45, 0x01])).toEqual([{ button: 'sos', pressed: true }]);
    expect(decodeTwoByteFrames([0x56, 0x01])).toEqual([]);
    expect(decodeUsbBytes([0x66, 0x01, 0x43, 0x01], { source: 'usb', timestamp: 1 }).map((item) => item.button)).toEqual(
      ['ptt2', 'channelUp'],
    );
  });
});

describe('SPP ASCII tokens', () => {
  it('parses concatenated events without relying on newlines', () => {
    const parser = new SppTokenParser();
    const events = parser.push('+PTTS=P+PTTS=R\nbattery=80+PTTE=P', {
      source: 'spp',
      deviceId: 'spp:aa',
      timestamp: 1,
    });
    expect(events.map((item) => `${item.button}:${item.pressed}`)).toEqual([
      'ptt:true',
      'ptt:false',
      'sos:true',
    ]);
  });
});

describe('broadcast intents', () => {
  it('maps Zello PTT, SOS, extras, and the channel knob extra', () => {
    expect(matchPttIntent('com.zello.ptt.down')).toEqual({ button: 'ptt', pressed: true });
    expect(matchPttIntent('com.zello.intent.buttonSOS.up')).toEqual({ button: 'sos', pressed: false });
    expect(matchPttIntent('com.zello.intent.channelUp')).toEqual({ button: 'channelUp', pressed: true });
    expect(
      matchPttIntent('com.zello.intent.setChannel', { 'com.zello.extra.channel': 3 }),
    ).toEqual({ button: 'setChannel', pressed: true, channel: 3 });
    expect(
      decodeIntentAction('com.ruggear.ptt.down', null, { deviceId: 'onboard', timestamp: 1 })[0]?.button,
    ).toBe('ptt');
  });
});

describe('notify peek / pairing', () => {
  it('treats SOS-only bitmask and HM-10 bytes as bindable commands', () => {
    expect(looksLikeHardwareCommand([0x02])).toBe(true);
    expect(looksLikeHardwareCommand([0xab], { codec: 'hm10-byte' })).toBe(true);
    expect(looksLikeHardwareCommand([0x56, 0x01])).toBe(false);
    expect(peekAccessoryNotify([0x10]).map((item) => item.button)).toEqual(['channelUp']);
  });
});

describe('cross-transport dedup', () => {
  it('drops the same logical button within 150 ms and keeps a later press', () => {
    const dedup = new PttEventDeduper(150);
    const down = {
      button: 'ptt' as const,
      pressed: true,
      source: 'intent' as const,
      timestamp: 1000,
    };
    expect(dedup.shouldDrop(down)).toBe(false);
    expect(dedup.shouldDrop({ ...down, source: 'ble', timestamp: 1100 })).toBe(true);
    expect(dedup.shouldDrop({ ...down, pressed: false, timestamp: 1200 })).toBe(false);
  });
});

describe('rotary / up-down targeting', () => {
  const all = { type: 'conference' as const, id: 4, label: 'All', canTalk: true };
  const beni = { type: 'user' as const, id: 9, label: 'beni', canTalk: true };
  const cam = { type: 'user' as const, id: 2, label: 'cam', canTalk: true };

  it('cycles wrap-around and maps 1-based knob positions', () => {
    expect(nextTalkableTarget([all, beni, cam], beni, 1)?.label).toBe('cam');
    expect(nextTalkableTarget([all, beni, cam], cam, 1)?.label).toBe('All');
    expect(nextTalkableTarget([all, beni, cam], all, -1)?.label).toBe('cam');
    expect(talkableAtKnob([all, beni, cam], 1)?.label).toBe('All');
    expect(talkableAtKnob([all, beni, cam], 2)?.label).toBe('beni');
    expect(talkableAtKnob([all, beni, cam], 0)?.label).toBe('All');
    expect(talkableAtKnob([all, beni, cam], 9)?.label).toBe('cam');
  });
});
