import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTargetAnnouncements } from './targetAnnouncements';

function fixture() {
  const speak = vi.fn(async (_label: string) => true);
  const stop = vi.fn(async () => {});
  const unavailable = vi.fn();
  return { speak, stop, unavailable, announcements: createTargetAnnouncements(speak, stop, unavailable) };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('rotary target announcements', () => {
  it('reads only the final target after a burst of knob movement', async () => {
    const { speak, announcements } = fixture();
    announcements.schedule('Crew', () => true);
    await vi.advanceTimersByTimeAsync(150);
    announcements.schedule('Studio A', () => true);
    await vi.advanceTimersByTimeAsync(399);
    expect(speak).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(speak).toHaveBeenCalledExactlyOnceWith('Studio A');
  });

  it('drops a pending announcement when talk starts or the target is stale', async () => {
    const { speak, stop, announcements } = fixture();
    announcements.schedule('Crew', () => true);
    announcements.cancel();
    announcements.schedule('Studio A', () => false);
    await vi.advanceTimersByTimeAsync(400);
    expect(speak).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });

  it('lets PTT wait for the stop already requested by another knob turn', async () => {
    const { speak, stop, announcements } = fixture();
    let finish!: () => void;
    stop.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    announcements.schedule('Crew', () => true);
    await vi.advanceTimersByTimeAsync(400);
    announcements.schedule('Studio A', () => true);
    const cancelled = announcements.cancel();
    expect(cancelled).toBe(stop.mock.results[0]?.value);
    finish();
    await cancelled;
    await vi.advanceTimersByTimeAsync(400);
    expect(stop).toHaveBeenCalledOnce();
    expect(speak).toHaveBeenCalledExactlyOnceWith('Crew');
  });

  it('reports an unavailable device voice without stopping idle speech', async () => {
    const { speak, stop, unavailable, announcements } = fixture();
    speak.mockResolvedValue(false);
    announcements.schedule('Studio A', () => true);
    await vi.advanceTimersByTimeAsync(400);
    expect(unavailable).toHaveBeenCalledOnce();
    expect(announcements.cancel()).toBeUndefined();
    expect(stop).not.toHaveBeenCalled();
  });
});
