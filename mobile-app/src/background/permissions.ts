import { PermissionsAndroid, Platform, type Permission } from 'react-native';

function permission(name: keyof typeof PermissionsAndroid.PERMISSIONS): Permission | null {
  return PermissionsAndroid.PERMISSIONS[name] ?? null;
}

async function request(names: Array<Permission | null>): Promise<void> {
  const wanted = names.filter((name): name is Permission => Boolean(name));
  if (wanted.length === 0 || Platform.OS !== 'android') {
    return;
  }
  try {
    await PermissionsAndroid.requestMultiple(wanted);
  } catch {
    // Native start/scan still reports the real failure.
  }
}

export async function requestAndroidSessionPermissions(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  const sdk = typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);
  await request([
    permission('RECORD_AUDIO'),
    sdk >= 33 ? permission('POST_NOTIFICATIONS') : null,
  ]);
}

export async function requestAndroidBlePermissions(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  const sdk = typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);
  if (sdk >= 31) {
    await request([permission('BLUETOOTH_SCAN'), permission('BLUETOOTH_CONNECT')]);
    return;
  }
  await request([permission('ACCESS_FINE_LOCATION')]);
}
