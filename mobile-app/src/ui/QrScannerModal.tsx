import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { colors } from './theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onScanned: (value: string) => void;
};

export function QrScannerModal({ visible, onClose, onScanned }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (visible) {
      setLocked(false);
      if (permission && !permission.granted && permission.canAskAgain) {
        void requestPermission();
      }
    }
  }, [visible, permission, requestPermission]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        {!permission?.granted ? (
          <View style={styles.message}>
            <Text style={styles.title}>Camera access</Text>
            <Text style={styles.body}>
              TalkToMe uses the camera to scan a server QR from the admin portal or a personal login
              link.
            </Text>
            <Pressable
              accessibilityRole="button"
              style={styles.action}
              onPress={() => {
                if (permission?.canAskAgain === false) {
                  void Linking.openSettings();
                  return;
                }
                void requestPermission();
              }}
            >
              <Text style={styles.actionText}>
                {permission?.canAskAgain === false ? 'Open Settings' : 'Allow camera'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={
                locked
                  ? undefined
                  : ({ data }) => {
                      const value = data.trim();
                      if (!value) {
                        return;
                      }
                      setLocked(true);
                      onScanned(value);
                    }
              }
            />
            <View style={styles.overlay} pointerEvents="none">
              <View style={styles.frame} />
              <Text style={styles.hint}>Point at a TalkToMe QR code</Text>
            </View>
          </>
        )}
        <Pressable accessibilityRole="button" style={styles.cancel} onPress={onClose}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'flex-end',
  },
  message: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  body: {
    color: colors.muted,
    marginTop: 12,
    fontSize: 16,
    lineHeight: 22,
  },
  action: {
    marginTop: 24,
    backgroundColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  actionText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: 240,
    height: 240,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  hint: {
    color: '#FFFFFF',
    marginTop: 20,
    fontSize: 16,
    fontWeight: '600',
  },
  cancel: {
    marginHorizontal: 24,
    marginBottom: 40,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  cancelText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
});
