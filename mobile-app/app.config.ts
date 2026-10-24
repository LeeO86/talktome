import type { ExpoConfig } from 'expo/config';

const { resolveIosSigning } = require('./scripts/ios-signing');
const iosSigning = resolveIosSigning(__dirname);

const config: ExpoConfig = {
  name: 'TalkToMe',
  slug: 'talktome-mobile',
  version: '1.0.0',
  orientation: 'default',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  scheme: 'talktome',
  ios: {
    supportsTablet: true,
    icon: './assets/icon.png',
    bundleIdentifier: iosSigning.bundleIdentifier,
    buildNumber: '29',
    appleTeamId: iosSigning.appleTeamId,
    entitlements: {
      'com.apple.security.application-groups': [iosSigning.appGroup],
    },
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSMicrophoneUsageDescription:
        'TalkToMe uses the microphone so you can talk to other operators.',
      NSLocalNetworkUsageDescription:
        'TalkToMe connects to your self-hosted intercom on the local network.',
      NSBluetoothAlwaysUsageDescription: 'TalkToMe connects to wireless PTT buttons and speaker mics.',
      NSCameraUsageDescription: 'TalkToMe uses the camera to scan server and login QR codes.',
      NSAppTransportSecurity: {
        NSAllowsLocalNetworking: true,
      },
      NSSupportsLiveActivities: true,
      NSSupportsLiveActivitiesFrequentUpdates: true,
      UIBackgroundModes: ['audio', 'bluetooth-central'],
      UISupportedInterfaceOrientations: [
        'UIInterfaceOrientationPortrait',
        'UIInterfaceOrientationLandscapeLeft',
        'UIInterfaceOrientationLandscapeRight',
      ],
      'UISupportedInterfaceOrientations~ipad': [
        'UIInterfaceOrientationPortrait',
        'UIInterfaceOrientationPortraitUpsideDown',
        'UIInterfaceOrientationLandscapeLeft',
        'UIInterfaceOrientationLandscapeRight',
      ],
    },
  },
  android: {
    // Android Java packages cannot contain a hyphen.
    package: 'io.github.leeo86.talktomemobile',
    versionCode: 28,
    adaptiveIcon: {
      backgroundColor: '#000000',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    permissions: [
      'RECORD_AUDIO',
      'MODIFY_AUDIO_SETTINGS',
      'INTERNET',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_MICROPHONE',
      'FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      'FOREGROUND_SERVICE_CONNECTED_DEVICE',
      'POST_NOTIFICATIONS',
      'BLUETOOTH',
      'BLUETOOTH_ADMIN',
      'BLUETOOTH_SCAN',
      'BLUETOOTH_CONNECT',
      'ACCESS_FINE_LOCATION',
      'CAMERA',
    ],
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    '@bacons/apple-targets',
    '@preeternal/react-native-cookie-manager',
    [
      '@config-plugins/react-native-webrtc',
      {
        cameraPermission:
          'TalkToMe uses the camera to scan server and login QR codes.',
        microphonePermission:
          'TalkToMe uses the microphone so you can talk to other operators.',
      },
    ],
    './plugins/withTalkToMeJitsiWebrtc',
    './plugins/withTalkToMeFgs',
    [
      'expo-camera',
      {
        cameraPermission: 'TalkToMe uses the camera to scan server and login QR codes.',
        recordAudioAndroid: false,
        barcodeScannerEnabled: true,
      },
    ],
    './plugins/withTalkToMeBle',
    './plugins/withTalkToMeOrientation',
    './plugins/withTalkToMePresence',
    './plugins/withTalkToMeXcodeWarnings',
    ...(iosSigning.local || process.env.TALKTOME_IOS_SCENES === '1'
      ? ['./plugins/withTalkToMeScenes']
      : []),
    [
      'expo-splash-screen',
      {
        backgroundColor: '#000000',
        image: './assets/splash-icon.png',
        resizeMode: 'contain',
        imageWidth: 200,
      },
    ],
    './plugins/withTalkToMeSplash',
    './plugins/withTalkToMeAndroidIcons',
  ],
  extra: {
    eas: {
      projectId: 'ae071885-3a15-4e42-950f-101152ef28be',
    },
  },
};

export default config;
