import { Alert, Linking, Pressable, StyleSheet, Text } from 'react-native';

import { useSettingsStyles } from './settingsChrome';
import { colors } from './theme';

export const PRIVACY_POLICY_URL = 'https://platonstudio.de/talktome/privacy/';

export function PrivacyPolicyLink({ settings = false }: { settings?: boolean }) {
  const settingsStyles = useSettingsStyles();

  const openPolicy = async () => {
    try {
      await Linking.openURL(PRIVACY_POLICY_URL);
    } catch {
      Alert.alert(
        'Could not open Privacy Policy',
        `Open this address in your browser:\n${PRIVACY_POLICY_URL}`,
      );
    }
  };

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel="Privacy Policy"
      accessibilityHint="Opens the privacy policy website in your browser."
      onPress={() => void openPolicy()}
      style={settings ? settingsStyles.row : styles.link}
    >
      <Text style={settings ? settingsStyles.actionLabel : styles.label}>Privacy Policy</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  label: {
    color: colors.accent,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
