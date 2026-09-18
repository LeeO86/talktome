import {
  type PttButton,
  type PttEvent,
  type PttTransport,
  isTalkButton,
} from './events';
import { matchPttIntent } from './intents';

type CodecProfile = { codec: 'hm10-byte' | 'zello-two-byte' | 'auto' };

export const BLE_MASK_BITS: readonly { bit: number; button: PttButton }[] = [
  { bit: 0x01, button: 'ptt' },
  { bit: 0x02, button: 'sos' },
  { bit: 0x04, button: 'ptt2' },
  { bit: 0x08, button: 'channelDown' },
  { bit: 0x10, button: 'channelUp' },
];

export const USB_KEYCODE_BUTTONS: Readonly<Record<number, PttButton>> = {
  0x01: 'ptt',
  0x04: 'ptt2',
  0x46: 'ptt',
  0x66: 'ptt2',
  0x45: 'sos',
  0x43: 'channelUp',
  0x44: 'channelDown',
  0x42: 'replay',
  0x4d: 'multi',
  0x67: 'statusToggle',
  0x68: 'selectionMode',
};

export const USB_VOLUME_KEYCODE = 0x56;

export const SPP_TOKENS: readonly { token: string; button: PttButton; pressed: boolean }[] = [
  { token: '+PTTS=P', button: 'ptt', pressed: true },
  { token: '+PTTS=R', button: 'ptt', pressed: false },
  { token: '+PTTB1=P', button: 'channelDown', pressed: true },
  { token: '+PTTB1=R', button: 'channelDown', pressed: false },
  { token: '+PTTB2=P', button: 'channelUp', pressed: true },
  { token: '+PTTB2=R', button: 'channelUp', pressed: false },
  { token: '+PTTE=P', button: 'sos', pressed: true },
  { token: '+PTTE=R', button: 'sos', pressed: false },
];

export type PttFrame = {
  button: PttButton;
  pressed: boolean;
  channel?: number;
};

function frame(button: PttButton, pressed: boolean, channel?: number): PttFrame {
  return channel == null ? { button, pressed } : { button, pressed, channel };
}

export function decodeHm10Byte(byte: number): boolean | null {
  switch (byte & 0xff) {
    case 0x01:
    case 0xab:
      return true;
    case 0x00:
    case 0xcd:
      return false;
    default:
      return null;
  }
}

export function decodeTwoByteFrames(bytes: readonly number[]): PttFrame[] {
  if (bytes.length < 2) {
    return [];
  }
  const keycode = bytes[0];
  const state = bytes[1];
  if (keycode == null || state == null) {
    return [];
  }
  const key = keycode & 0xff;
  const value = state & 0xff;
  if (key === USB_VOLUME_KEYCODE) {
    return [];
  }
  const button = USB_KEYCODE_BUTTONS[key];
  if (!button) {
    return [];
  }
  return [frame(button, (value & 1) === 1)];
}

export function decodeZelloTwoByte(
  bytes: readonly number[],
  pttKeycodes: readonly number[] = [0x01, 0x04, 0x46, 0x66],
): boolean | null {
  if (bytes.length < 2) {
    return null;
  }
  const keycode = bytes[0];
  const state = bytes[1];
  if (keycode == null || state == null) {
    return null;
  }
  const key = keycode & 0xff;
  const value = state & 0xff;
  if (key === USB_VOLUME_KEYCODE) {
    return null;
  }
  if (!pttKeycodes.includes(key)) {
    return null;
  }
  return (value & 1) === 1;
}

export function bitmaskFrames(mask: number): PttFrame[] {
  const value = mask & 0x1f;
  if (value === 0) {
    return [frame('ptt', false)];
  }
  return BLE_MASK_BITS.filter((item) => (value & item.bit) !== 0).map((item) =>
    frame(item.button, true),
  );
}

export function diffBleBitmask(previous: number, current: number): PttFrame[] {
  const prev = previous & 0x1f;
  const next = current & 0x1f;
  const changed = prev ^ next;
  if (changed === 0) {
    return [];
  }
  const frames: PttFrame[] = [];
  for (const item of BLE_MASK_BITS) {
    if ((changed & item.bit) === 0) {
      continue;
    }
    frames.push(frame(item.button, (next & item.bit) !== 0));
  }
  return frames;
}

export function peekAccessoryNotify(
  bytes: readonly number[],
  profile: CodecProfile = { codec: 'auto' },
): PttFrame[] {
  if (bytes.length === 0) {
    return [];
  }
  const first = bytes[0];
  if (first == null) {
    return [];
  }
  if (profile.codec === 'hm10-byte') {
    const pressed = decodeHm10Byte(first);
    return pressed == null ? [] : [frame('ptt', pressed)];
  }
  if (profile.codec === 'zello-two-byte') {
    return decodeTwoByteFrames(bytes);
  }
  if (bytes.length >= 2) {
    const two = decodeTwoByteFrames(bytes);
    if (two.length > 0) {
      return two;
    }
  }
  const hm10Exclusive = decodeHm10Byte(first);
  if (hm10Exclusive != null && (first === 0xab || first === 0xcd)) {
    return [frame('ptt', hm10Exclusive)];
  }
  if ((first & 0xff) <= 0x1f) {
    return bitmaskFrames(first);
  }
  if (hm10Exclusive != null) {
    return [frame('ptt', hm10Exclusive)];
  }
  return [];
}

export function looksLikeHardwareCommand(
  bytes: readonly number[],
  profile: CodecProfile = { codec: 'auto' },
): boolean {
  return peekAccessoryNotify(bytes, profile).length > 0;
}

type EventMeta = {
  source: PttTransport;
  deviceId?: string;
  deviceName?: string;
  timestamp?: number;
  raw?: string;
};

function toEvents(frames: PttFrame[], meta: EventMeta): PttEvent[] {
  const timestamp = meta.timestamp ?? Date.now();
  return frames.map((item) => ({
    ...item,
    source: meta.source,
    deviceId: meta.deviceId,
    deviceName: meta.deviceName,
    timestamp,
    raw: meta.raw,
  }));
}

/** Stateful BLE notify decoder. Bitmask frames XOR against the previous mask. */
export class AccessoryNotifySession {
  private mask = 0;
  private usedBitmask = false;

  apply(bytes: readonly number[], profile: CodecProfile, meta: EventMeta): PttEvent[] {
    if (bytes.length === 0) {
      return [];
    }
    const first = bytes[0];
    if (first == null) {
      return [];
    }

    if (profile.codec === 'hm10-byte') {
      const pressed = decodeHm10Byte(first);
      return pressed == null ? [] : toEvents([frame('ptt', pressed)], meta);
    }
    if (profile.codec === 'zello-two-byte') {
      return toEvents(decodeTwoByteFrames(bytes), meta);
    }
    if (bytes.length >= 2) {
      const two = decodeTwoByteFrames(bytes);
      if (two.length > 0) {
        return toEvents(two, meta);
      }
    }
    if (first === 0xab || first === 0xcd) {
      const pressed = decodeHm10Byte(first);
      return pressed == null ? [] : toEvents([frame('ptt', pressed)], meta);
    }
    if ((first & 0xff) <= 0x1f) {
      const current = first & 0x1f;
      const frames = this.usedBitmask ? diffBleBitmask(this.mask, current) : diffBleBitmask(0, current);
      this.mask = current;
      this.usedBitmask = true;
      return toEvents(frames, meta);
    }
    const hm10 = decodeHm10Byte(first);
    return hm10 == null ? [] : toEvents([frame('ptt', hm10)], meta);
  }

  reset(meta: EventMeta): PttEvent[] {
    if (!this.usedBitmask || this.mask === 0) {
      this.mask = 0;
      this.usedBitmask = false;
      return [];
    }
    const frames = diffBleBitmask(this.mask, 0);
    this.mask = 0;
    this.usedBitmask = false;
    return toEvents(frames, meta);
  }
}

export class SppTokenParser {
  private buffer = '';

  push(chunk: string, meta: EventMeta): PttEvent[] {
    this.buffer += chunk;
    const frames: PttFrame[] = [];
    let progressed = true;
    while (progressed) {
      progressed = false;
      let best: { index: number; token: (typeof SPP_TOKENS)[number] } | null = null;
      for (const token of SPP_TOKENS) {
        const index = this.buffer.indexOf(token.token);
        if (index < 0) {
          continue;
        }
        if (!best || index < best.index) {
          best = { index, token };
        }
      }
      if (!best) {
        break;
      }
      this.buffer = this.buffer.slice(best.index + best.token.token.length);
      frames.push(frame(best.token.button, best.token.pressed));
      progressed = true;
    }
    if (this.buffer.length > 96) {
      this.buffer = this.buffer.slice(-48);
    }
    return toEvents(frames, { ...meta, raw: chunk });
  }

  reset(): void {
    this.buffer = '';
  }
}

export function decodeUsbBytes(bytes: readonly number[], meta: EventMeta): PttEvent[] {
  if (bytes.length < 2) {
    return [];
  }
  const frames: PttFrame[] = [];
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    frames.push(...decodeTwoByteFrames(bytes.slice(index, index + 2)));
  }
  return toEvents(frames, meta);
}

export function decodeIntentAction(
  action: string,
  extras: Record<string, unknown> | null | undefined,
  meta: Omit<EventMeta, 'source'>,
): PttEvent[] {
  const matched = matchPttIntent(action, extras);
  if (!matched) {
    return [];
  }
  return toEvents([frame(matched.button, matched.pressed, matched.channel)], {
    ...meta,
    source: 'intent',
    raw: action,
  });
}

export function talkPressedFromFrames(frames: PttFrame[]): boolean | null {
  const talk = frames.find((item) => isTalkButton(item.button) && item.button !== 'sos');
  if (talk) {
    return talk.pressed;
  }
  if (frames.length === 0) {
    return null;
  }
  return frames[0]?.pressed ?? null;
}
