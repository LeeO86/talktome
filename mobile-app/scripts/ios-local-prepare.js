const { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolveIosSigning } = require('./ios-signing');

const projectRoot = join(__dirname, '..');
const env = { ...process.env, TALKTOME_IOS_LOCAL: '1' };
resolveIosSigning(projectRoot, env);

// Xcode follows a moved workspace into the backup directory. Never move the
// native project while the app may still have it open.
if (process.platform === 'darwin' && spawnSync('/usr/bin/pgrep', ['-x', 'Xcode']).status === 0) {
  console.error('Quit Xcode (Cmd+Q) before running ios:local:prepare, then reopen ios/TalkToMe.xcworkspace afterwards. No files were changed.');
  process.exit(1);
}

const nativeRoot = join(projectRoot, 'ios');
const backupRoot = join(projectRoot, '.expo', 'ios-backups', new Date().toISOString().replace(/[:.]/g, '-'));
const hadNativeProject = existsSync(nativeRoot);
if (hadNativeProject) {
  mkdirSync(dirname(backupRoot), { recursive: true });
  renameSync(nativeRoot, backupRoot);
  console.log(`Previous native project saved in ${backupRoot}`);
}

// apple-targets currently fails while updating existing target configurations.
// Generate a fresh project, preserving the old one instead of deleting it.
const expoCli = join(dirname(require.resolve('expo/package.json')), 'bin', 'cli');
const result = spawnSync(process.execPath, [expoCli, 'prebuild', '--platform', 'ios', ...process.argv.slice(2)], {
  cwd: projectRoot,
  env,
  stdio: 'inherit',
});
if (result.status !== 0) {
  rmSync(nativeRoot, { recursive: true, force: true });
  if (hadNativeProject) renameSync(backupRoot, nativeRoot);
  process.exit(result.status || 1);
}

const envFile = join(nativeRoot, '.xcode.env.local');
const previousEnvFile = join(backupRoot, '.xcode.env.local');
const baseEnvFile = hadNativeProject && existsSync(previousEnvFile) ? previousEnvFile : envFile;
const previousEnv = existsSync(baseEnvFile) ? readFileSync(baseEnvFile, 'utf8') : '';
writeFileSync(envFile, `${previousEnv.trimEnd()}\nexport TALKTOME_IOS_LOCAL=1\n`);
// Device testing should open the app itself, rather than the Expo dev launcher.
const schemeFile = join(nativeRoot, 'TalkToMe.xcodeproj', 'xcshareddata', 'xcschemes', 'TalkToMe.xcscheme');
const scheme = readFileSync(schemeFile, 'utf8').replace(/<LaunchAction\b[\s\S]*?>/, (launch) => launch
  .replace(/buildConfiguration = "[^"]*"/, 'buildConfiguration = "Release"')
  .replace(/selectedDebuggerIdentifier = "[^"]*"/, 'selectedDebuggerIdentifier = ""')
  .replace(/selectedLauncherIdentifier = "[^"]*"/, 'selectedLauncherIdentifier = "Xcode.IDEFoundation.Launcher.PosixSpawn"'));
writeFileSync(schemeFile, scheme);
console.log('Local signing configured. Open ios/TalkToMe.xcworkspace and run the TalkToMe scheme on your iPhone.');
