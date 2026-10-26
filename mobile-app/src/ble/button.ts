import {
  talkActionForButtonPress,
  talkActionForButtonRelease,
  type BleTalkAction,
} from './policy';

export type BleButtonHandleOptions = {
  shortPressLocks: boolean;
  lockedToTarget?: boolean;
};

export class BleButtonPolicy {
  private pressedAtMs: number | null = null;
  private lastPressed: boolean | null = null;
  private unlockOnRelease = false;

  handle(
    pressed: boolean,
    options: BleButtonHandleOptions,
    nowMs = Date.now(),
  ): BleTalkAction | null {
    if (this.lastPressed === pressed) {
      return null;
    }
    if (!pressed && this.lastPressed !== true) {
      this.lastPressed = false;
      return null;
    }
    this.lastPressed = pressed;
    if (pressed) {
      this.pressedAtMs = nowMs;
      this.unlockOnRelease = Boolean(options.lockedToTarget);
      return talkActionForButtonPress({ lockedToTarget: options.lockedToTarget });
    }
    const pressedAtMs = this.pressedAtMs ?? nowMs;
    const unlockOnRelease = this.unlockOnRelease;
    this.pressedAtMs = null;
    this.unlockOnRelease = false;
    return talkActionForButtonRelease({
      pressedAtMs,
      releasedAtMs: nowMs,
      shortPressLocks: options.shortPressLocks,
      unlockOnRelease,
    });
  }

  isHeld(): boolean {
    return this.lastPressed === true;
  }

  reset(): void {
    this.pressedAtMs = null;
    this.lastPressed = null;
    this.unlockOnRelease = false;
  }
}
