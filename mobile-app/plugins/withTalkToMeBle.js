const { AndroidConfig, withAndroidManifest, withInfoPlist } = require('expo/config-plugins');

const PERMISSIONS = [
  'android.permission.BLUETOOTH',
  'android.permission.BLUETOOTH_ADMIN',
  'android.permission.BLUETOOTH_SCAN',
  'android.permission.BLUETOOTH_CONNECT',
  'android.permission.ACCESS_FINE_LOCATION',
];

function withNeverForLocation(androidManifest) {
  const manifest = androidManifest.manifest;
  const usesPermissions = manifest['uses-permission'] ?? [];
  for (const entry of usesPermissions) {
    if (entry.$?.['android:name'] === 'android.permission.BLUETOOTH_SCAN') {
      entry.$['android:usesPermissionFlags'] = 'neverForLocation';
    }
  }
  manifest['uses-permission'] = usesPermissions;
  return androidManifest;
}

function withTalkToMeBle(config) {
  config = AndroidConfig.Permissions.withPermissions(config, PERMISSIONS);
  config = withAndroidManifest(config, (mod) => {
    mod.modResults = withNeverForLocation(mod.modResults);
    return mod;
  });
  config = withInfoPlist(config, (mod) => {
    const modes = new Set(mod.modResults.UIBackgroundModes ?? []);
    modes.add('audio');
    modes.add('bluetooth-central');
    mod.modResults.UIBackgroundModes = [...modes];
    mod.modResults.NSBluetoothAlwaysUsageDescription =
      mod.modResults.NSBluetoothAlwaysUsageDescription ??
      'TalkToMe connects to wireless PTT buttons and speaker mics.';
    return mod;
  });
  return config;
}

module.exports = withTalkToMeBle;
