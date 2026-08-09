const childProcess = require("child_process");

function readPackageVersion() {
  try {
    return require("./package.json").version || "";
  } catch {
    // Package metadata may be unavailable in unusual embedded runtimes.
    return "";
  }
}

function describeGitVersion() {
  try {
    return childProcess.execFileSync(
      "git",
      ["describe", "--tags", "--always", "--dirty"],
      {
        cwd: __dirname,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 1000,
      }
    ).trim();
  } catch {
    // Git metadata is not available in packaged installs and containers.
    return "";
  }
}

function resolveServerAppVersion({
  environment = process.env,
  packaged = Boolean(process.pkg),
  packageVersion = readPackageVersion,
  gitVersion = describeGitVersion,
} = {}) {
  const releaseVersion = String(environment.TALKTOME_VERSION || "").trim();
  if (releaseVersion) return releaseVersion;

  if (!packaged) {
    const describedVersion = String(gitVersion() || "").trim();
    if (describedVersion) return describedVersion;
  }

  const npmVersion = String(environment.npm_package_version || "").trim();
  if (npmVersion) return npmVersion;

  return String(packageVersion() || "").trim() || "unknown";
}

module.exports = { resolveServerAppVersion };
