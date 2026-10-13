const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveServerAppVersion } = require("./appVersion");

test("explicit release version is a fallback when build metadata is unavailable", () => {
  const version = resolveServerAppVersion({
    environment: {
      TALKTOME_VERSION: "1.2.0",
      npm_package_version: "0.0.0",
    },
    packaged: false,
    packageVersion: () => "0.0.0",
    gitVersion: () => "",
    embeddedVersion: () => "",
  });

  assert.equal(version, "1.2.0");
});

test("source installs use Git metadata despite stale runtime and embedded versions", () => {
  const version = resolveServerAppVersion({
    environment: { TALKTOME_VERSION: "1.5.9", npm_package_version: "1.5.9" },
    packaged: false,
    packageVersion: () => "0.0.0",
    gitVersion: () => "1.2.0-dev.2.dirty",
    embeddedVersion: () => "1.5.9",
  });

  assert.equal(version, "1.2.0-dev.2.dirty");
});

test("packaged builds use their generated Git version", () => {
  const version = resolveServerAppVersion({
    environment: { TALKTOME_VERSION: "1.5.9", npm_package_version: "1.5.9" },
    packaged: true,
    embeddedVersion: () => "1.2.0-dev.2",
    packageVersion: () => "0.0.0",
    gitVersion: () => {
      throw new Error("Git must not be queried for packaged builds");
    },
  });

  assert.equal(version, "1.2.0-dev.2");
});

test("Docker and Git-less installs use the embedded version despite stale environment values", () => {
  assert.equal(resolveServerAppVersion({
    environment: { TALKTOME_VERSION: "1.5.9", npm_package_version: "1.5.9" },
    packaged: false,
    gitVersion: () => "",
    embeddedVersion: () => "1.5.13",
    packageVersion: () => "0.0.0",
  }), "1.5.13");
});

test("a source server ignores build-time propagation variables at runtime", () => {
  const { execFileSync } = require('node:child_process');
  const { resolveBuildVersion } = require('./scripts/resolve-build-version');
  const cwd = __dirname;
  const expected = resolveBuildVersion({ cwd, environment: {} }).appVersion;
  const actual = execFileSync(process.execPath, ['server.js', '--version'], {
    cwd, encoding: 'utf8',
    env: { ...process.env, TALKTOME_VERSION: '1.5.9', TALKTOME_BUILD_VERSION: '1.5.9', npm_package_version: '1.5.9' },
  }).trim();
  assert.equal(actual, expected);
});

test("generated Docker build metadata survives stale runtime overrides without Git", t => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { execFileSync } = require('node:child_process');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'talktome-image-version-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  fs.mkdirSync(path.join(cwd, 'scripts'));
  for (const file of ['appVersion.js', 'scripts/resolve-build-version.js']) {
    fs.copyFileSync(path.join(__dirname, file), path.join(cwd, file));
  }
  fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ version: '0.0.0' }));
  execFileSync(process.execPath, ['scripts/resolve-build-version.js', '--version-json', 'build-version.json'], {
    cwd, env: { ...process.env, TALKTOME_BUILD_VERSION: '1.5.13' },
  });
  const actual = execFileSync(process.execPath, ['-e', 'process.stdout.write(require("./appVersion").resolveServerAppVersion())'], {
    cwd, encoding: 'utf8',
    env: { ...process.env, TALKTOME_VERSION: '1.5.9', TALKTOME_BUILD_VERSION: '1.5.9', npm_package_version: '1.5.9' },
  });
  assert.equal(actual, '1.5.13');
});

test("the neutral manifest placeholder is never reported as an app version", () => {
  const version = resolveServerAppVersion({
    environment: { TALKTOME_VERSION: "0.0.0", npm_package_version: "0.0.0" },
    packaged: true,
    embeddedVersion: () => "0.0.0",
    packageVersion: () => "0.0.0",
  });

  assert.equal(version, "unknown");
});
