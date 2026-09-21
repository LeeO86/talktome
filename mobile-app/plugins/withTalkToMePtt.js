const { withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins');

function pttRequested(config) {
  return (
    process.env.EXPO_PUBLIC_ENABLE_IOS_PTT === '1' ||
    config.extra?.enableIosPtt === true
  );
}

function withTalkToMePtt(config) {
  if (!pttRequested(config)) {
    return config;
  }

  config = withEntitlementsPlist(config, (mod) => {
    mod.modResults['com.apple.developer.push-to-talk'] = true;
    // app.config.ts sets aps-environment from EXPO_PUBLIC_APNS_ENVIRONMENT.
    // Only fill the key when that config did not (local prebuild without the env var).
    if (!mod.modResults['aps-environment']) {
      mod.modResults['aps-environment'] =
        process.env.EXPO_PUBLIC_APNS_ENVIRONMENT === 'production' ? 'production' : 'development';
    }
    return mod;
  });

  config = withInfoPlist(config, (mod) => {
    const modes = new Set(mod.modResults.UIBackgroundModes ?? []);
    modes.add('audio');
    modes.add('push-to-talk');
    mod.modResults.UIBackgroundModes = [...modes];
    return mod;
  });

  return config;
}

module.exports = withTalkToMePtt;
