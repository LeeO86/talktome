const { withXcodeProject } = require('expo/config-plugins');

const STRIP_PHASE = '[Expo Dev Launcher] Strip Local Network Keys for Release';

function withTalkToMeXcodeWarnings(config) {
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
