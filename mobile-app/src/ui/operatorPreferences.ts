import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export type LayoutDensity = 'auto' | 'standard' | 'compact';
export type TopBarPreference = 'auto' | 'shown' | 'hidden';
type Preferences = { density: LayoutDensity; topBar: TopBarPreference };

const storageKey = 'talktome.operator-layout';
export const useOperatorPreferences = create<Preferences>(() => ({ density: 'auto', topBar: 'auto' }));
let loading: Promise<void> | undefined;
let saving = Promise.resolve();

export function loadOperatorPreferences(): Promise<void> {
  return loading ??= (async () => {
    try {
      const stored = JSON.parse(await AsyncStorage.getItem(storageKey) ?? '{}');
      const current = useOperatorPreferences.getState();
      useOperatorPreferences.setState({
        density: current.density === 'auto' && ['standard', 'compact'].includes(stored.density) ? stored.density : current.density,
        topBar: current.topBar === 'auto' && ['shown', 'hidden'].includes(stored.topBar) ? stored.topBar : current.topBar,
      });
    } catch { /* Keep automatic layout if storage is unavailable. */ }
  })();
}

export function saveOperatorPreferences(change: Partial<Preferences>): void {
  void loadOperatorPreferences().then(() => {
    useOperatorPreferences.setState(change);
    const value = JSON.stringify(useOperatorPreferences.getState());
    saving = saving.catch(() => {}).then(() => AsyncStorage.setItem(storageKey, value));
    void saving.catch(() => {});
  });
}
