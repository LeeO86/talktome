import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTargetAnnouncements } from './targetAnnouncements';

function fixture() {
  const speak = vi.fn(async (_label: string, _volume: number) => true);
  const stop = vi.fn(async () => {});
  const unavailable = vi.fn();
  return { speak, stop, unavailable, announcements: createTargetAnnouncements(speak, stop, unavailable) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('rotary target announcements', () => {
  it('reads only the final target after a burst of knob movement', async () => {
    const { speak, announcements } = fixture();
    announcements.schedule('Crew', 1, () => true);
    await vi.advanceTimersByTimeAsync(150);
    announcements.schedule('Studio A', 0.32, () => true);
    await vi.advanceTimersByTimeAsync(399);
    expect(speak).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(speak).toHaveBeenCalledExactlyOnceWith('Studio A', 0.32);
  });

  it('drops a pending announcement when talk starts or the target is stale', async () => {
    const { speak, stop, announcements } = fixture();
    announcements.schedule('Crew', 1, () => true);
    announcements.cancel();
    announcements.schedule('Studio A', 0.32, () => false);
    await vi.advanceTimersByTimeAsync(400);
    expect(speak).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });

  it('lets PTT wait for the stop already requested by another knob turn', async () => {
    const { speak, stop, announcements } = fixture();
    let finish!: () => void;
    stop.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    announcements.schedule('Crew', 1, () => true);
    await vi.advanceTimersByTimeAsync(400);
    announcements.schedule('Studio A', 0.32, () => true);
    const cancelled = announcements.cancel();
    expect(cancelled).toBe(stop.mock.results[0]?.value);
    finish();
    await cancelled;
    await vi.advanceTimersByTimeAsync(400);
    expect(stop).toHaveBeenCalledOnce();
    expect(speak).toHaveBeenCalledExactlyOnceWith('Crew', 1);
  });

  it('skips synthesis with a silent announcement volume', async () => {
    const { speak, unavailable, announcements } = fixture();
    announcements.schedule('Studio A', 0, () => true);
    await vi.advanceTimersByTimeAsync(400);
    expect(speak).not.toHaveBeenCalled();
    expect(unavailable).not.toHaveBeenCalled();
  });

  it('revalidates the target when the native settle timer expires without a JS timer tick', () => {
    const { speak, stop, unavailable } = fixture();
    const canSpeak = vi.fn(() => true);
    let elapsed: (() => void) | undefined;
    const scheduleNativeDelay = vi.fn((_delayMs: number, run: () => void) => {
      elapsed = run;
      return () => { elapsed = undefined; };
    });
    const announcements = createTargetAnnouncements(speak, stop, unavailable, scheduleNativeDelay);
    announcements.schedule('Crew', 0.4, canSpeak);
    expect(scheduleNativeDelay).toHaveBeenCalledWith(400, expect.any(Function));
    expect(speak).not.toHaveBeenCalled();
    elapsed?.();
    expect(speak).toHaveBeenCalledExactlyOnceWith('Crew', 0.4);

    announcements.schedule('Studio A', 0.4, canSpeak);
    canSpeak.mockReturnValue(false);
    elapsed?.();
    expect(speak).toHaveBeenCalledOnce();
  });

  it('reports an unavailable device voice without stopping idle speech', async () => {
    const { speak, stop, unavailable, announcements } = fixture();
    speak.mockResolvedValue(false);
    announcements.schedule('Studio A', 0.32, () => true);
    await vi.advanceTimersByTimeAsync(400);
    expect(unavailable).toHaveBeenCalledOnce();
    expect(announcements.cancel()).toBeUndefined();
    expect(stop).not.toHaveBeenCalled();
  });
});
