const { readFileSync } = require('node:fs');
const { join } = require('node:path');

/** Personal signing is opt-in; normal builds never read this machine's overrides. */
function resolveIosSigning(projectRoot, env = process.env) {
  if (env.TALKTOME_IOS_LOCAL !== '1') {
    return {
      local: false,
      bundleIdentifier: env.TALKTOME_IOS_BUNDLE_IDENTIFIER || 'com.example.talktome',
      appleTeamId: env.TALKTOME_APPLE_TEAM_ID || undefined,
      appGroup: `group.${env.TALKTOME_IOS_BUNDLE_IDENTIFIER || 'com.example.talktome'}`,
    };
  }

  let local;
  try {
    local = JSON.parse(readFileSync(join(projectRoot, 'ios.local.json'), 'utf8'));
  } catch {
    throw new Error('Local iOS signing requires ios.local.json. Copy ios.local.example.json and enter your own bundleIdentifier and appleTeamId.');
  }
  if (
    !local ||
    typeof local.bundleIdentifier !== 'string' ||
    !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(local.bundleIdentifier) ||
    local.bundleIdentifier === (env.TALKTOME_IOS_BUNDLE_IDENTIFIER || 'com.example.talktome') ||
    typeof local.appleTeamId !== 'string' ||
    !/^[A-Z0-9]{10}$/.test(local.appleTeamId)
  ) {
    throw new Error('ios.local.json must contain your own bundleIdentifier and a 10-character appleTeamId.');
  }
  return {
    local: true,
    bundleIdentifier: local.bundleIdentifier,
    appleTeamId: local.appleTeamId,
    appGroup: `group.${local.bundleIdentifier}`,
  };
}

module.exports = { resolveIosSigning };
