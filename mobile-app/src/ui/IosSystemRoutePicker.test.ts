import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ os: 'ios', load: vi.fn() }));
vi.mock('react-native', () => ({
  Platform: { get OS() { return native.os; } },
  StyleSheet: { absoluteFill: { position: 'absolute' } },
}));
vi.mock('expo-modules-core', () => ({ requireNativeViewManager: native.load }));

beforeEach(() => {
  vi.resetModules();
  native.os = 'ios';
  // Just like Expo, each factory call returns a different component type.
  native.load.mockReset().mockImplementation(() => function NativePicker() { return null; });
});

describe('iOS system route picker lifecycle', () => {
  it('retains the native component type across route-driven renders', async () => {
    const picker = await import('./IosSystemRoutePicker');
    const first = picker.IosSystemRoutePicker();
    const next = picker.IosSystemRoutePicker();
    expect(picker.iosSystemRoutePickerAvailable).toBe(true);
    expect(first?.type).toBe(next?.type);
    expect(native.load).toHaveBeenCalledTimes(1);
    expect(native.load).toHaveBeenCalledWith('TalkToMeAudioSession');
  });

  it('allows the fallback picker when the native view is unavailable', async () => {
    native.load.mockImplementation(() => { throw new Error('Native view unavailable'); });
    const picker = await import('./IosSystemRoutePicker');
    expect(picker.iosSystemRoutePickerAvailable).toBe(false);
    expect(picker.IosSystemRoutePicker()).toBeNull();
  });

  it('does not load an iOS native view on Android', async () => {
    native.os = 'android';
    const picker = await import('./IosSystemRoutePicker');
    expect(picker.iosSystemRoutePickerAvailable).toBe(false);
    expect(native.load).not.toHaveBeenCalled();
  });
});
