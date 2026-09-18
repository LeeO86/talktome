import { useEffect } from 'react';
import { ActivityIndicator, Linking, SafeAreaView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { session, useSessionStore } from './src/session/store';
import { cameraTallyColor, TALLY_FRAME_WIDTH } from './src/protocol';
import { androidSafeArea } from './src/ui/androidSafeArea';
import { LoginScreen } from './src/ui/LoginScreen';
import { OperatorScreen } from './src/ui/OperatorScreen';
import { PausedScreen } from './src/ui/PausedScreen';
import { ProductionPickerScreen } from './src/ui/ProductionPickerScreen';
import { ProfilePickerScreen } from './src/ui/ProfilePickerScreen';
import { colors } from './src/ui/theme';

export default function App() {
  const hydrated = useSessionStore((state) => state.hydrated);
  const identity = useSessionStore((state) => state.identity);
  const operatorReady = useSessionStore((state) => state.operatorReady);
  const status = useSessionStore((state) => state.status);
  const paused = useSessionStore((state) => state.paused);
  const addingProfile = useSessionStore((state) => state.addingProfile);
  const profiles = useSessionStore((state) => state.profiles);
  const tallyColor = useSessionStore((state) => cameraTallyColor(state.cameraTally));

  useEffect(() => {
    void session.hydrate();
  }, []);

  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (url) {
        session.handleTalkUrl(url);
      }
    };
    const subscription = Linking.addEventListener('url', (event) => handleUrl(event.url));
    void Linking.getInitialURL().then(handleUrl);
    return () => subscription.remove();
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

  let body;
  if (!hydrated || (status === 'connecting' && !identity && !operatorReady && !addingProfile)) {
    body = <ActivityIndicator color={colors.accent} />;
  } else if (identity && operatorReady) {
    body = <OperatorScreen />;
  } else if (identity && status === 'choose-production') {
    body = <ProductionPickerScreen />;
  } else if (identity) {
    body = <ActivityIndicator color={colors.accent} />;
  } else if (paused) {
    body = <PausedScreen />;
  } else if (addingProfile || profiles.length === 0) {
    body = <LoginScreen />;
  } else {
    body = <ProfilePickerScreen />;
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={[styles.safe, androidSafeArea]}>
        <StatusBar style="light" />
        {body}
      </SafeAreaView>
      {identity && operatorReady && tallyColor ? (
        <View
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={[styles.tallyFrame, { borderColor: tallyColor, borderWidth: TALLY_FRAME_WIDTH }]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bgBottom,
  },
  safe: {
    flex: 1,
    backgroundColor: colors.bgBottom,
  },
  tallyFrame: {
    ...StyleSheet.absoluteFill,
    zIndex: 40,
  },
});
