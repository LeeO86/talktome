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
    if (next.length === 0) {
      continue;
    }
    config.buildSettings.OTHER_LDFLAGS = next;
  }
}

function normalizeLdFlags(flags) {
  const list = Array.isArray(flags) ? flags : [flags];
  return list.map((flag) => String(flag).replace(/^"+|"+$/g, '')).filter(Boolean);
}

function isCxxStdlibFlag(flag) {
  return flag === '-lc++' || flag === '-lcxx' || flag === '-l"c++"';
}

module.exports = withTalkToMeXcodeWarnings;
