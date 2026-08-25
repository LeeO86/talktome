const { withEntitlementsPlist, withInfoPlist, withXcodeProject } = require('expo/config-plugins');

const APP_GROUP = 'group.io.github.leeo86.talktome-mobile';
const LIVE_ACTIVITY_ATTRIBUTES = 'TalkToMePresenceAttributes';

function withTalkToMePresence(config) {
  config = withEntitlementsPlist(config, (mod) => {
    const groups = new Set(mod.modResults['com.apple.security.application-groups'] ?? []);
    groups.add(APP_GROUP);
    mod.modResults['com.apple.security.application-groups'] = [...groups];
    return mod;
  });

  config = withInfoPlist(config, (mod) => {
    mod.modResults.NSSupportsLiveActivities = true;
    mod.modResults.NSSupportsLiveActivitiesFrequentUpdates = true;
    return mod;
  });

  return withWatchLiveActivityLaunch(config);
}

function withWatchLiveActivityLaunch(config) {
  return withXcodeProject(config, (mod) => {
    const configs = mod.modResults.pbxXCBuildConfigurationSection();
    for (const entry of Object.values(configs)) {
      const settings = entry?.buildSettings;
      if (!settings || !isWatchAppBuildSettings(settings)) {
        continue;
      }
      settings.INFOPLIST_KEY_WKSupportsLiveActivityLaunchAttributeTypes = LIVE_ACTIVITY_ATTRIBUTES;
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
