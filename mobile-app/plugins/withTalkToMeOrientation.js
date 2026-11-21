const { AndroidConfig, withAndroidManifest, withInfoPlist } = require('expo/config-plugins');

const IPHONE_ORIENTATIONS = [
  'UIInterfaceOrientationPortrait',
  'UIInterfaceOrientationLandscapeLeft',
  'UIInterfaceOrientationLandscapeRight',
];

const IPAD_ORIENTATIONS = [
  'UIInterfaceOrientationPortrait',
  'UIInterfaceOrientationPortraitUpsideDown',
  'UIInterfaceOrientationLandscapeLeft',
  'UIInterfaceOrientationLandscapeRight',
];

function withTalkToMeOrientation(config) {
  config.orientation = 'default';
  config = withInfoPlist(config, (mod) => {
    mod.modResults.UISupportedInterfaceOrientations = IPHONE_ORIENTATIONS;
    mod.modResults['UISupportedInterfaceOrientations~ipad'] = IPAD_ORIENTATIONS;
    return mod;
  });
  return withAndroidManifest(config, (mod) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults);
    activity.$['android:screenOrientation'] = 'fullUser';
    activity.$['android:configChanges'] = mergeConfigChanges(activity.$['android:configChanges']);
    return mod;
  });
}

function mergeConfigChanges(current) {
  const needed = ['keyboard', 'keyboardHidden', 'orientation', 'screenSize', 'screenLayout', 'uiMode'];
  const existing = String(current || '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set([...existing, ...needed])].join('|');
}

module.exports = withTalkToMeOrientation;
