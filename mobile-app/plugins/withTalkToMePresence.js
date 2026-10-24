const { withEntitlementsPlist, withInfoPlist, withXcodeProject } = require('expo/config-plugins');

const LIVE_ACTIVITY_ATTRIBUTES = 'TalkToMePresenceAttributes';

function withTalkToMePresence(config) {
  const appGroup = `group.${config.ios.bundleIdentifier}`;
  config = withEntitlementsPlist(config, (mod) => {
    const groups = new Set(mod.modResults['com.apple.security.application-groups'] ?? []);
    groups.add(appGroup);
    mod.modResults['com.apple.security.application-groups'] = [...groups];
    return mod;
  });

  config = withInfoPlist(config, (mod) => {
    mod.modResults.NSSupportsLiveActivities = true;
    mod.modResults.NSSupportsLiveActivitiesFrequentUpdates = true;
    mod.modResults.TalkToMeAppGroup = appGroup;
    return mod;
  });

  return withWatchLiveActivityLaunch(config, appGroup);
}

function withWatchLiveActivityLaunch(config, appGroup) {
  return withXcodeProject(config, (mod) => {
    const configs = mod.modResults.pbxXCBuildConfigurationSection();
    for (const entry of Object.values(configs)) {
      const settings = entry?.buildSettings;
      if (!settings) {
        continue;
      }
      settings.TALKTOME_APP_GROUP = appGroup;
      if (isWatchAppBuildSettings(settings)) {
        settings.INFOPLIST_KEY_WKSupportsLiveActivityLaunchAttributeTypes = LIVE_ACTIVITY_ATTRIBUTES;
      }
    }
    return mod;
  });
}

function isWatchAppBuildSettings(settings) {
  return unquote(settings.SDKROOT) === 'watchos' && Boolean(settings.INFOPLIST_KEY_WKCompanionAppBundleIdentifier);
}

function unquote(value) {
  return String(value ?? '').replace(/^"+|"+$/g, '');
}

module.exports = withTalkToMePresence;
