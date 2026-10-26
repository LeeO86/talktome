// Persist public build settings in eas.json so the EAS worker uses the same
// identity/version as the GitHub runner. Credentials stay in EAS, never here.
const fs = require('node:fs');
const path = require('node:path');
function prepareEasRelease(root = path.resolve(__dirname, '..'), env = process.env, platform = 'ios') {
  if (!['ios', 'android'].includes(platform)) throw new Error('Expected ios or android');
  const required = [
    'TALKTOME_EXPO_OWNER', 'TALKTOME_EAS_PROJECT_ID',
    'TALKTOME_MOBILE_VERSION', 'TALKTOME_MOBILE_BUILD_NUMBER',
    ...(platform === 'ios'
      ? ['TALKTOME_IOS_BUNDLE_IDENTIFIER', 'TALKTOME_APPLE_TEAM_ID']
      : ['TALKTOME_ANDROID_PACKAGE']),
  ];
  for (const key of required) {
    if (!env[key]) throw new Error(`Set ${key} before starting an EAS release`);
  }
  const identifier = platform === 'ios' ? env.TALKTOME_IOS_BUNDLE_IDENTIFIER : env.TALKTOME_ANDROID_PACKAGE;
  if (identifier.startsWith('com.example.') ||
      !/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_-]*)+$/.test(identifier) ||
      (platform === 'android' && (identifier.includes('-') || identifier.endsWith('.sideload')))) {
    throw new Error('Configure the publisher\'s registered app identifier');
  }
  if (platform === 'ios' && !/^[A-Z0-9]{10}$/.test(env.TALKTOME_APPLE_TEAM_ID)) {
    throw new Error('TALKTOME_APPLE_TEAM_ID must be a 10-character Apple team ID');
  }
  if (!/^\d+\.\d+\.\d+$/.test(env.TALKTOME_MOBILE_VERSION) ||
      !/^[1-9]\d*$/.test(env.TALKTOME_MOBILE_BUILD_NUMBER)) {
    throw new Error('Release version must be x.y.z and build number a positive integer');
  }
  const file = path.join(root, 'eas.json');
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  config.build.production.env = Object.fromEntries(required.map(key => [key, env[key]]));
  if (platform === 'ios' && env.APP_STORE_CONNECT_APP_ID) {
    if (!/^\d+$/.test(env.APP_STORE_CONNECT_APP_ID)) throw new Error('Invalid App Store Connect app ID');
    config.submit.production.ios.ascAppId = env.APP_STORE_CONNECT_APP_ID;
  } else if (platform === 'ios' && env.TALKTOME_IOS_SUBMIT === 'true') {
    throw new Error('Set APP_STORE_CONNECT_APP_ID before submitting');
  }
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
}

if (require.main === module) prepareEasRelease(undefined, process.env, process.argv[2] || 'ios');
module.exports = { prepareEasRelease };
