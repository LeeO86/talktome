const fs = require("node:fs");
const path = require("node:path");

function isLinuxMusl(report = process.report) {
  if (process.platform !== "linux") return false;
  try {
    return !report?.getReport?.()?.header?.glibcVersionRuntime;
  } catch {
    return false;
  }
}

function getBetterSqliteTarget({
  platform = process.platform,
  arch = process.arch,
  linuxMusl = platform === "linux" && isLinuxMusl(),
} = {}) {
  const supportedPlatforms = new Set(["darwin", "linux", "win32"]);
  const supportedArchitectures = new Set(["arm64", "x64"]);
  if (!supportedPlatforms.has(platform) || !supportedArchitectures.has(arch)) {
    return null;
  }
  const platformName = platform === "linux" && linuxMusl ? "linuxmusl" : platform;
  return `${platformName}-${arch}`;
}

function getBetterSqlitePackageRoot() {
  return path.dirname(require.resolve("better-sqlite3/package.json"));
}

function getBetterSqliteBindingCandidates({
  packageRoot = getBetterSqlitePackageRoot(),
  platform = process.platform,
  arch = process.arch,
  linuxMusl = platform === "linux" && isLinuxMusl(),
} = {}) {
  const target = getBetterSqliteTarget({ platform, arch, linuxMusl });
  const candidates = [];
  if (target) {
    candidates.push(path.join(packageRoot, "prebuilds", `${target}.node`));
  }
  // Kept as a fallback and as the canonical location staged for pkg builds.
  candidates.push(path.join(packageRoot, "build", "Release", "better_sqlite3.node"));
  return candidates;
}

function resolveBetterSqliteBinding(options = {}) {
  const candidates = getBetterSqliteBindingCandidates(options);
  const sourcePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!sourcePath) {
    throw new Error(`better_sqlite3.node is missing. Checked: ${candidates.join(", ")}`);
  }
  return sourcePath;
}

module.exports = {
  getBetterSqliteBindingCandidates,
  getBetterSqlitePackageRoot,
  getBetterSqliteTarget,
  isLinuxMusl,
  resolveBetterSqliteBinding,
};
