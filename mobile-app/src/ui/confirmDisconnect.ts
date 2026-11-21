import { Alert } from 'react-native';

import { session } from '../session/store';

export function confirmDisconnect(beforeDisconnect?: () => void): void {
  Alert.alert(
    'Disconnect?',
    'You will appear offline. Opening the app again reconnects you to this production.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: () => {
        beforeDisconnect?.();
        void session.disconnect();
      } },
    ],
    { cancelable: true },
  );
}
