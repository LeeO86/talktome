import { useEffect } from 'react';
import { ActivityIndicator, SafeAreaView, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { session, useSessionStore } from './src/session/store';
import { LoginScreen } from './src/ui/LoginScreen';
import { OperatorScreen } from './src/ui/OperatorScreen';
import { ProductionPickerScreen } from './src/ui/ProductionPickerScreen';
import { colors } from './src/ui/theme';

export default function App() {
  const hydrated = useSessionStore((state) => state.hydrated);
  const identity = useSessionStore((state) => state.identity);
  const operatorReady = useSessionStore((state) => state.operatorReady);
  const status = useSessionStore((state) => state.status);

  useEffect(() => {
    void session.hydrate();
  }, []);

  useEffect(() => {
    if (identity) {
      void activateKeepAwakeAsync('talktome-session');
      return () => {
        void deactivateKeepAwake('talktome-session');
      };
    }
    return undefined;
  }, [identity]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      {!hydrated ? (
        <ActivityIndicator color={colors.accent} />
      ) : !identity ? (
        <LoginScreen />
      ) : operatorReady ? (
        <OperatorScreen />
      ) : status === 'choose-production' ? (
        <ProductionPickerScreen />
      ) : (
        <ActivityIndicator color={colors.accent} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgBottom,
  },
});
