import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ os: 'ios', picker: true }));
vi.mock('react-native', () => ({ Platform: { get OS() { return state.os; } },
  View: 'View', Pressable: 'Pressable', Text: 'Text', Modal: 'Modal', ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator',
  StyleSheet: { create: (x: object) => x, absoluteFill: {} } }));
vi.mock('../session/store', () => ({ session: {}, useSessionStore: (selector: (s: object) => unknown) =>
  selector({ audioRoutes: [{ id: 'port:airpods', label: 'AirPods', kind: 'bluetooth', selected: true }] }) }));
vi.mock('../audio/routes', () => ({ describeAudioRouteKind: () => 'Headset' }));
vi.mock('./IosSystemRoutePicker', () => ({
  get iosSystemRoutePickerAvailable() { return state.picker; },
  IosSystemRoutePicker: () => null,
}));
vi.mock('./icons', () => ({ SpeakerIcon: () => null, PhoneIcon: () => null, HeadphonesIcon: () => null }));
import { AudioRouteButton } from './AudioRouteButton';
import { IosSystemRoutePicker } from './IosSystemRoutePicker';
beforeEach(() => { state.os = 'ios'; state.picker = true; });
describe('operator audio output control', () => {
  it('opens the native iOS route picker, keeping the app menu out of the path', () => {
    const callback = vi.fn(), button = AudioRouteButton({ onPress: callback });
    expect(button.type).toBe('View');
    expect(button.props.children.type).toBe(IosSystemRoutePicker);
    expect(button.props.accessibilityElementsHidden).not.toBe(true);
    expect(callback).not.toHaveBeenCalled();
  });
  it('preserves the app menu on Android', () => {
    state.os = 'android'; const callback = vi.fn(), button = AudioRouteButton({ onPress: callback });
    expect(button.type).toBe('Pressable'); button.props.onPress(); expect(callback).toHaveBeenCalledOnce();
  });
  it('retains a fallback when the iOS native view is absent in a dev client', () => {
    state.picker = false; expect(AudioRouteButton({ onPress: vi.fn() }).type).toBe('Pressable');
  });
});
