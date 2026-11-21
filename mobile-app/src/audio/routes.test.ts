import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  os: 'ios',
  hasSystemRoutePicker: vi.fn(() => true),
  selectAudioRoute: vi.fn(),
  currentAudioRoute: vi.fn(),
}));
vi.mock('react-native', () => ({ Platform: { get OS() { return native.os; } } }));
vi.mock('expo-modules-core', () => ({ requireNativeModule: () => native }));

import { emptyAudioRouteSnapshot, readAudioRouteSnapshot, restoreSavedAudioRoute, selectAudioRoute } from './routes';

function snapshot(currentId: string, ids = ['speaker', 'receiver', 'port:airpods']) {
  return {
    currentId,
    routes: ids.map(id => ({ id, label: id, kind: id === 'port:airpods' ? 'bluetooth' : id })),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  native.os = 'ios';
  native.selectAudioRoute.mockReset();
  native.currentAudioRoute.mockReset().mockReturnValue(snapshot('port:airpods'));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('audio route confirmation', () => {
  it('reports the actual native route, including a system-selected receiver', () => {
    native.currentAudioRoute.mockReturnValue(snapshot('receiver'));
    expect(readAudioRouteSnapshot().routes.find(route => route.id === 'receiver')?.selected).toBe(true);
    expect(emptyAudioRouteSnapshot().routes.map(route => route.id)).toEqual(['speaker']);
  });

  it('maps legacy iOS receiver requests to speaker without a false selection failure', async () => {
    native.selectAudioRoute.mockResolvedValue(snapshot('speaker'));
    expect((await selectAudioRoute('receiver')).currentId).toBe('speaker');
    expect(native.selectAudioRoute).toHaveBeenCalledWith('speaker');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not overwrite the iOS-selected headset with a saved Speaker preference', async () => {
    expect((await restoreSavedAudioRoute('speaker')).currentId).toBe('port:airpods');
    expect(native.selectAudioRoute).not.toHaveBeenCalled();
  });

  it('still restores a saved output on Android', async () => {
    native.os = 'android'; native.selectAudioRoute.mockResolvedValue(snapshot('speaker'));
    expect((await restoreSavedAudioRoute('speaker')).currentId).toBe('speaker');
    expect(native.selectAudioRoute).toHaveBeenCalledWith('speaker');
  });

  it('preserves receiver support on Android', async () => {
    native.os = 'android';
    native.selectAudioRoute.mockResolvedValue(snapshot('receiver'));
    expect(emptyAudioRouteSnapshot().routes.some(route => route.id === 'receiver')).toBe(true);
    expect((await selectAudioRoute('receiver')).currentId).toBe('receiver');
    expect(native.selectAudioRoute).toHaveBeenCalledWith('receiver');
  });

  it('returns an already confirmed route without a delay', async () => {
    native.selectAudioRoute.mockResolvedValue(snapshot('speaker'));
    expect((await selectAudioRoute('speaker')).currentId).toBe('speaker');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for the output to change after native selection acknowledges the preference', async () => {
    native.selectAudioRoute.mockResolvedValue(snapshot('port:airpods'));
    let completed = false;
    const pending = selectAudioRoute('speaker').then(value => { completed = true; return value; });
    await vi.advanceTimersByTimeAsync(300);
    expect(completed).toBe(false);
    native.currentAudioRoute.mockReturnValue(snapshot('speaker'));
    await vi.advanceTimersByTimeAsync(100);
    expect((await pending).currentId).toBe('speaker');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('returns the actual route after a timeout so genuine selection failure stays visible', async () => {
    native.selectAudioRoute.mockResolvedValue(snapshot('port:airpods'));
    const pending = selectAudioRoute('speaker');
    await vi.advanceTimersByTimeAsync(2000);
    expect((await pending).currentId).toBe('port:airpods');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not wait for a route which is unavailable', async () => {
    native.selectAudioRoute.mockResolvedValue(snapshot('speaker', ['speaker', 'receiver']));
    expect((await selectAudioRoute('port:missing')).currentId).toBe('speaker');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves an explicit native failure without delaying it', async () => {
    native.selectAudioRoute.mockResolvedValue(false);
    expect((await selectAudioRoute('speaker')).currentId).toBe('port:airpods');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('propagates native errors', async () => {
    native.selectAudioRoute.mockRejectedValue(new Error('Audio session unavailable'));
    await expect(selectAudioRoute('speaker')).rejects.toThrow('Audio session unavailable');
    expect(vi.getTimerCount()).toBe(0);
  });
});
