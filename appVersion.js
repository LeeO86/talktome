const { resolveBuildVersion } = require("./scripts/resolve-build-version");

function readPackageVersion() {
  try {
    return require("./package.json").version || "";
  } catch {
    // Package metadata may be unavailable in unusual embedded runtimes.
    return "";
  }
}

function readEmbeddedVersion() {
  try {
    return require("./build-version.json").version || "";
  } catch {
    // Generated only while building a packaged server executable.
    return "";
  }
}

function describeGitVersion() {
  try {
    return resolveBuildVersion({ cwd: __dirname }).appVersion;
  } catch {
    // Git metadata is not available in packaged installs and containers.
    return "";
  }
}

function resolveServerAppVersion({
  environment = process.env,
  packaged = Boolean(process.pkg),
  packageVersion = readPackageVersion,
  embeddedVersion = readEmbeddedVersion,
  gitVersion = describeGitVersion,
} = {}) {
  const releaseVersion = String(environment.TALKTOME_VERSION || "").trim();
  if (releaseVersion) return releaseVersion;

  if (packaged) {
    const generatedVersion = String(embeddedVersion() || "").trim();
    if (generatedVersion) return generatedVersion;
  }

  if (!packaged) {
    const describedVersion = String(gitVersion() || "").trim();
    if (describedVersion) return describedVersion;
  }

  const npmVersion = String(environment.npm_package_version || "").trim();
  if (npmVersion && npmVersion !== "0.0.0") return npmVersion;

  const fallbackVersion = String(packageVersion() || "").trim();
  return fallbackVersion && fallbackVersion !== "0.0.0" ? fallbackVersion : "unknown";
}

module.exports = { resolveServerAppVersion };
