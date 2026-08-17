// Ported from talktome-apple BluetoothButtonController @ 004d6e76 by Daniel Jocher.
// GATT map: service FFE0, characteristic FFE1, name PTT-Z01.
// Press bytes 0x01 / 0xAB, release 0x00 / 0xCD. Short press (<250ms) locks.

export const BLE_BUTTON_SERVICE_UUID = 'FFE0';
export const BLE_BUTTON_CHARACTERISTIC_UUID = 'FFE1';
export const BLE_BUTTON_EXPECTED_NAMES = ['PTT-Z01'] as const;
export const BLE_SHORT_PRESS_LOCK_MS = 250;

export type BleTalkAction = 'startTalk' | 'stopTalk' | 'lockTalk';

export function decodeButtonByte(byte: number): boolean | null {
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

export function talkActionForButtonPress(): BleTalkAction {
  return 'startTalk';
}

export function talkActionForButtonRelease(input: {
  pressedAtMs: number;
  releasedAtMs: number;
  shortPressLocks: boolean;
}): BleTalkAction {
  if (
    input.shortPressLocks &&
    input.releasedAtMs - input.pressedAtMs < BLE_SHORT_PRESS_LOCK_MS
  ) {
    return 'lockTalk';
  }
  return 'stopTalk';
}

export function matchesExpectedBleName(name: string | null | undefined): boolean {
  const normalized = name?.trim().toUpperCase();
  return Boolean(normalized && BLE_BUTTON_EXPECTED_NAMES.includes(normalized as (typeof BLE_BUTTON_EXPECTED_NAMES)[number]));
}
