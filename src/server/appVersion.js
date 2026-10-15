const { resolveBuildVersion } = require("../../scripts/resolve-build-version");
const { projectRoot } = require("./projectPaths");

function readPackageVersion() {
  try {
    return require("../../package.json").version || "";
  } catch {
    // Package metadata may be unavailable in unusual embedded runtimes.
    return "";
  }
}

function readEmbeddedVersion() {
  try {
    return require("../../build-version.json").version || "";
  } catch {
    // Generated while building a packaged executable or Docker image.
    return "";
  }
}

function describeGitVersion() {
  try {
    // Build-time propagation variables must not override the checked-out code
    // when a source installation is started from an existing shell/service.
    return resolveBuildVersion({ cwd: projectRoot, environment: {} }).appVersion;
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
  if (!packaged) {
    const describedVersion = String(gitVersion() || "").trim();
    if (describedVersion) return describedVersion;
  }

  // The running code is authoritative. A launcher or deployment environment
  // may still contain a version from an earlier installation.
  const generatedVersion = String(embeddedVersion() || "").trim();
  if (generatedVersion && generatedVersion !== "0.0.0") return generatedVersion;

  const releaseVersion = String(environment.TALKTOME_VERSION || "").trim();
  if (releaseVersion && releaseVersion !== "0.0.0") return releaseVersion;

  const npmVersion = String(environment.npm_package_version || "").trim();
  if (npmVersion && npmVersion !== "0.0.0") return npmVersion;

  const fallbackVersion = String(packageVersion() || "").trim();
  return fallbackVersion && fallbackVersion !== "0.0.0" ? fallbackVersion : "unknown";
}

module.exports = { resolveServerAppVersion };
