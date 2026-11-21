export class BleReleaseWatchdog {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly onForceRelease: () => void,
    public timeoutMs: number,
  ) {}

  notePressed(): void {
    this.clear();
    if (this.timeoutMs <= 0) {
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.onForceRelease();
    }, this.timeoutMs);
  }

  noteReleased(): void {
    this.clear();
  }

  clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
