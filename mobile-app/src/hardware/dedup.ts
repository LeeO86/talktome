import { PTT_EVENT_DEDUP_MS, type PttEvent } from './events';

/** Drops a duplicate down/up for the same logical button across transports. */
export class PttEventDeduper {
  private readonly last = new Map<string, { pressed: boolean; at: number }>();

  constructor(private readonly windowMs = PTT_EVENT_DEDUP_MS) {}

  shouldDrop(event: PttEvent): boolean {
    const key = event.button;
    const previous = this.last.get(key);
    this.last.set(key, { pressed: event.pressed, at: event.timestamp });
    if (!previous) {
      return false;
    }
    return previous.pressed === event.pressed && event.timestamp - previous.at <= this.windowMs;
  }

  reset(): void {
    this.last.clear();
  }
}
