import {
  talkActionForButtonPress,
  talkActionForButtonRelease,
  type BleTalkAction,
} from './policy';

export class BleButtonPolicy {
  private pressedAtMs: number | null = null;
  private lastPressed: boolean | null = null;

  handle(pressed: boolean, shortPressLocks: boolean, nowMs = Date.now()): BleTalkAction | null {
    if (this.lastPressed === pressed) {
      return null;
    }
    this.lastPressed = pressed;
    if (pressed) {
      this.pressedAtMs = nowMs;
      return talkActionForButtonPress();
    }
    const pressedAtMs = this.pressedAtMs ?? nowMs;
    this.pressedAtMs = null;
    return talkActionForButtonRelease({
      pressedAtMs,
      releasedAtMs: nowMs,
      shortPressLocks,
    });
  }

  reset(): void {
    this.pressedAtMs = null;
    this.lastPressed = null;
  }
}
