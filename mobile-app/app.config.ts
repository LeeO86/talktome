import type { ExpoConfig } from 'expo/config';

const enableIosPtt = process.env.EXPO_PUBLIC_ENABLE_IOS_PTT === '1';

const config: ExpoConfig = {
  name: 'TalkToMe',
  slug: 'talktome-mobile',
  version: '0.1.0',
  orientation: 'default',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  scheme: 'talktome',
  ios: {
    supportsTablet: true,
    icon: './assets/icon.png',
    bundleIdentifier: 'io.github.leeo86.talktome-mobile',
    buildNumber: '14',
    appleTeamId: '4876GGFAH9',
    entitlements: {
      'com.apple.security.application-groups': ['group.io.github.leeo86.talktome-mobile'],
      ...(enableIosPtt
        ? {
            'com.apple.developer.push-to-talk': true,
            'aps-environment': 'development',
          }
        : {}),
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
      UIBackgroundModes: enableIosPtt
        ? ['audio', 'bluetooth-central', 'push-to-talk']
        : ['audio', 'bluetooth-central'],
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
    versionCode: 14,
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
    './plugins/withTalkToMePtt',
    './plugins/withTalkToMeOrientation',
    './plugins/withTalkToMePresence',
    './plugins/withTalkToMeXcodeWarnings',
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
    enableIosPtt,
    eas: {
      projectId: 'ae071885-3a15-4e42-950f-101152ef28be',
    },
  },
};

export default config;
