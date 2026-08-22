const { withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins');

const APP_GROUP = 'group.io.github.leeo86.talktome-mobile';

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

  return config;
}

module.exports = withTalkToMePresence;
