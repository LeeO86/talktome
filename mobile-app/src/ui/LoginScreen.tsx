import { useEffect, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { SessionConflictError, TlsUntrustedError } from '../auth/errors';
import { formatFingerprint } from '../servers/fingerprint';
import { session, useSessionStore } from '../session/store';
import { colors } from './theme';

export function LoginScreen() {
  const store = useSessionStore();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const guest = store.loginOptions?.guestLogin;
  const canGoBack = store.profiles.length > 0;

  useEffect(() => {
    if (store.hydrated) {
      setPassword((current) => current || session.rememberedPassword());
    }
  }, [store.hydrated]);

  useEffect(() => {
    if (store.serverAddress.trim()) {
      const handle = setTimeout(() => {
        void session.refreshLoginOptions(store.serverAddress);
      }, 400);
      return () => clearTimeout(handle);
    }
    return undefined;
  }, [store.serverAddress]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      if (error instanceof SessionConflictError) {
        useSessionStore.setState({
          status: 'idle',
          conflictName: error.existing?.name ?? store.username,
          error: null,
        });
      } else if (error instanceof TlsUntrustedError && store.pendingCertificate) {
        useSessionStore.setState({ status: 'idle' });
      } else {
        useSessionStore.setState({
          status: 'idle',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const submit = (force = false) =>
    run(() =>
      session.login({
        serverAddress: store.serverAddress,
        username: store.username,
        password,
        rememberPassword: store.rememberPassword,
        force,
      }),
    );

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {canGoBack ? (
          <Pressable accessibilityRole="button" onPress={() => session.cancelAddProfile()} style={styles.back}>
            <Text style={styles.backText}>Profiles</Text>
          </Pressable>
        ) : null}
        <View style={styles.intro}>
          <View style={styles.brandRow}>
            <Image source={require('../../assets/talktome-mark.png')} style={styles.brandIcon} />
            <Text style={styles.brand}>talktome</Text>
          </View>
          <Text style={styles.subtitle}>Connect to the talktome server.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Server</Text>
          <TextInput
            accessibilityLabel="Server"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://intercom.local"
            placeholderTextColor="#8A8F99"
            style={styles.input}
            value={store.serverAddress}
            onChangeText={(value) => store.setField('serverAddress', value)}
          />

          <Text style={styles.label}>Username</Text>
          <TextInput
            accessibilityLabel="Username"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Username"
            placeholderTextColor="#8A8F99"
            style={styles.input}
            value={store.username}
            onChangeText={(value) => store.setField('username', value)}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            accessibilityLabel="Password"
            secureTextEntry
            placeholder="Password"
            placeholderTextColor="#8A8F99"
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => void submit()}
          />

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Remember password</Text>
            <Switch
              value={store.rememberPassword}
              onValueChange={(value) => store.setField('rememberPassword', value)}
              trackColor={{ true: colors.accent }}
            />
          </View>

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Allow self-signed local TLS</Text>
            <Switch
              value={store.allowInsecureLocalTLS}
              onValueChange={(value) => store.setField('allowInsecureLocalTLS', value)}
              trackColor={{ true: colors.accent }}
            />
          </View>
          <Text style={styles.hint}>
            When a local certificate is not in the system store, TalkToMe can pin its SHA-256
            fingerprint. This never disables TLS checks for every host.
          </Text>

          {store.pendingCertificate ? (
            <View style={styles.trust}>
              <Text style={styles.trustTitle}>Trust this certificate?</Text>
              <Text style={styles.trustBody}>{store.pendingCertificate.hostname}</Text>
              <Text style={styles.fingerprint}>
                SHA-256 {formatFingerprint(store.pendingCertificate.sha256)}
              </Text>
              {store.pendingCertificate.issuer ? (
                <Text style={styles.trustBody}>{store.pendingCertificate.issuer}</Text>
              ) : null}
              <Pressable
                style={styles.takeOver}
                onPress={() => void run(() => session.acceptCertificateAndRetry('user'))}
                disabled={busy}
                accessibilityRole="button"
              >
                <Text style={styles.takeOverText}>{busy ? 'Trusting…' : 'Trust and continue'}</Text>
              </Pressable>
            </View>
          ) : null}

          {store.conflictName ? (
            <View style={styles.conflict}>
              <Text style={styles.conflictTitle}>User already signed in</Text>
              <Text style={styles.conflictBody}>
                This user is already signed in on another session ({store.conflictName}). You can
                disconnect that session and take it over.
              </Text>
              <Pressable
                style={styles.takeOver}
                onPress={() => void submit(true)}
                disabled={busy}
                accessibilityRole="button"
              >
                <Text style={styles.takeOverText}>
                  {busy ? 'Taking over...' : 'Take over other session'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {store.error ? <Text style={styles.error}>{store.error}</Text> : null}
          {store.statusMessage ? <Text style={styles.status}>{store.statusMessage}</Text> : null}
        </View>
      </ScrollView>

      <View style={styles.actions}>
        {guest?.enabled ? (
          <Pressable
            accessibilityRole="button"
            style={[styles.guest, busy && styles.buttonDisabled]}
            onPress={() =>
              void run(() =>
                session.loginGuest({
                  serverAddress: store.serverAddress,
                  displayName: store.username,
                }),
              )
            }
            disabled={busy}
          >
            <Text style={styles.guestText}>
              {busy ? 'Signing in…' : `Continue as ${guest.label || 'Guest'}`}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          style={[styles.signIn, busy && styles.buttonDisabled]}
          onPress={() => void submit()}
          disabled={busy}
        >
          <Text style={styles.signInText}>{busy ? 'Signing in…' : 'Sign In'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
  },
  scroll: {
    paddingBottom: 16,
  },
  back: {
    alignSelf: 'flex-start',
    marginBottom: 12,
    paddingVertical: 6,
  },
  backText: {
    color: colors.accent,
    fontWeight: '600',
    fontSize: 16,
  },
  intro: {
    marginTop: 4,
    marginBottom: 16,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
  },
  brand: {
    color: colors.text,
    fontSize: 34,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.muted,
    marginTop: 6,
    fontSize: 16,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
  },
  label: {
    color: colors.muted,
    marginBottom: 6,
    marginTop: 10,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    color: '#111318',
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  toggleLabel: {
    color: colors.text,
    flex: 1,
    paddingRight: 12,
  },
  hint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 10,
  },
  trust: {
    marginTop: 16,
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(61,214,245,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(61,214,245,0.34)',
  },
  trustTitle: {
    color: colors.text,
    fontWeight: '700',
  },
  trustBody: {
    color: colors.muted,
    marginTop: 8,
    fontSize: 13,
  },
  fingerprint: {
    color: colors.text,
    marginTop: 8,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  conflict: {
    marginTop: 16,
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(255,120,71,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,120,71,0.34)',
  },
  conflictTitle: {
    color: colors.text,
    fontWeight: '700',
  },
  conflictBody: {
    color: colors.muted,
    marginTop: 8,
    fontSize: 13,
  },
  takeOver: {
    marginTop: 12,
    backgroundColor: '#FF7847',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  takeOverText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  error: {
    color: colors.danger,
    marginTop: 12,
  },
  status: {
    color: colors.muted,
    marginTop: 8,
  },
  actions: {
    gap: 10,
  },
  guest: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  guestText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  signIn: {
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  signInText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 18,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
