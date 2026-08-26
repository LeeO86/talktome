import { PermissionsAndroid, Platform, type Permission } from 'react-native';

import { androidSessionPermissionKeys, isAndroidPermissionGranted } from './permissionsPolicy';

function permission(name: keyof typeof PermissionsAndroid.PERMISSIONS): Permission | null {
  return PermissionsAndroid.PERMISSIONS[name] ?? null;
}

function androidSdk(): number {
  return typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);
}

async function request(names: Array<Permission | null>): Promise<Record<string, string>> {
  const wanted = names.filter((name): name is Permission => Boolean(name));
  if (wanted.length === 0 || Platform.OS !== 'android') {
    return {};
  }
  try {
    return await PermissionsAndroid.requestMultiple(wanted);
  } catch {
    return {};
  }
}

export async function requestAndroidSessionPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const record = permission('RECORD_AUDIO');
  const results = await request([
    ...androidSessionPermissionKeys(androidSdk()).map((name) => permission(name)),
  ]);
  if (isAndroidPermissionGranted(results, record)) {
    return true;
  }
  if (!record) {
    return true;
  }
  try {
    return await PermissionsAndroid.check(record);
  } catch {
    return false;
  }
}

export async function requestAndroidBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const sdk = androidSdk();
  if (sdk >= 31) {
    const scan = permission('BLUETOOTH_SCAN');
    const connect = permission('BLUETOOTH_CONNECT');
    const results = await request([scan, connect]);
    return isAndroidPermissionGranted(results, scan) && isAndroidPermissionGranted(results, connect);
  }
  const location = permission('ACCESS_FINE_LOCATION');
  const results = await request([location]);
  return isAndroidPermissionGranted(results, location);
}

export { androidSessionPermissionKeys, isAndroidPermissionGranted } from './permissionsPolicy';
