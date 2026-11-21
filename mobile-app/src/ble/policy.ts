// Ported from talktome-apple BluetoothButtonController @ 004d6e76 by Daniel Jocher.
// GATT maps live in catalog.ts. Press/release policy (short-press lock) stays here.

export {
  BLE_BUTTON_CHARACTERISTIC_UUID,
  BLE_BUTTON_EXPECTED_NAMES,
  BLE_BUTTON_SERVICE_UUID,
  BLE_SHORT_PRESS_LOCK_MS,
  decodeButtonByte,
  matchesExpectedBleName,
} from './catalog';
import { BLE_SHORT_PRESS_LOCK_MS } from './catalog';

export type BleTalkAction = 'startTalk' | 'stopTalk' | 'lockTalk' | 'unlockTalk';

export function talkActionForButtonPress(input?: { lockedToTarget?: boolean }): BleTalkAction | null {
  if (input?.lockedToTarget) {
    return null;
  }
  return 'startTalk';
}

export function talkActionForButtonRelease(input: {
  pressedAtMs: number;
  releasedAtMs: number;
  shortPressLocks: boolean;
  unlockOnRelease?: boolean;
}): BleTalkAction {
  if (input.unlockOnRelease) {
    return 'unlockTalk';
  }
  if (
    input.shortPressLocks &&
    input.releasedAtMs - input.pressedAtMs < BLE_SHORT_PRESS_LOCK_MS
  ) {
    return 'lockTalk';
  }
  return 'stopTalk';
}
