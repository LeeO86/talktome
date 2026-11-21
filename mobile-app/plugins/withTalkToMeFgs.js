const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const SERVICE_NAME = 'expo.modules.talktomefgs.TalkToMeForegroundService';
const SERVICE_TYPES = 'microphone|mediaPlayback|connectedDevice';

const PERMISSIONS = [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.WAKE_LOCK',
];

function upsertService(androidManifest) {
  const application = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  application.service = application.service ?? [];
  const existing = application.service.find((service) => service.$?.['android:name'] === SERVICE_NAME);
  const next = {
    $: {
      'android:name': SERVICE_NAME,
      'android:exported': 'false',
      'android:foregroundServiceType': SERVICE_TYPES,
      // Must match modules/foreground-service/.../AndroidManifest.xml (a
      // mismatch fails the APK manifest merge). `false` so a recents swipe
      // reaches onTaskRemoved, which disconnects and ends the process.
      'android:stopWithTask': 'false',
    },
  };
  if (existing) {
    existing.$ = { ...existing.$, ...next.$ };
  } else {
    application.service.push(next);
  }
  return androidManifest;
}

function withTalkToMeFgs(config) {
  config = AndroidConfig.Permissions.withPermissions(config, PERMISSIONS);
  return withAndroidManifest(config, (mod) => {
    mod.modResults = upsertService(mod.modResults);
    return mod;
  });
}

module.exports = withTalkToMeFgs;
