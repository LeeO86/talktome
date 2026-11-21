#!/usr/bin/env node

const { appendFileSync, writeFileSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const SEMVER_PATTERN = /^(?:v)?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/;

function parseVersionTag(tag) {
  const match = String(tag || "").trim().match(SEMVER_PATTERN);
  if (!match) {
    throw new Error(`Invalid Talktome version tag: ${tag || "(empty)"}`);
  }
  return match[1];
}

function developmentVersion(baseVersion, distance, dirty) {
  const withoutBuildMetadata = baseVersion.split("+")[0];
  const separator = withoutBuildMetadata.includes("-") ? "." : "-";
  return `${withoutBuildMetadata}${separator}dev.${distance}${dirty ? ".dirty" : ""}`;
}

function createVersionInfo({ exactTag, baseTag, distance, sha, dirty = false }) {
  const baseVersion = parseVersionTag(exactTag || baseTag);
  const commitDistance = Number.parseInt(distance, 10);
  if (!Number.isInteger(commitDistance) || commitDistance < 0) {
    throw new Error(`Invalid commit distance: ${distance}`);
  }

  const shortSha = String(sha || "").trim();
  if (!/^[0-9a-f]+$/i.test(shortSha)) {
    throw new Error(`Invalid Git commit SHA: ${sha || "(empty)"}`);
  }

  const release = Boolean(exactTag) && commitDistance === 0 && !dirty;
  const appVersion = release
    ? parseVersionTag(exactTag)
    : developmentVersion(baseVersion, commitDistance, dirty);
  const version = `v${appVersion}`;
  const safeBase = version.replace(/[^0-9A-Za-z._-]/g, "-");

  return {
    version,
    appVersion,
    safeVersion: release ? safeBase : `${safeBase}-${shortSha}`,
    baseVersion,
    release,
    sha: shortSha,
    dirty,
    distance: commitDistance,
  };
}

function createPropagatedVersionInfo({ appVersion, safeVersion = "", sha = "" }) {
  const normalizedVersion = parseVersionTag(appVersion);
  const version = `v${normalizedVersion}`;
  const normalizedSha = /^[0-9a-f]+$/i.test(String(sha).trim())
    ? String(sha).trim().slice(0, 8)
    : "";
  const normalizedSafeVersion = String(safeVersion || version).replace(/[^0-9A-Za-z._-]/g, "-");

  return {
    version,
    appVersion: normalizedVersion,
    safeVersion: normalizedSafeVersion,
    baseVersion: normalizedVersion.split(/[+-]/)[0],
    release: !normalizedVersion.includes("-"),
    sha: normalizedSha,
    dirty: false,
    distance: 0,
  };
}

function git(args, options = {}) {
  try {
    return execFileSync("git", args, {
      cwd: options.cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    if (options.optional) return "";
    const detail = error.stderr ? String(error.stderr).trim() : error.message;
    throw new Error(`Git version resolution failed: ${detail}`);
  }
}

function resolveBuildVersion(options = {}) {
  const environment = options.environment || process.env;
  const propagatedVersion = String(environment.TALKTOME_BUILD_VERSION || "").trim();
  if (propagatedVersion) {
    return createPropagatedVersionInfo({
      appVersion: propagatedVersion,
      safeVersion: environment.TALKTOME_BUILD_SAFE_VERSION,
      sha: environment.GITHUB_SHA,
    });
  }

  const cwd = options.cwd || path.resolve(__dirname, "..");
  const runGit = options.runGit || ((args, runOptions = {}) => git(args, { cwd, ...runOptions }));
  const exactTag = runGit(
    ["describe", "--tags", "--match", "v[0-9]*", "--exact-match", "HEAD"],
    { optional: true },
  );
  const baseTag = exactTag || runGit(["describe", "--tags", "--match", "v[0-9]*", "--abbrev=0", "HEAD"]);
  const distance = runGit(["rev-list", "--count", `${baseTag}..HEAD`]);
  const sha = runGit(["rev-parse", "--short=8", "HEAD"]);
  const dirty = Boolean(runGit(["status", "--porcelain", "--untracked-files=no"]));

  return createVersionInfo({ exactTag, baseTag, distance, sha, dirty });
}

function appendGithubOutput(file, info) {
  appendFileSync(
    file,
    [
      `version=${info.version}`,
      `app_version=${info.appVersion}`,
      `safe_version=${info.safeVersion}`,
      `base_version=${info.baseVersion}`,
      `is_release=${info.release}`,
      `git_sha=${info.sha}`,
      "",
    ].join("\n"),
  );
}

function appendGithubEnv(file, info) {
  appendFileSync(
    file,
    [
      `VERSION=${info.version}`,
      `APP_VERSION=${info.appVersion}`,
      `SAFE_VERSION=${info.safeVersion}`,
      `BASE_VERSION=${info.baseVersion}`,
      `IS_RELEASE=${info.release}`,
      `VERSION_GIT_SHA=${info.sha}`,
      "",
    ].join("\n"),
  );
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    if (["--github-output", "--github-env", "--tauri-config", "--version-json"].includes(argument)) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a file path`);
      options[argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const info = resolveBuildVersion();

  if (options.githubOutput) appendGithubOutput(options.githubOutput, info);
  if (options.githubEnv) appendGithubEnv(options.githubEnv, info);
  if (options.tauriConfig) {
    writeFileSync(options.tauriConfig, `${JSON.stringify({ version: info.appVersion }, null, 2)}\n`);
  }
  if (options.versionJson) {
    writeFileSync(options.versionJson, `${JSON.stringify({ version: info.appVersion }, null, 2)}\n`);
  }

  if (
    options.json ||
    (!options.githubOutput && !options.githubEnv && !options.tauriConfig && !options.versionJson)
  ) {
    process.stdout.write(`${JSON.stringify(info, null, 2)}\n`);
  } else {
    process.stdout.write(`Resolved Talktome version ${info.appVersion}.\n`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  appendGithubEnv,
  appendGithubOutput,
  createPropagatedVersionInfo,
  createVersionInfo,
  developmentVersion,
  parseVersionTag,
  resolveBuildVersion,
};
