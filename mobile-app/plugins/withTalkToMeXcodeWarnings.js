const { withDangerousMod, withPodfile, withXcodeProject } = require('expo/config-plugins');

const { readFileSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');

const STRIP_PHASE = '[Expo Dev Launcher] Strip Local Network Keys for Release';
const POD_DEPLOYMENT_MARKER = '# talktome-pod-deployment-target';

function alignPodDeploymentTargets(contents) {
  if (contents.includes(POD_DEPLOYMENT_MARKER)) return contents;
  const hook = 'post_install do |installer|';
  if (!contents.includes(hook)) {
    throw new Error('Podfile is missing post_install; update withTalkToMeXcodeWarnings.js');
  }
  return contents.replace(hook, `${hook}
    ${POD_DEPLOYMENT_MARKER}
    # Resource bundles can retain older podspec minimums rejected by newer Xcode SDKs.
    minimum_ios = Gem::Version.new(podfile_properties['ios.deploymentTarget'] || '16.4')
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current && Gem::Version.new(current) < minimum_ios
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = minimum_ios.to_s
        end
      end
    end
`);
}

function withTalkToMeXcodeWarnings(config) {
  config = withDangerousMod(config, ['ios', async mod => {
    // Xcode 27 can turn diagnostics from a nested quiet Swift build into a
    // spurious archive error, even when that command exits successfully.
    // Keep the diagnostics visible; no errors or exit statuses are suppressed.
    // https://github.com/expo/expo/issues/50311
    const packageRoot = dirname(require.resolve('expo-modules-jsi/package.json', {
      paths: [mod.modRequest.projectRoot],
    }));
    const script = join(packageRoot, 'apple/scripts/build-xcframework.sh');
    const before = readFileSync(script, 'utf8');
    const after = before.replace(/^[ \t]*-quiet \\\r?\n/gm, '');
    if (after !== before) writeFileSync(script, after);
    return mod;
  }]);
  config = withPodfile(config, (mod) => {
    mod.modResults.contents = alignPodDeploymentTargets(mod.modResults.contents);
    return mod;
  });
  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    markStripPhaseAlwaysOutOfDate(project);
    removeDuplicateCxxLinkFlag(project);
    return mod;
  });
}

function markStripPhaseAlwaysOutOfDate(project) {
  const phases = project.hash.project.objects.PBXShellScriptBuildPhase ?? {};
  for (const phase of Object.values(phases)) {
    if (!phase || typeof phase !== 'object') {
      continue;
    }
    const name = String(phase.name ?? '').replace(/^"|"$/g, '');
    if (name === STRIP_PHASE) {
      phase.alwaysOutOfDate = 1;
    }
  }
}

function removeDuplicateCxxLinkFlag(project) {
  const configs = project.pbxXCBuildConfigurationSection();
  for (const config of Object.values(configs)) {
    const flags = config?.buildSettings?.OTHER_LDFLAGS;
    if (!flags) {
      continue;
    }
    const next = normalizeLdFlags(flags).filter((flag) => !isCxxStdlibFlag(flag));
    config.buildSettings.OTHER_LDFLAGS = serializeLdFlags(next);
  }
}

function normalizeLdFlags(flags) {
  const list = Array.isArray(flags) ? flags.flatMap(splitLdFlags) : splitLdFlags(flags);
  return list.map(unquoteLdFlag).filter(Boolean);
}

function splitLdFlags(value) {
  const tokens = [];
  const source = String(value).trim();
  const token = /"([^"]*)"|[^\s]+/g;
  let match;
  while ((match = token.exec(source))) {
    tokens.push(match[1] ?? match[0]);
  }
  return tokens;
}

function unquoteLdFlag(flag) {
  return String(flag).replace(/^"+|"+$/g, '').trim();
}

function serializeLdFlags(flags) {
  const unique = [];
  for (const flag of flags) {
    if (flag === '$(inherited)' || flag === '"$(inherited)"' || unique.includes(flag)) {
      continue;
    }
    unique.push(quoteLdFlag(flag));
  }
  // node-xcode expects "$(inherited)" quoted as an array entry. An unquoted
  // $(inherited) is parsed as $ { 0 = inherited; } and the EAS archive fails.
  return ['"$(inherited)"', ...unique];
}

function quoteLdFlag(flag) {
  if (flag.startsWith('"') && flag.endsWith('"')) {
    return flag;
  }
  if (/[\s$()]/.test(flag)) {
    return `"${flag}"`;
  }
  return flag;
}

function isCxxStdlibFlag(flag) {
  return flag === '-lc++' || flag === '-lcxx' || flag === '-l"c++"';
}

module.exports = withTalkToMeXcodeWarnings;
module.exports.alignPodDeploymentTargets = alignPodDeploymentTargets;
